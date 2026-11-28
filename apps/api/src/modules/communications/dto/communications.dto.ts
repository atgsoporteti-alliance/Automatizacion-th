import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  NEWS_CATEGORIES,
  NewsCategory,
  PULSE_QUESTION_TYPES,
  PULSE_SURVEY_STATUSES,
  PulseQuestionType,
  PulseSurveyStatus,
  USER_OPERATIONAL_AREAS,
  UserOperationalArea,
} from '@alliance-hcm/shared';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateNewsPostDto {
  @ApiProperty({ example: 'Actualización Plan de Beneficios Q4 2026' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title: string;

  @ApiPropertyOptional({ example: 'Nuevos convenios de bienestar y auxilio de conectividad.' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  summary?: string;

  @ApiProperty({ example: 'Detalle completo del comunicado para todos los equipos de Alliance.' })
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  content: string;

  @ApiProperty({ enum: NEWS_CATEGORIES, example: 'BENEFITS' })
  @IsIn(NEWS_CATEGORIES)
  category: NewsCategory;

  @ApiPropertyOptional({ enum: USER_OPERATIONAL_AREAS, default: 'ALL' })
  @IsOptional()
  @IsIn(USER_OPERATIONAL_AREAS)
  targetArea?: UserOperationalArea;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateNewsPostDto {
  @ApiPropertyOptional({ maxLength: 180 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  summary?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({ enum: NEWS_CATEGORIES })
  @IsOptional()
  @IsIn(NEWS_CATEGORIES)
  category?: NewsCategory;

  @ApiPropertyOptional({ enum: USER_OPERATIONAL_AREAS })
  @IsOptional()
  @IsIn(USER_OPERATIONAL_AREAS)
  targetArea?: UserOperationalArea;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class CreateNewsCommentDto {
  @ApiProperty({ example: 'Excelente iniciativa para el equipo operativo.' })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  body: string;
}

export class PulseQuestionDto {
  @ApiProperty({ example: 'q_enps' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  id: string;

  @ApiProperty({ example: '¿Qué tan probable es que recomiendes trabajar en Alliance? (0-10)' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  prompt: string;

  @ApiProperty({ enum: PULSE_QUESTION_TYPES, example: 'ENPS_10' })
  @IsIn(PULSE_QUESTION_TYPES)
  type: PulseQuestionType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  options?: string[];
}

export class CreatePulseSurveyDto {
  @ApiProperty({ example: 'Pulso Mensual de Clima y Carga Operativa' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title: string;

  @ApiPropertyOptional({ example: 'Medición 100% anónima sobre bienestar y herramientas de trabajo.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: PULSE_SURVEY_STATUSES, default: 'ACTIVE' })
  @IsOptional()
  @IsIn(PULSE_SURVEY_STATUSES)
  status?: PulseSurveyStatus;

  @ApiPropertyOptional({ enum: USER_OPERATIONAL_AREAS, default: 'ALL' })
  @IsOptional()
  @IsIn(USER_OPERATIONAL_AREAS)
  targetArea?: UserOperationalArea;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @Matches(DATE_ONLY_REGEX, { message: 'closesAt debe tener formato YYYY-MM-DD' })
  closesAt?: string;

  @ApiProperty({ type: [PulseQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PulseQuestionDto)
  questions: PulseQuestionDto[];
}

export class UpdatePulseSurveyStatusDto {
  @ApiProperty({ enum: PULSE_SURVEY_STATUSES })
  @IsIn(PULSE_SURVEY_STATUSES)
  status: PulseSurveyStatus;
}

export class SubmitPulseResponseDto {
  @ApiProperty({
    description: 'Mapa clave-valor de id de pregunta a respuesta (número o texto)',
    example: { q_climate: 5, q_enps: 9, q_feedback: 'Buen acompañamiento esta semana' },
  })
  @IsObject()
  answers: Record<string, number | string>;
}
