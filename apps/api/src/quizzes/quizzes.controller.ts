import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { submitQuizSchema } from '@lms/shared';
import { z } from 'zod';
import { AuthUser } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuizzesService } from './quizzes.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller()
export class QuizzesController {
  constructor(private quizzes: QuizzesService) {}

  @Post('enrollments/:id/items/:itemId/quiz-attempts')
  @UseGuards(JwtAuthGuard)
  startAttempt(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.quizzes.startAttempt(req.user, id, itemId);
  }

  @Get('quiz-attempts/:id')
  @UseGuards(JwtAuthGuard)
  getAttempt(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.quizzes.getAttempt(req.user, id);
  }

  @Post('quiz-attempts/:id/submit')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  submit(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() body: unknown) {
    return this.quizzes.submitAttempt(req.user, id, parse(submitQuizSchema, body));
  }
}
