import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@ApiTags('Admin & Audit')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Listar usuarios y roles RBAC (solo SUPER_ADMIN)' })
  findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Post('users')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Crear usuario corporativo RBAC o usuario Candidato (portal aislado con vigencia de 15 días tras aprobación TH)',
  })
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Headers('origin') origin?: string,
  ) {
    return this.adminService.createUser(dto, user.id, origin);
  }

  @Patch('users/:id/role')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Actualizar rol, área operativa o estado de usuario (solo SUPER_ADMIN)' })
  updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.adminService.updateUserRole(id, dto, user.id);
  }

  @Get('audit-logs')
  @Roles('SUPER_ADMIN', 'TH_ADMIN')
  @ApiOperation({ summary: 'Consultar bitácora inmutable de auditoría (SUPER_ADMIN / TH_ADMIN)' })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'entity', required: false })
  findAuditLogs(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
  ) {
    return this.adminService.findAuditLogs({ actorId, action, entity });
  }
}
