import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { LoginDto, RegisterDto } from '@lms/shared';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/user.schema';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private publicUser(user: UserDocument) {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async issueTokens(user: UserDocument) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: '15m' },
    );
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      { secret: this.config.get('JWT_REFRESH_SECRET'), expiresIn: '7d' },
    );
    user.sessions.push({ tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + 7 * 864e5) });
    user.sessions = user.sessions.filter((s) => s.expiresAt > new Date()).slice(-5); // cap sessions
    await user.save();
    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const user = await this.users.create(dto);
    const tokens = await this.issueTokens(user);
    return { user: this.publicUser(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Atomic claim: exactly one concurrent request wins the rotation; losers,
    // reused tokens, and expired sessions all surface as null → 401.
    const user = await this.users.claimSession(payload.sub, sha256(refreshToken));
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    const tokens = await this.issueTokens(user);
    return { user: this.publicUser(user), ...tokens };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.status !== 'active') {
      // Timing pad: an unknown email must cost the same argon2 verify as a
      // wrong password, or response time leaks which emails are registered.
      await argon2.verify(TIMING_PAD_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.issueTokens(user);
    return { user: this.publicUser(user), ...tokens };
  }
}

// argon2id hash of a throwaway string ('timing-pad-dummy-password'); never a real credential.
const TIMING_PAD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$WJcAongOnJXWWZTxYFMn1Q$QfIXgWZZB5/wXbYeT1EK5xMU4mCtqdGv9K+U0Ka3GYw';
