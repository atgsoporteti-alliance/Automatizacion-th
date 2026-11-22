import { Module } from '@nestjs/common';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';

@Module({
  imports: [HelpdeskModule],
  controllers: [OffboardingController],
  providers: [OffboardingService],
})
export class OffboardingModule {}
