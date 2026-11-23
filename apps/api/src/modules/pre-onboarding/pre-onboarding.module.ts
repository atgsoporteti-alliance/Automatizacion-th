import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CandidatePortalModule } from '../candidate-portal/candidate-portal.module';
import { EmployeesModule } from '../employees/employees.module';
import { PreOnboardingController } from './pre-onboarding.controller';
import { PreOnboardingService } from './pre-onboarding.service';

@Module({
  imports: [JwtModule.register({}), EmployeesModule, CandidatePortalModule],
  controllers: [PreOnboardingController],
  providers: [PreOnboardingService],
})
export class PreOnboardingModule {}
