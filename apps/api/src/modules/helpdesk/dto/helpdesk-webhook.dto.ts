import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const HELPDESK_WEBHOOK_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const;

export type HelpdeskWebhookStatus = (typeof HELPDESK_WEBHOOK_STATUSES)[number];

export class HelpdeskWebhookDto {
  @ApiProperty({ example: 'SDP-2026-4810' })
  @IsString()
  ticketId: string;

  @ApiProperty({ enum: HELPDESK_WEBHOOK_STATUSES, example: 'RESOLVED' })
  @IsIn(HELPDESK_WEBHOOK_STATUSES)
  status: HelpdeskWebhookStatus;

  @ApiPropertyOptional({ example: 'tecnico.it@alliance.com.co' })
  @IsOptional()
  @IsEmail()
  technicianEmail?: string;

  @ApiPropertyOptional({ example: 'camila.morales@alliance.com.co' })
  @IsOptional()
  @IsEmail()
  corporateEmailAssigned?: string;

  @ApiPropertyOptional({ example: 'Accesos CRM y extensión VoIP 4021 aprovisionados.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
