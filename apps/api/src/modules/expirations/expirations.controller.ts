import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  AuthenticatedUserProfile,
  EXPIRATION_CATEGORIES,
  EXPIRATION_STATUSES,
  ExpirationCategory,
  ExpirationStatus,
  OPERATIONAL_AREAS,
  OperationalArea,
} from '@alliance-hcm/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateExpirationDto,
  RenewExpirationDto,
  UpdateDocumentExpirationDto,
  UpdateExpirationDto,
} from './dto/expirations.dto';
import { ExpirationsService } from './expirations.service';

@ApiTags('Expirations')
@ApiBearerAuth()
@Controller('expirations')
export class ExpirationsController {
  constructor(private readonly expirationsService: ExpirationsService) {}

  @Get()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Listar contratos, licencias y certificaciones con cálculo automático de días restantes y severidad',
  })
  @ApiQuery({ name: 'category', enum: EXPIRATION_CATEGORIES, required: false })
  @ApiQuery({ name: 'status', enum: EXPIRATION_STATUSES, required: false })
  @ApiQuery({ name: 'operationalArea', enum: OPERATIONAL_AREAS, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'includeArchived', required: false })
  list(
    @CurrentUser() user: AuthenticatedUserProfile,
    @Query('category') category?: ExpirationCategory,
    @Query('status') status?: ExpirationStatus,
    @Query('operationalArea') operationalArea?: OperationalArea,
    @Query('search') search?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.expirationsService.list(
      {
        category,
        status,
        operationalArea,
        search,
        includeArchived: includeArchived === '1' || includeArchived === 'true',
      },
      user,
    );
  }

  @Post()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Registrar un nuevo vencimiento (contrato, licencia o certificación)',
  })
  create(
    @Body() dto: CreateExpirationDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.expirationsService.create(dto, user);
  }

  @Patch(':id')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Actualizar datos, fecha de vencimiento o destinatarios' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpirationDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.expirationsService.update(id, dto, user);
  }

  @Post(':id/renew')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Renovar un contrato, licencia o certificación y reiniciar los umbrales de alerta',
  })
  renew(
    @Param('id') id: string,
    @Body() dto: RenewExpirationDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.expirationsService.renew(id, dto, user);
  }

  @Post(':id/archive')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Archivar un vencimiento ya atendido o dado de baja' })
  archive(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.expirationsService.archive(id, user);
  }

  @Patch('documents/:docId/expiration')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Asignar o actualizar la fecha de vencimiento de un documento del expediente digital',
  })
  updateDocumentExpiration(
    @Param('docId') docId: string,
    @Body() dto: UpdateDocumentExpirationDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.expirationsService.updateDocumentExpiration(docId, dto.expirationDate, user);
  }

  @Post('scan')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Ejecutar manualmente el escaneo de vencimientos y despachar alertas por correo electrónico',
  })
  runScan(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Query('force') force?: string,
  ) {
    const requestOrigin = req.headers.origin;
    return this.expirationsService.runAlertScan(user.email, {
      force: force === '1' || force === 'true',
      requestOrigin: typeof requestOrigin === 'string' ? requestOrigin : undefined,
    });
  }
}
