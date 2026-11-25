import { Module } from '@nestjs/common';
import { CandidatePortalModule } from '../candidate-portal/candidate-portal.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [CandidatePortalModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
