import { UserDocument } from './user.schema';

// Admin projection: passwordHash and sessions never serialize.
// Pinned by users-admin.e2e-spec.ts key-absence assertions.
export function toAdminUserView(u: UserDocument) {
  return {
    _id: u._id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    createdAt: (u as unknown as { createdAt?: Date }).createdAt,
  };
}
