import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  CLEARANCE_STATUSES,
  ClearanceStatus,
  WORKFLOW_URGENCIES,
  WorkflowUrgency,
} from '@alliance-hcm/shared';

export class InitiateOffboardingDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ enum: WORKFLOW_URGENCIES, example: 'STANDARD' })
  @IsIn(WORKFLOW_URGENCIES)
  urgency: WorkflowUrgency;

  @ApiProperty({ example: '2026-11-30' })
  @IsDateString()
  terminationDate: string;

  @ApiProperty({ example: 'Renuncia voluntaria con preaviso.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiProperty({ example: 'analista.th@alliance.com.co' })
  @IsEmail()
  requestedByEmail: string;
}

export class UpdateClearanceDto {
  @ApiProperty({ enum: CLEARANCE_STATUSES, example: 'APPROVED' })
  @IsIn(CLEARANCE_STATUSES)
  status: ClearanceStatus;

  @ApiProperty({ example: 'finanzas@alliance.com.co' })
  @IsEmail()
  approverEmail: string;

  @ApiPropertyOptional({ example: 'Sin saldos pendientes ni anticipos.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
