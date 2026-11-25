import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SYSTEM_ROLES,
  SystemRole,
  USER_CLEARANCE_DEPARTMENTS,
  USER_OPERATIONAL_AREAS,
  UserClearanceDepartment,
  UserOperationalArea,
} from '@alliance-hcm/shared';

export class CreateUserDto {
  @ApiProperty({ example: 'Laura Marcela Gómez' })
  @IsString()
  @MinLength(3, { message: 'Ingresa el nombre completo (mínimo 3 caracteres).' })
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'laura.gomez@correo.com' })
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ enum: SYSTEM_ROLES, example: 'CANDIDATE' })
  @IsIn(SYSTEM_ROLES)
  role: SystemRole;

  @ApiPropertyOptional({ enum: USER_OPERATIONAL_AREAS, nullable: true })
  @IsOptional()
  @IsIn(USER_OPERATIONAL_AREAS)
  operationalArea?: UserOperationalArea | null;

  @ApiPropertyOptional({ enum: USER_CLEARANCE_DEPARTMENTS, nullable: true })
  @IsOptional()
  @IsIn(USER_CLEARANCE_DEPARTMENTS)
  clearanceDepartment?: UserClearanceDepartment | null;

  @ApiPropertyOptional({ example: 'Analista de Operaciones' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  appliedRole?: string;

  @ApiPropertyOptional({ example: '1020304050' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalId?: string;

  @ApiPropertyOptional({ description: 'Contraseña inicial opcional (mínimo 6 caracteres)' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  @MaxLength(120)
  password?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
