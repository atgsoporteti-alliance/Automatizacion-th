import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OPERATIONAL_AREAS, OperationalArea } from '@alliance-hcm/shared';

export class UpdateOrganizationalDto {
  @ApiProperty({ enum: OPERATIONAL_AREAS, example: 'DSI' })
  @IsIn(OPERATIONAL_AREAS)
  operationalArea: OperationalArea;

  @ApiProperty({ example: 'Ingeniero Full-Stack Senior' })
  @IsString()
  @MaxLength(120)
  jobTitle: string;

  @ApiProperty({ example: 'CC-DSI-301' })
  @IsString()
  @MaxLength(80)
  costCenter: string;

  @ApiProperty({ example: 'lider.dsi@alliance.com.co' })
  @IsEmail()
  reportingManagerEmail: string;

  @ApiProperty({ example: '2026-12-01' })
  @IsDateString()
  hireDate: string;

  @ApiPropertyOptional({ example: 'andres.castellanos@alliance.com.co' })
  @IsOptional()
  @IsEmail()
  corporateEmail?: string;
}
