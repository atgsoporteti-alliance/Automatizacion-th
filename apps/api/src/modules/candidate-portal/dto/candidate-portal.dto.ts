import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CANDIDATE_STAGES,
  CandidateStage,
  EVALUATION_RECOMMENDATIONS,
  EvaluationRecommendation,
  MEETING_STATUSES,
  MeetingStatus,
  OPERATIONAL_AREAS,
  OperationalArea,
} from '@alliance-hcm/shared';

export class CreateCandidateProcessDto {
  @ApiProperty({ example: 'Laura Valentina Gómez' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  candidateName: string;

  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @IsEmail()
  candidateEmail: string;

  @ApiPropertyOptional({ example: '1019234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalId?: string;

  @ApiPropertyOptional({ example: 'Analista de Operaciones Customer' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  appliedRole?: string;
}

export class UpdateCandidateStageDto {
  @ApiProperty({ enum: CANDIDATE_STAGES })
  @IsIn(CANDIDATE_STAGES)
  stage: CandidateStage;

  @ApiPropertyOptional({ example: 'Avanza a etapa técnica por perfil destacado.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateCandidateMeetingDto {
  @ApiProperty({ example: 'Entrevista Técnica con Líder de Área' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ example: 'Entrevista Técnica' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  meetingType?: string;

  @ApiPropertyOptional({ example: '2026-11-25T15:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ example: 45, minimum: 15, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'https://teams.microsoft.com/l/meetup-join/...' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  meetingUrl?: string;

  @ApiPropertyOptional({ example: 'Virtual · Microsoft Teams / Google Meet' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'Carolina Mejía (TH)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  interviewerName?: string;

  @ApiPropertyOptional({ example: 'carolina.mejia@alliance.com.co' })
  @IsOptional()
  @IsEmail()
  interviewerEmail?: string;

  @ApiPropertyOptional({ enum: OPERATIONAL_AREAS })
  @IsOptional()
  @IsIn(OPERATIONAL_AREAS)
  operationalArea?: OperationalArea;

  @ApiPropertyOptional({ example: 'Conectarse 5 minutos antes con documento.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean;
}

export class UpdateCandidateMeetingDto {
  @ApiPropertyOptional({ enum: MEETING_STATUSES })
  @IsOptional()
  @IsIn(MEETING_STATUSES)
  status?: MeetingStatus;

  @ApiPropertyOptional({ example: '2026-11-26T16:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 45, minimum: 15, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'https://meet.google.com/xyz-1234-abc' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  meetingUrl?: string;

  @ApiPropertyOptional({ example: 'Virtual · Google Meet' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'carolina.mejia@alliance.com.co' })
  @IsOptional()
  @IsEmail()
  interviewerEmail?: string;

  @ApiPropertyOptional({ enum: OPERATIONAL_AREAS })
  @IsOptional()
  @IsIn(OPERATIONAL_AREAS)
  operationalArea?: OperationalArea;

  @ApiPropertyOptional({ example: 'Reprogramada por cruce de agenda del entrevistador.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean;
}

export class CompetencyScoreItemDto {
  @ApiProperty({ example: 'COMUNICACION' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  key: string;

  @ApiProperty({ example: 'Comunicación Asertiva' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  score: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ example: 'Ejemplos claros en atención al cliente.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  observation?: string;
}

export class CreateCompetencyEvaluationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @ApiPropertyOptional({ example: 'Entrevista Técnica Líder DSI' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stageLabel?: string;

  @ApiPropertyOptional({ enum: OPERATIONAL_AREAS })
  @IsOptional()
  @IsIn(OPERATIONAL_AREAS)
  operationalArea?: OperationalArea;

  @ApiProperty({ type: [CompetencyScoreItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompetencyScoreItemDto)
  scores: CompetencyScoreItemDto[];

  @ApiProperty({ enum: EVALUATION_RECOMMENDATIONS, example: 'RECOMMEND' })
  @IsIn(EVALUATION_RECOMMENDATIONS)
  recommendation: EvaluationRecommendation;

  @ApiPropertyOptional({ example: 'Fuerte experiencia técnica y claridad al explicar.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  strengths?: string;

  @ApiPropertyOptional({ example: 'Reforzar pruebas unitarias automatizadas.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  improvementAreas?: string;

  @ApiPropertyOptional({ example: 'Aprobado por comité técnico para avanzar a pre-ingreso.' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  summaryNotes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  markMeetingCompleted?: boolean;
}
