import { Module } from '@nestjs/common';
import { CandidatePortalModule } from '../candidate-portal/candidate-portal.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [CandidatePortalModule, HelpdeskModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
