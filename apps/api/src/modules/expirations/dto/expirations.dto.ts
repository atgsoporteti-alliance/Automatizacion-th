import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
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
  EXPIRATION_CATEGORIES,
  ExpirationCategory,
  OPERATIONAL_AREAS,
  OperationalArea,
} from '@alliance-hcm/shared';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateExpirationDto {
  @ApiProperty({ enum: EXPIRATION_CATEGORIES, example: 'CONTRACT' })
  @IsIn(EXPIRATION_CATEGORIES)
  category: ExpirationCategory;

  @ApiProperty({ example: 'Contrato Término Fijo — Analista Customer' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: OPERATIONAL_AREAS })
  @IsOptional()
  @IsIn(OPERATIONAL_AREAS)
  operationalArea?: OperationalArea;

  @ApiPropertyOptional({ example: 'CTR-2026-041' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceCode?: string;

  @ApiPropertyOptional({ example: 'Alliance / Microsoft / SENA' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  providerOrEntity?: string;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'startsAt debe tener formato YYYY-MM-DD' })
  startsAt?: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'expiresAt debe tener formato YYYY-MM-DD' })
  expiresAt: string;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  alertDaysBefore?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  notifyEmployee?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['th@alliance.com.co'] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @ApiPropertyOptional({ example: 'Evaluar prórroga con líder operativo antes de 15 días.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateExpirationDto {
  @ApiPropertyOptional({ enum: EXPIRATION_CATEGORIES })
  @IsOptional()
  @IsIn(EXPIRATION_CATEGORIES)
  category?: ExpirationCategory;

  @ApiPropertyOptional({ example: 'Licencia Microsoft 365 E3 (Lote DSI)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  employeeId?: string | null;

  @ApiPropertyOptional({ enum: OPERATIONAL_AREAS, nullable: true })
  @IsOptional()
  @IsIn(OPERATIONAL_AREAS)
  operationalArea?: OperationalArea | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  providerOrEntity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'startsAt debe tener formato YYYY-MM-DD' })
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'expiresAt debe tener formato YYYY-MM-DD' })
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  alertDaysBefore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyEmployee?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RenewExpirationDto {
  @ApiProperty({ example: '2027-12-15' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'newExpiresAt debe tener formato YYYY-MM-DD' })
  newExpiresAt: string;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'startsAt debe tener formato YYYY-MM-DD' })
  startsAt?: string;

  @ApiPropertyOptional({ example: 'OTROSI-2026-02' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceCode?: string;

  @ApiPropertyOptional({ example: 'Contrato prorrogado por 12 meses.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateDocumentExpirationDto {
  @ApiPropertyOptional({ example: '2027-06-30', nullable: true })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'expirationDate debe tener formato YYYY-MM-DD' })
  expirationDate?: string | null;
}
