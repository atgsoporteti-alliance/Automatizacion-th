import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [RulesModule, HelpdeskModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
