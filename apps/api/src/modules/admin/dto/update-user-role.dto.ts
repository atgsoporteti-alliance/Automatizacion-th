import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  INTERNAL_ROLES,
  InternalRole,
  USER_CLEARANCE_DEPARTMENTS,
  USER_OPERATIONAL_AREAS,
  UserClearanceDepartment,
  UserOperationalArea,
} from '@alliance-hcm/shared';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: INTERNAL_ROLES, example: 'TH_ADMIN' })
  @IsIn(INTERNAL_ROLES)
  role: InternalRole;

  @ApiPropertyOptional({ enum: USER_OPERATIONAL_AREAS, nullable: true })
  @IsOptional()
  @IsIn(USER_OPERATIONAL_AREAS)
  operationalArea?: UserOperationalArea | null;

  @ApiPropertyOptional({ enum: USER_CLEARANCE_DEPARTMENTS, nullable: true })
  @IsOptional()
  @IsIn(USER_CLEARANCE_DEPARTMENTS)
  clearanceDepartment?: UserClearanceDepartment | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
