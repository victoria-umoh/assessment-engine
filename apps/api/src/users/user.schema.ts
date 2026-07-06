import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '@lms/shared';

@Schema({ _id: false })
export class Session {
  @Prop({ required: true }) tokenHash: string;
  @Prop({ required: true }) expiresAt: Date;
}
const SessionSchema = SchemaFactory.createForClass(Session);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, enum: Object.values(Role), default: Role.Candidate })
  role: Role;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: ['active', 'disabled'], default: 'active' })
  status: 'active' | 'disabled';

  @Prop({ type: [SessionSchema], default: [] })
  sessions: Session[];
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
