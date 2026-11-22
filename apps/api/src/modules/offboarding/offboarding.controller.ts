import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OffboardingService } from './offboarding.service';
import { InitiateOffboardingDto, UpdateClearanceDto } from './dto/offboarding.dto';

@ApiTags('Offboarding')
@ApiBearerAuth()
@Controller('offboarding')
export class OffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  @Get()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'CLEARANCE_APPROVER', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Listar procesos de Offboarding con semáforo de Paz y Salvo multi-área' })
  findAll(@CurrentUser() user: AuthenticatedUserProfile) {
    return this.offboardingService.findAllOffboardings(user);
  }

  @Post('initiate')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Iniciar Offboarding (STANDARD 23:59 o CRITICAL_IMMEDIATE) y crear automáticamente los 4 Paz y Salvo',
  })
  initiate(
    @Body() dto: InitiateOffboardingDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.offboardingService.initiateOffboarding(dto, user);
  }

  @Patch('clearances/:clearanceId')
  @Roles('IT_SUPPORT', 'CLEARANCE_APPROVER', 'AREA_LEADER', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Actualizar aprobación de Paz y Salvo de un área (IT, Finanzas, Activo Fijo, Jefe Directo)',
  })
  updateClearance(
    @Param('clearanceId') clearanceId: string,
    @Body() dto: UpdateClearanceDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.offboardingService.updateClearance(clearanceId, dto, user);
  }
}
