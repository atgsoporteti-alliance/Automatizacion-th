import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CandidatePortalModule } from '../candidate-portal/candidate-portal.module';
import { RulesModule } from '../rules/rules.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [JwtModule.register({}), CandidatePortalModule, RulesModule, HelpdeskModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
