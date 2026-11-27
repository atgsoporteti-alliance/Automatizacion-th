import { Body, Controller, Get, Param, Patch, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AuthenticatedUserProfile,
  EmployeeStatus,
  OperationalArea,
} from '@alliance-hcm/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { buildContentDispositionHeader } from '../../common/utils/file-header.util';
import { EmployeesService } from './employees.service';
import { UpdateOrganizationalDto } from './dto/update-organizational.dto';

@ApiTags('Employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) { }

  @Get('check-duplicate')
  @Public()
  @ApiOperation({
    summary: 'Validación anti-duplicados en tiempo real y detección de reintegros (isRehire)',
  })
  @ApiQuery({ name: 'nationalId', required: false, example: '1015432198' })
  @ApiQuery({ name: 'email', required: false, example: 'diego.torres.ex@gmail.com' })
  checkDuplicate(
    @Query('nationalId') nationalId?: string,
    @Query('email') email?: string,
  ) {
    return this.employeesService.checkDuplicate(nationalId, email);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Listar expediente digital de colaboradores (con Data Masking según rol)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'operationalArea', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentUser() user: AuthenticatedUserProfile,
    @Query('status') status?: EmployeeStatus,
    @Query('operationalArea') operationalArea?: OperationalArea,
    @Query('search') search?: string,
  ) {
    return this.employeesService.findAll({ status, operationalArea, search }, user);
  }

  @Get('documents/:docId/content')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Previsualizar o descargar documento del colaborador desde el bucket S3 (alliance)',
  })
  async getDocumentContent(
    @Param('docId') docId: string,
    @Query('download') download: string | undefined,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Res() res: Response,
  ) {
    const file = await this.employeesService.getDocumentContent(docId, user);
    const disposition = download === '1' || download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', buildContentDispositionHeader(disposition, file.fileName));
    res.send(file.buffer);
  }

  @Get(':id/signature/content')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Previsualizar firma electrónica Ley 1581 desde el bucket S3 (solo vista en línea)',
  })
  async getSignatureContent(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.employeesService.getSignatureContent(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', buildContentDispositionHeader('inline', file.fileName));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(file.buffer);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'IT_SUPPORT', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Obtener expediente completo (con Data Masking según rol)' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUserProfile) {
    return this.employeesService.findOne(id, user);
  }

  @Patch(':id/organizational')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Asignar datos organizacionales desde TH (Área, Cargo, Centro de Costos)' })
  updateOrganizational(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationalDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.employeesService.updateOrganizational(id, dto, user.id);
  }
}
