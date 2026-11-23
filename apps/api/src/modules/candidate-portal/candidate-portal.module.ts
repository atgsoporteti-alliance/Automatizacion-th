import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CandidatePortalController } from './candidate-portal.controller';
import { CandidatePortalService } from './candidate-portal.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CandidatePortalController],
  providers: [CandidatePortalService],
  exports: [CandidatePortalService],
})
export class CandidatePortalModule {}
