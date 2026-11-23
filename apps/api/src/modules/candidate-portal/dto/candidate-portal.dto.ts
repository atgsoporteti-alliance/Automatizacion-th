import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CANDIDATE_STAGES,
  CandidateStage,
  MEETING_STATUSES,
  MeetingStatus,
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

  @ApiProperty({ example: '2026-11-25T15:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ example: 'https://meet.google.com/abc-defg-hij' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string;

  @ApiPropertyOptional({ example: 'Google Meet / Sala Virtual Alliance' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ example: 'Carolina Mejía (TH)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  interviewerName?: string;

  @ApiPropertyOptional({ example: 'Conectarse 5 minutos antes con documento.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCandidateMeetingDto {
  @ApiProperty({ enum: MEETING_STATUSES })
  @IsIn(MEETING_STATUSES)
  status: MeetingStatus;

  @ApiPropertyOptional({ example: '2026-11-26T16:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 'https://meet.google.com/xyz-1234-abc' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string;

  @ApiPropertyOptional({ example: 'Reprogramada por cruce de agenda del entrevistador.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
