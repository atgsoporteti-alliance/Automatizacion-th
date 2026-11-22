import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OPERATIONAL_AREAS, OperationalArea } from '@alliance-hcm/shared';

export class ApproveThWorkflowDto {
  @ApiProperty({ enum: OPERATIONAL_AREAS, example: 'CUSTOMER' })
  @IsIn(OPERATIONAL_AREAS)
  operationalArea: OperationalArea;

  @ApiProperty({ example: 'Especialista de Experiencia al Cliente' })
  @IsString()
  @MaxLength(120)
  jobTitle: string;

  @ApiProperty({ example: 'CC-CUST-101' })
  @IsString()
  @MaxLength(80)
  costCenter: string;

  @ApiProperty({ example: 'lider.customer@alliance.com.co' })
  @IsEmail()
  reportingManagerEmail: string;

  @ApiProperty({ example: '2026-12-01' })
  @IsDateString()
  hireDate: string;

  @ApiPropertyOptional({ example: 'camila.morales@alliance.com.co' })
  @IsOptional()
  @IsEmail()
  corporateEmail?: string;

  @ApiPropertyOptional({ example: 'Expediente verificado al 100% por TH.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ApproveDsiWorkflowDto {
  @ApiProperty({ example: 'lider.dsi@alliance.com.co' })
  @IsEmail()
  approverEmail: string;

  @ApiPropertyOptional({ example: 'Aprobado perfil VPN, Git y workstation MacBook Pro.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CancelNoShowDto {
  @ApiPropertyOptional({ example: 'Candidato no se presentó el día 1 de inducción.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'analista.th@alliance.com.co' })
  @IsOptional()
  @IsEmail()
  actorEmail?: string;
}
