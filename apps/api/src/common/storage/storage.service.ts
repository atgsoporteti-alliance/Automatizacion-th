import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  SUPABASE_FREE_MAX_FILE_SIZE_BYTES,
  SUPABASE_FREE_MAX_FILE_SIZE_LABEL,
} from '@alliance-hcm/shared';
import { randomUUID } from 'crypto';

export interface PresignedUploadResult {
  uploadUrl: string;
  s3Key: string;
  publicUrl: string;
  expiresInSeconds: number;
}

export interface UploadedObjectResult {
  s3Key: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private bucketEnsured = false;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000').trim();
    this.bucket = this.config.get<string>('S3_BUCKET', 'alliance').trim();

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: this.config.get<string>('S3_REGION', 'us-west-2').trim(),
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE', 'true').trim() === 'true',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'minioadmin').trim(),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', 'minioadmin123').trim(),
      },
    });
  }

  public getBucketName(): string {
    return this.bucket;
  }

  validateFile(params: {
    buffer: Buffer;
    mimeType?: string | null;
    fileName: string;
    allowedMimeTypes: readonly string[];
    maxBytes?: number;
  }): void {
    if (!params.buffer || params.buffer.length === 0) {
      throw new BadRequestException('El archivo adjunto está vacío.');
    }

    const maxBytes = params.maxBytes ?? SUPABASE_FREE_MAX_FILE_SIZE_BYTES;
    if (params.buffer.length > maxBytes) {
      throw new BadRequestException(
        `El archivo "${params.fileName}" supera el límite de ${SUPABASE_FREE_MAX_FILE_SIZE_LABEL} configurado para Supabase Storage (Free Tier). Comprímelo o reduce su tamaño antes de subirlo.`,
      );
    }

    const cleanMime = (params.mimeType ?? '').trim().toLowerCase().split(';')[0];
    const ext = params.fileName.toLowerCase().split('.').pop() ?? '';
    const allowedExtMap: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const inferredMime = allowedExtMap[ext];

    const mimeAccepted = Boolean(cleanMime && params.allowedMimeTypes.includes(cleanMime));
    const fallbackExtAccepted =
      (!cleanMime || cleanMime === 'application/octet-stream') &&
      Boolean(inferredMime && params.allowedMimeTypes.includes(inferredMime));

    if (!mimeAccepted && !fallbackExtAccepted) {
      throw new BadRequestException(
        `Formato no permitido para "${params.fileName}" (${cleanMime || 'desconocido'}). Sube un archivo PDF o imagen válida.`,
      );
    }
  }

  async deleteObject(s3Key?: string | null): Promise<boolean> {
    const cleanKey = s3Key?.trim();
    if (!cleanKey || cleanKey.startsWith('demo/') || cleanKey.startsWith('http')) {
      return false;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey,
        }),
      );
      this.logger.log(`Objeto previo eliminado de S3 (${this.bucket}): ${cleanKey}`);
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo eliminar objeto previo ${cleanKey} de S3 (${this.bucket}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async ensureBucketExists(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketEnsured = true;
    } catch {
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.bucketEnsured = true;
        this.logger.log(`Bucket S3 creado: ${this.bucket}`);
      } catch (err) {
        this.logger.warn(
          `No se pudo verificar/crear bucket ${this.bucket}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private buildObjectUrl(s3Key: string): string {
    // En Supabase Storage S3, convertimos /storage/v1/s3 -> /storage/v1/object/public/<bucket>/<key> como referencia
    if (this.endpoint.includes('.storage.supabase.co/storage/v1/s3')) {
      const base = this.endpoint.replace('/storage/v1/s3', '/storage/v1/object/public');
      return `${base}/${this.bucket}/${s3Key}`;
    }
    return `${this.endpoint}/${this.bucket}/${s3Key}`;
  }

  async uploadObject(params: {
    folder: string;
    fileName: string;
    contentType: string;
    body: Buffer;
  }): Promise<UploadedObjectResult> {
    const sanitizedName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `${params.folder}/${randomUUID()}-${sanitizedName}`;

    const putCommand = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: params.contentType,
      Body: params.body,
    });

    try {
      await this.s3Client.send(putCommand);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('NoSuchBucket') || msg.includes('Bucket not found')) {
        await this.ensureBucketExists();
        await this.s3Client.send(putCommand);
      } else {
        throw error;
      }
    }

    this.logger.log(`Archivo subido a S3 (${this.bucket}): ${s3Key}`);

    return {
      s3Key,
      publicUrl: this.buildObjectUrl(s3Key),
      fileName: sanitizedName,
      mimeType: params.contentType,
      fileSize: params.body.length,
    };
  }

  async getObjectBuffer(s3Key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      }),
    );

    if (!response.Body) {
      throw new Error(`El objeto ${s3Key} no contiene datos`);
    }

    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: response.ContentType ?? 'application/octet-stream',
    };
  }

  async createPresignedDownloadUrl(
    s3Key: string,
    options?: { inline?: boolean; fileName?: string },
  ): Promise<string> {
    const disposition = options?.inline === false
      ? `attachment; filename="${options?.fileName ?? 'documento'}"`
      : `inline; filename="${options?.fileName ?? 'documento'}"`;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ResponseContentDisposition: disposition,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: 900 });
  }

  async createPresignedUploadUrl(params: {
    folder: string;
    fileName: string;
    contentType: string;
  }): Promise<PresignedUploadResult> {
    const sanitizedName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `${params.folder}/${randomUUID()}-${sanitizedName}`;
    const expiresInSeconds = 900;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: params.contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      uploadUrl,
      s3Key,
      publicUrl: this.buildObjectUrl(s3Key),
      expiresInSeconds,
    };
  }
}
