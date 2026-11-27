import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  ContractStatus,
  ContractType,
  OPERATIONAL_AREAS,
  OperationalArea,
} from '@alliance-hcm/shared';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateContractDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId: string;

  @ApiPropertyOptional({ example: 'CTR-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractCode?: string;

  @ApiProperty({ example: 'Contrato Laboral Término Indefinido — Customer' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title: string;

  @ApiProperty({ enum: CONTRACT_TYPES, example: 'FIXED_TERM' })
  @IsIn(CONTRACT_TYPES)
  contractType: ContractType;

  @ApiPropertyOptional({ enum: CONTRACT_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsIn(CONTRACT_STATUSES)
  status?: ContractStatus;

  @ApiPropertyOptional({ enum: OPERATIONAL_AREAS })
  @IsOptional()
  @IsIn(OPERATIONAL_AREAS)
  operationalArea?: OperationalArea;

  @ApiPropertyOptional({ example: 'Especialista Operativo' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'CC-CUST-101' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenter?: string;

  @ApiPropertyOptional({ example: 'Híbrido' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  workModality?: string;

  @ApiPropertyOptional({ example: 3800000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryCop?: number;

  @ApiProperty({ example: '2026-12-01' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'startsAt debe tener formato YYYY-MM-DD' })
  startsAt: string;

  @ApiPropertyOptional({ example: '2027-11-30' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'endsAt debe tener formato YYYY-MM-DD' })
  endsAt?: string;

  @ApiPropertyOptional({ example: '2026-11-28' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'signedAt debe tener formato YYYY-MM-DD' })
  signedAt?: string;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  alertDaysBefore?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  syncExpirationAlert?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  notes?: string;
}

export class UpdateContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ enum: CONTRACT_TYPES })
  @IsOptional()
  @IsIn(CONTRACT_TYPES)
  contractType?: ContractType;

  @ApiPropertyOptional({ enum: CONTRACT_STATUSES })
  @IsOptional()
  @IsIn(CONTRACT_STATUSES)
  status?: ContractStatus;

  @ApiPropertyOptional({ enum: OPERATIONAL_AREAS })
  @IsOptional()
  @IsIn(OPERATIONAL_AREAS)
  operationalArea?: OperationalArea;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  workModality?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryCop?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'startsAt debe tener formato YYYY-MM-DD' })
  startsAt?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'endsAt debe tener formato YYYY-MM-DD' })
  endsAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'signedAt debe tener formato YYYY-MM-DD' })
  signedAt?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  alertDaysBefore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  notes?: string;
}

export class RenewContractDto {
  @ApiPropertyOptional({ example: '2028-11-30' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'newEndsAt debe tener formato YYYY-MM-DD' })
  newEndsAt?: string;

  @ApiPropertyOptional({ enum: CONTRACT_TYPES })
  @IsOptional()
  @IsIn(CONTRACT_TYPES)
  newContractType?: ContractType;

  @ApiPropertyOptional({ example: 'CTR-2027-001-PR1' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractCode?: string;

  @ApiPropertyOptional({ example: 4200000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryCop?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  notes?: string;
}

export class TerminateContractDto {
  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'terminationDate debe tener formato YYYY-MM-DD' })
  terminationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  notes?: string;
}
