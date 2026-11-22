import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUserProfile,
  OperationalArea,
  WorkflowStep,
  WorkflowType,
} from '@alliance-hcm/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { WorkflowsService } from './workflows.service';
import {
  ApproveDsiWorkflowDto,
  ApproveThWorkflowDto,
  CancelNoShowDto,
  ReturnToCandidateDto,
} from './dto/workflow-actions.dto';

@ApiTags('Workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) { }

  @Get()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Listar workflows de Onboarding y Offboarding con filtros y proyección RBAC' })
  @ApiQuery({ name: 'flowType', required: false })
  @ApiQuery({ name: 'currentStep', required: false })
  @ApiQuery({ name: 'operationalArea', required: false })
  findAll(
    @CurrentUser() user: AuthenticatedUserProfile,
    @Query('flowType') flowType?: WorkflowType,
    @Query('currentStep') currentStep?: WorkflowStep,
    @Query('operationalArea') operationalArea?: OperationalArea,
  ) {
    return this.workflowsService.findAll({ flowType, currentStep, operationalArea }, user);
  }

  @Get('kpis')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'CLEARANCE_APPROVER', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'KPIs consolidados para el Dashboard de TH e IT' })
  getKpis(@CurrentUser() user: AuthenticatedUserProfile) {
    return this.workflowsService.getKpis(user);
  }

  @Post(':id/approve-th')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Aprobación TH: evalúa reglas por área (Customer, Ventas, DSI), exige Líder DSI si aplica o encola ticket a Helpdesk',
  })
  approveByTh(
    @Param('id') id: string,
    @Body() dto: ApproveThWorkflowDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.workflowsService.approveByTh(id, dto, user.id);
  }

  @Post(':id/approve-dsi')
  @Roles('AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Aprobación del Líder DSI: desbloquea el ingreso DSI y dispara ticket a Helpdesk',
  })
  approveByDsi(
    @Param('id') id: string,
    @Body() dto: ApproveDsiWorkflowDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.workflowsService.approveByDsiLeader(id, dto, user);
  }

  @Post(':id/cancel-no-show')
  @Roles('TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Cancelación rápida Día 1 (No-Show): revoca proceso y cancela ticket en Helpdesk',
  })
  cancelNoShow(
    @Param('id') id: string,
    @Body() dto: CancelNoShowDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.workflowsService.cancelNoShow(id, { ...dto, actorEmail: user.email });
  }

  @Post(':id/return-candidate')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Devolver Pre-Ingreso al colaborador para corrección de datos y generar Magic Link pre-cargado',
  })
  returnToCandidate(
    @Param('id') id: string,
    @Body() dto: ReturnToCandidateDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.workflowsService.returnToCandidate(id, dto, user.id);
  }
}
