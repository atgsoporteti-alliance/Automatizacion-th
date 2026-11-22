import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RulesModule } from '../rules/rules.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [JwtModule.register({}), RulesModule, HelpdeskModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
