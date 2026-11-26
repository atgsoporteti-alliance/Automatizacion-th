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
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  TIME_REQUEST_CATEGORIES,
  TimeRequestCategory,
} from '@alliance-hcm/shared';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM_REGEX = /^\d{1,2}:\d{2}$/;

export class CreateTimeRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ enum: TIME_REQUEST_CATEGORIES, example: 'INCAPACITY' })
  @IsIn(TIME_REQUEST_CATEGORIES)
  category: TimeRequestCategory;

  @ApiProperty({ example: 'ENFERMEDAD_GENERAL' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  subtype: string;

  @ApiProperty({ example: 'Incapacidad EPS Sura — Gripa viral' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title: string;

  @ApiProperty({ example: '2026-11-26' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'startDate debe tener formato YYYY-MM-DD' })
  startDate: string;

  @ApiPropertyOptional({ example: '2026-11-29' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'endDate debe tener formato YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(TIME_HM_REGEX, { message: 'startTime debe tener formato HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '21:30' })
  @IsOptional()
  @Matches(TIME_HM_REGEX, { message: 'endTime debe tener formato HH:mm' })
  endTime?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({ example: 'EPS Sura / ARL Bolívar' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  medicalEntity?: string;

  @ApiPropertyOptional({ example: 'J06.9' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  diagnosisCode?: string;

  @ApiPropertyOptional({ example: 'RECARGO_NOMINA' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  compensationType?: string;

  @ApiPropertyOptional({ example: 'Despliegue de mantenimiento fuera de horario operativo.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  createExpirationAlert?: boolean;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  alertDaysBefore?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoApproveByTh?: boolean;
}

export class ReviewTimeRequestDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'CANCEL'] })
  @IsIn(['APPROVE', 'REJECT', 'CANCEL'])
  decision: 'APPROVE' | 'REJECT' | 'CANCEL';

  @ApiPropertyOptional({ example: 'Soporte EPS validado y cargado para nómina.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  createExpirationAlert?: boolean;
}
