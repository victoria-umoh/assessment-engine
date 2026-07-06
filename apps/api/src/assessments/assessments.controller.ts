import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { AssessmentResult } from './assessment-result.schema';
import { FinalizationService } from './finalization.service';

@Controller()
export class AssessmentsController {
  constructor(
    @InjectModel(AssessmentResult.name) private resultModel: Model<AssessmentResult>,
    private enrollments: EnrollmentsService,
    private finalization: FinalizationService,
  ) {}

  @Get('enrollments/:id/final-assessment')
  @UseGuards(JwtAuthGuard)
  async finalAssessment(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const enrollment = await this.enrollments.findByIdFor(req.user, id); // owner or admin
    return this.finalization.capstoneStatus(enrollment);
  }

  @Get('enrollments/:id/result')
  @UseGuards(JwtAuthGuard)
  async result(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const enrollment = await this.enrollments.findByIdFor(req.user, id); // owner or admin
    const result = await this.resultModel.findOne({ enrollmentId: enrollment._id }).lean();
    if (!result) throw new NotFoundException('Result not ready');
    return result;
  }
}
