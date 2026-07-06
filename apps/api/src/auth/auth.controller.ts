import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { loginSchema, registerSchema } from '@lms/shared';
import { z, ZodSchema } from 'zod';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUser } from './jwt.strategy';

function parse<T>(schema: ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  register(@Body() body: unknown) {
    return this.auth.register(parse(registerSchema, body));
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  login(@Body() body: unknown) {
    return this.auth.login(parse(loginSchema, body));
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  refresh(@Body() body: unknown) {
    const schema = z.object({ refreshToken: z.string().min(1) });
    return this.auth.refresh(parse(schema, body).refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: AuthUser }) {
    return this.auth.me(req.user.userId);
  }
}
