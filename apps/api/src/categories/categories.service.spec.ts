import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CategoriesModule } from './categories.module';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: CategoriesService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri()), CategoriesModule],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  it('finds a category by id', async () => {
    const created = await service.create({
      key: 'aptitude',
      name: 'General Aptitude',
      description: '',
      scoringMode: 'correctness',
    });
    const found = await service.findById(created.id);
    expect(found?.key).toBe('aptitude');
  });
});
