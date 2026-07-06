import { createUserSchema, updateUserSchema } from '@lms/shared';

describe('user admin schemas', () => {
  it('createUserSchema extends register with a role defaulting to candidate', () => {
    const parsed = createUserSchema.parse({
      email: 'new@test.local',
      password: 'password123',
      name: 'New User',
    });
    expect(parsed.role).toBe('candidate');
    expect(
      createUserSchema.parse({
        email: 'boss@test.local',
        password: 'password123',
        name: 'Boss',
        role: 'admin',
      }).role,
    ).toBe('admin');
    expect(createUserSchema.safeParse({ email: 'x', password: 'short', name: '' }).success).toBe(
      false,
    );
  });
});
