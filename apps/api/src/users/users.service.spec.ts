import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { User } from './user.schema';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: UsersService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri()), UsersModule],
    }).compile();
    service = moduleRef.get(UsersService);
    // The E11000 race test needs the unique email index to exist; mongoose
    // builds it in the background, so under load a create can beat it. init()
    // resolves once index builds for the model have completed.
    await (service as unknown as { userModel: Model<User> }).userModel.init();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  it('creates a user with hashed password and candidate default role', async () => {
    const user = await service.create({ email: 'A@B.co', password: 'password123', name: 'Ada' });
    expect(user.email).toBe('a@b.co'); // lowercased
    expect(user.role).toBe('candidate');
    expect(user.passwordHash).not.toContain('password123');
  });

  it('rejects duplicate emails', async () => {
    await expect(
      service.create({ email: 'a@b.co', password: 'password123', name: 'Ada 2' }),
    ).rejects.toThrow('Email already registered');
  });

  it('finds by email case-insensitively', async () => {
    const found = await service.findByEmail('A@b.CO');
    expect(found?.name).toBe('Ada');
  });

  it('finds by id', async () => {
    const ada = await service.findByEmail('a@b.co');
    const found = await service.findById(ada!.id);
    expect(found?.email).toBe('a@b.co');
  });

  it('maps a unique-index duplicate error to 409 when the pre-check races', async () => {
    // Simulate the TOCTOU window: the findOne pre-check misses, the unique
    // index still fires E11000 — must surface as ConflictException, not 500.
    const model = (service as unknown as { userModel: Model<User> }).userModel;
    const spy = jest
      .spyOn(model, 'findOne')
      .mockReturnValue({ lean: () => Promise.resolve(null) } as never);
    try {
      await expect(
        service.create({ email: 'a@b.co', password: 'password123', name: 'Racer' }),
      ).rejects.toThrow('Email already registered');
    } finally {
      spy.mockRestore();
    }
  });
});
