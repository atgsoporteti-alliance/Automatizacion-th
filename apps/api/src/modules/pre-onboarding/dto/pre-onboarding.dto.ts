import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  DOCUMENT_TYPES,
  DocumentType,
  EDUCATION_LEVELS,
  EducationLevel,
  MARITAL_STATUSES,
  MaritalStatus,
  SHIRT_SIZES,
  ShirtSize,
} from '@alliance-hcm/shared';

export class GenerateMagicLinkDto {
  @ApiPropertyOptional({ example: 'Laura Valentina Gómez' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  candidateName?: string;

  @ApiPropertyOptional({ example: 'laura.gomez@gmail.com' })
  @IsOptional()
  @IsEmail()
  candidateEmail?: string;

  @ApiPropertyOptional({ example: '1019234567' })
  @IsOptional()
  @IsString()
  nationalId?: string;
}

export class SendOtpDto {
  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+57 310 555 0199' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'El código OTP debe tener 6 dígitos' })
  code: string;
}

export class PresignedUrlDto {
  @ApiProperty({ example: 'cedula_candidato.pdf' })
  @IsString()
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  contentType: string;

  @ApiProperty({ enum: DOCUMENT_TYPES, example: 'NATIONAL_ID_PDF' })
  @IsIn(DOCUMENT_TYPES)
  documentType: DocumentType;

  @ApiPropertyOptional({ example: '1019234567' })
  @IsOptional()
  @IsString()
  nationalId?: string;
}

export class UploadedDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  documentType: DocumentType;

  @ApiProperty()
  @IsString()
  fileName: string;

  @ApiProperty()
  @IsString()
  mimeType: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  fileSize: number;

  @ApiProperty()
  @IsString()
  s3Key: string;

  @ApiProperty()
  @IsString()
  s3Url: string;
}

export class SubmitPreOnboardingDto {
  @ApiProperty({ description: 'Token JWT del Magic Link (o "demo-token" en desarrollo)' })
  @IsString()
  token: string;

  // --- Los 24 campos exactos del formato Alliance ---
  @ApiProperty({ example: 'Laura Valentina Gómez' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'laura.gomez' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  preferredNameCredentials: string;

  @ApiProperty({ example: '1019234567' })
  @Matches(/^[0-9]{6,15}$/)
  nationalId: string;

  @ApiProperty({ example: 'Bogotá D.C.' })
  @IsString()
  @MaxLength(120)
  idIssuePlace: string;

  @ApiProperty({ example: '1996-05-12' })
  @IsDateString()
  birthDate: string;

  @ApiProperty({ example: 'Bogotá D.C.' })
  @IsString()
  @MaxLength(120)
  birthPlace: string;

  @ApiProperty({ enum: MARITAL_STATUSES, example: 'SOLTERO' })
  @IsIn(MARITAL_STATUSES)
  maritalStatus: MaritalStatus;

  @ApiProperty({ example: 'Carrera 11 # 93-40 Apto 301' })
  @IsString()
  @MaxLength(200)
  address: string;

  @ApiProperty({ example: 'Chicó Norte, Bogotá D.C.' })
  @IsString()
  @MaxLength(150)
  neighborhoodCity: string;

  @ApiProperty({ example: '+57 310 555 0199' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'laura.gomez@gmail.com' })
  @IsEmail()
  @MaxLength(150)
  personalEmail: string;

  @ApiProperty({ enum: EDUCATION_LEVELS, example: 'PROFESIONAL' })
  @IsIn(EDUCATION_LEVELS)
  educationLevel: EducationLevel;

  @ApiProperty({ example: 'Ingeniería de Sistemas' })
  @IsString()
  @MaxLength(150)
  lastAcademicTitle: string;

  @ApiProperty({ example: 'Sura EPS' })
  @IsString()
  @MaxLength(120)
  eps: string;

  @ApiPropertyOptional({ example: 'Porvenir' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pensionFund?: string;

  @ApiPropertyOptional({ example: 'Porvenir' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  severanceFund?: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  hasChildren: boolean;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  @Max(20)
  childrenCount: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  hasBancolombiaAccount: boolean;

  @ApiProperty({ enum: SHIRT_SIZES, example: 'M' })
  @IsIn(SHIRT_SIZES)
  shirtSize: ShirtSize;

  @ApiProperty({ example: 'Carlos Gómez' })
  @IsString()
  @MaxLength(150)
  emergencyContactName: string;

  @ApiProperty({ example: 'Padre' })
  @IsString()
  @MaxLength(80)
  emergencyContactRelationship: string;

  @ApiProperty({ example: '+57 311 444 8899' })
  @IsString()
  @MaxLength(30)
  emergencyContactPhone: string;

  // --- Cumplimiento Ley 1581 / Habeas Data + OTP ---
  @ApiProperty({ example: true })
  @IsBoolean()
  habeasDataAccepted: boolean;

  @ApiProperty({ description: 'Firma digital en formato Data URL (PNG base64) o URL S3' })
  @IsString()
  @MinLength(20)
  signatureDataUrl: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  otpCode: string;

  @ApiPropertyOptional({ type: [UploadedDocumentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UploadedDocumentDto)
  documents?: UploadedDocumentDto[];
}
