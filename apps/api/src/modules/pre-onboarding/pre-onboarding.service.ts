import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import {
  dataConsentSignatures,
  employeeDocuments,
  employees,
  onboardingOffboardingWorkflows,
} from '@alliance-hcm/database';
import {
  calculateAge,
  DocumentType,
  HABEAS_DATA_POLICY_TEXT,
  HABEAS_DATA_POLICY_VERSION,
} from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { StorageService } from '../../common/storage/storage.service';
import { EmployeesService } from '../employees/employees.service';
import {
  GenerateMagicLinkDto,
  PresignedUrlDto,
  SendOtpDto,
  SubmitPreOnboardingDto,
  VerifyOtpDto,
} from './dto/pre-onboarding.dto';

interface OtpEntry {
  code: string;
  expiresAt: number;
  verifiedAt?: Date;
}

@Injectable()
export class PreOnboardingService {
  private readonly logger = new Logger(PreOnboardingService.name);
  private readonly otpStore = new Map<string, OtpEntry>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly employeesService: EmployeesService,
  ) {}

  async generateMagicLink(dto: GenerateMagicLinkDto) {
    const inviteId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const token = await this.jwtService.signAsync(
      {
        sub: dto.candidateEmail ?? inviteId,
        name: dto.candidateName ?? '',
        nationalId: dto.nationalId ?? null,
        purpose: 'PRE_ONBOARDING',
      },
      {
        secret: this.config.get<string>('JWT_SECRET', 'alliance-hcm-dev-jwt-secret'),
        expiresIn: '72h',
      },
    );

    const webUrl = this.config.get<string>('WEB_URL', 'http://localhost:3000');
    const magicLink = `${webUrl}/pre-ingreso/${token}`;

    this.logger.log(`🔗 Magic Link generado (${dto.candidateEmail ?? inviteId}): ${magicLink}`);

    return {
      token,
      magicLink,
      expiresIn: '72h',
    };
  }

  async verifyMagicLink(token: string) {
    if (token === 'demo-token' && this.config.get<string>('NODE_ENV', 'development') !== 'production') {
      return {
        valid: true,
        candidateName: 'Candidato Demo Alliance',
        candidateEmail: '',
        policyVersion: HABEAS_DATA_POLICY_VERSION,
      };
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        name: string;
        nationalId?: string | null;
        purpose: string;
      }>(token, {
        secret: this.config.get<string>('JWT_SECRET', 'alliance-hcm-dev-jwt-secret'),
      });

      if (payload.purpose !== 'PRE_ONBOARDING') {
        throw new UnauthorizedException('Token inválido para pre-ingreso');
      }

      const candidateEmail = payload.sub.startsWith('inv-') ? '' : payload.sub;

      return {
        valid: true,
        candidateName: payload.name || '',
        candidateEmail,
        nationalId: payload.nationalId ?? null,
        policyVersion: HABEAS_DATA_POLICY_VERSION,
      };
    } catch {
      throw new UnauthorizedException('El enlace de pre-ingreso es inválido o ha expirado.');
    }
  }

  sendOtp(dto: SendOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const ttlSeconds = Number(this.config.get<string>('OTP_TTL_SECONDS', '600'));

    this.otpStore.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    this.logger.log(
      `🔐 [DEV OTP] Código de verificación para ${normalizedEmail} (${dto.phone ?? 'sin teléfono'}): ${code}`,
    );

    const isDev = this.config.get<string>('NODE_ENV', 'development') !== 'production';
    return {
      sent: true,
      email: normalizedEmail,
      expiresInSeconds: ttlSeconds,
      // En desarrollo exponemos devOtp para facilitar pruebas E2E sin servidor SMTP
      ...(isDev ? { devOtp: code } : {}),
    };
  }

  verifyOtp(dto: VerifyOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const entry = this.otpStore.get(normalizedEmail);
    const isDev = this.config.get<string>('NODE_ENV', 'development') !== 'production';

    if (isDev && dto.code === '123456') {
      const verifiedAt = new Date();
      this.otpStore.set(normalizedEmail, {
        code: '123456',
        expiresAt: Date.now() + 600_000,
        verifiedAt,
      });
      return { verified: true, verifiedAt };
    }

    if (!entry || entry.expiresAt < Date.now()) {
      throw new BadRequestException('El código OTP ha expirado o no fue solicitado.');
    }

    if (entry.code !== dto.code) {
      throw new BadRequestException('Código OTP incorrecto.');
    }

    entry.verifiedAt = new Date();
    this.otpStore.set(normalizedEmail, entry);

    return { verified: true, verifiedAt: entry.verifiedAt };
  }

  async createPresignedUploadUrl(dto: PresignedUrlDto) {
    const folder = `employees/${dto.nationalId ?? 'pending'}/${dto.documentType.toLowerCase()}`;
    return this.storageService.createPresignedUploadUrl({
      folder,
      fileName: dto.fileName,
      contentType: dto.contentType,
    });
  }

  async uploadDocumentFile(params: {
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
    documentType: DocumentType;
    nationalId?: string;
  }) {
    const folder = `employees/${params.nationalId?.trim() || 'pending'}/${params.documentType.toLowerCase()}`;
    const uploaded = await this.storageService.uploadObject({
      folder,
      fileName: params.file.originalname,
      contentType: params.file.mimetype || 'application/pdf',
      body: params.file.buffer,
    });

    return {
      documentType: params.documentType,
      fileName: params.file.originalname,
      mimeType: uploaded.mimeType,
      fileSize: uploaded.fileSize,
      s3Key: uploaded.s3Key,
      s3Url: uploaded.publicUrl,
    };
  }

  async submitPreOnboarding(
    dto: SubmitPreOnboardingDto,
    metadata: { ip: string; userAgent: string },
  ) {
    await this.verifyMagicLink(dto.token);

    if (!dto.habeasDataAccepted) {
      throw new BadRequestException(
        'Debes aceptar expresamente la autorización de tratamiento de datos (Ley 1581 de 2012).',
      );
    }

    // Validar OTP
    const otpVerification = this.verifyOtp({
      email: dto.personalEmail,
      code: dto.otpCode,
    });

    // Verificar duplicados y detectar reintegro
    const duplicate = await this.employeesService.checkDuplicate(
      dto.nationalId,
      dto.personalEmail,
    );

    if (duplicate.exists && !duplicate.isRehire) {
      throw new ConflictException(duplicate.message);
    }

    const computedAge = calculateAge(dto.birthDate);
    let employeeId: string;

    if (duplicate.exists && duplicate.isRehire && duplicate.existingEmployee) {
      // Reintegro: actualizar expediente histórico sin duplicar registro
      const [updated] = await this.database.db
        .update(employees)
        .set({
          status: 'PRE_ONBOARDING',
          fullName: dto.fullName,
          preferredNameCredentials: dto.preferredNameCredentials,
          idIssuePlace: dto.idIssuePlace,
          birthDate: dto.birthDate,
          birthPlace: dto.birthPlace,
          age: computedAge,
          maritalStatus: dto.maritalStatus,
          address: dto.address,
          neighborhoodCity: dto.neighborhoodCity,
          phone: dto.phone,
          personalEmail: dto.personalEmail,
          educationLevel: dto.educationLevel,
          lastAcademicTitle: dto.lastAcademicTitle,
          eps: dto.eps,
          pensionFund: dto.pensionFund,
          severanceFund: dto.severanceFund,
          hasChildren: dto.hasChildren,
          childrenCount: dto.hasChildren ? dto.childrenCount : 0,
          hasBancolombiaAccount: dto.hasBancolombiaAccount,
          shirtSize: dto.shirtSize,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactRelationship: dto.emergencyContactRelationship,
          emergencyContactPhone: dto.emergencyContactPhone,
          terminationDate: null,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, duplicate.existingEmployee.id))
        .returning();

      employeeId = updated.id;
    } else {
      const [inserted] = await this.database.db
        .insert(employees)
        .values({
          status: 'PRE_ONBOARDING',
          fullName: dto.fullName,
          preferredNameCredentials: dto.preferredNameCredentials,
          nationalId: dto.nationalId,
          idIssuePlace: dto.idIssuePlace,
          birthDate: dto.birthDate,
          birthPlace: dto.birthPlace,
          age: computedAge,
          maritalStatus: dto.maritalStatus,
          address: dto.address,
          neighborhoodCity: dto.neighborhoodCity,
          phone: dto.phone,
          personalEmail: dto.personalEmail,
          educationLevel: dto.educationLevel,
          lastAcademicTitle: dto.lastAcademicTitle,
          eps: dto.eps,
          pensionFund: dto.pensionFund,
          severanceFund: dto.severanceFund,
          hasChildren: dto.hasChildren,
          childrenCount: dto.hasChildren ? dto.childrenCount : 0,
          hasBancolombiaAccount: dto.hasBancolombiaAccount,
          shirtSize: dto.shirtSize,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactRelationship: dto.emergencyContactRelationship,
          emergencyContactPhone: dto.emergencyContactPhone,
        })
        .returning();

      employeeId = inserted.id;
    }

    // Subir firma electrónica manuscrita a Supabase Storage S3 (si viene en base64 Data URL)
    let persistedSignatureUrl = dto.signatureDataUrl;
    if (dto.signatureDataUrl.startsWith('data:image/')) {
      try {
        const [, base64Payload] = dto.signatureDataUrl.split(',');
        if (base64Payload) {
          const uploadedSig = await this.storageService.uploadObject({
            folder: `signatures/${dto.nationalId}`,
            fileName: `firma-ley1581-${dto.nationalId}.png`,
            contentType: 'image/png',
            body: Buffer.from(base64Payload, 'base64'),
          });
          persistedSignatureUrl = uploadedSig.s3Key;
        }
      } catch (err) {
        this.logger.warn(
          `No se pudo subir la firma a S3, se conserva inline: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Registrar firma electrónica Ley 1581 con Hash SHA-256, IP, User-Agent y Timestamp
    const signedAt = new Date();
    const consentHash = createHash('sha256')
      .update(
        JSON.stringify({
          employeeId,
          nationalId: dto.nationalId,
          personalEmail: dto.personalEmail,
          policyVersion: HABEAS_DATA_POLICY_VERSION,
          policyTextHash: createHash('sha256').update(HABEAS_DATA_POLICY_TEXT).digest('hex'),
          signerIp: metadata.ip,
          signedAt: signedAt.toISOString(),
        }),
      )
      .digest('hex');

    const [consentRecord] = await this.database.db
      .insert(dataConsentSignatures)
      .values({
        employeeId,
        policyVersion: HABEAS_DATA_POLICY_VERSION,
        documentSha256Hash: consentHash,
        signatureImageUrl: persistedSignatureUrl,
        signerIp: metadata.ip,
        userAgent: metadata.userAgent,
        otpVerifiedAt: otpVerification.verifiedAt,
        signedAt,
      })
      .returning();

    // Guardar referencias de documentos cargados en MinIO/S3
    if (dto.documents && dto.documents.length > 0) {
      await this.database.db.insert(employeeDocuments).values(
        dto.documents.map((doc) => ({
          employeeId,
          documentType: doc.documentType,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          s3Key: doc.s3Key,
          s3Url: doc.s3Url,
          verified: false,
        })),
      );
    }

    // Crear workflow de Onboarding en estado TH_REVIEW con SLA de 24h
    const slaDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [workflow] = await this.database.db
      .insert(onboardingOffboardingWorkflows)
      .values({
        employeeId,
        flowType: 'ONBOARDING',
        urgency: 'STANDARD',
        currentStep: 'TH_REVIEW',
        slaDeadline,
        isOutOfSla: false,
        notes: duplicate.isRehire
          ? 'Reintegro detectado automáticamente. Expediente actualizado y firmado bajo Ley 1581.'
          : 'Pre-ingreso completado por el candidato con firma electrónica Ley 1581.',
      })
      .returning();

    await this.auditService.record({
      actorId: dto.personalEmail,
      action: duplicate.isRehire ? 'PRE_ONBOARDING_REHIRE_SUBMITTED' : 'PRE_ONBOARDING_SUBMITTED',
      entity: 'employees',
      entityId: employeeId,
      newValues: {
        workflowId: workflow.id,
        age: computedAge,
        consentSha256: consentHash,
        isRehire: duplicate.isRehire,
      },
    });

    return {
      employeeId,
      workflowId: workflow.id,
      isRehire: duplicate.isRehire,
      computedAge,
      currentStep: workflow.currentStep,
      consentReceipt: {
        id: consentRecord.id,
        policyVersion: consentRecord.policyVersion,
        documentSha256Hash: consentRecord.documentSha256Hash,
        signedAt: consentRecord.signedAt,
      },
    };
  }
}
