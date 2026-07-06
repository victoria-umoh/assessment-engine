import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { Role, UpdateUserDto } from '@lms/shared';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(input: { email: string; password: string; name: string; role?: Role }): Promise<UserDocument> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email }).lean();
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await argon2.hash(input.password);
    try {
      return await this.userModel.create({ email, passwordHash, name: input.name, role: input.role ?? Role.Candidate });
    } catch (err) {
      // Unique index fires when a concurrent create wins the race past the pre-check.
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async listAdmin(filter: {
    role?: string;
    status?: string;
    q?: string;
    after?: string;
    limit?: number;
  }): Promise<{ items: UserDocument[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};
    if (filter.role) query.role = filter.role;
    if (filter.status) query.status = filter.status;
    if (filter.q) {
      const escaped = filter.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { email: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.userModel.find(query).sort({ _id: 1 }).limit(limit).exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  async adminUpdate(actorId: string, id: string, dto: UpdateUserDto): Promise<UserDocument> {
    // Compare as ObjectIds, not strings — hex ids are case-insensitive to
    // Mongo, so an uppercased URL id must not slip past the self-guard.
    const isSelf = Types.ObjectId.isValid(id) && new Types.ObjectId(id).equals(actorId);
    if (isSelf && (dto.role !== undefined || dto.status !== undefined)) {
      throw new BadRequestException('Cannot change your own role or status');
    }
    const update: Record<string, unknown> = { ...dto };
    // Disabling must kill live refresh sessions; the 15-min access token is
    // the only remaining tail. Login already rejects non-active users.
    if (dto.status === 'disabled') update.sessions = [];
    const doc = Types.ObjectId.isValid(id)
      ? await this.userModel.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      : null;
    if (!doc) throw new NotFoundException('User not found');
    return doc;
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * Atomically removes the matching live session (refresh rotation). Exactly one
   * concurrent caller gets the user back; losers get null (token already claimed).
   */
  claimSession(userId: string, tokenHash: string): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(
        { _id: userId, sessions: { $elemMatch: { tokenHash, expiresAt: { $gt: new Date() } } } },
        { $pull: { sessions: { tokenHash } } },
        { new: true },
      )
      .exec();
  }
}
