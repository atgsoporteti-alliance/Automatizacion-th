import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface PresignedUploadResult {
  uploadUrl: string;
  s3Key: string;
  publicUrl: string;
  expiresInSeconds: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    this.bucket = this.config.get<string>('S3_BUCKET', 'alliance-hcm-docs');

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') === 'true',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY', 'minioadmin123'),
      },
    });
  }

  private bucketEnsured = false;

  private async ensureBucketExists(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketEnsured = true;
    } catch {
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.bucketEnsured = true;
        this.logger.log(`Bucket S3/MinIO creado: ${this.bucket}`);
      } catch (err) {
        this.logger.warn(
          `No se pudo verificar/crear bucket ${this.bucket}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async createPresignedUploadUrl(params: {
    folder: string;
    fileName: string;
    contentType: string;
  }): Promise<PresignedUploadResult> {
    await this.ensureBucketExists();
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

    const publicUrl = `${this.endpoint}/${this.bucket}/${s3Key}`;
    this.logger.debug(`URL prefirmada generada para ${s3Key}`);

    return {
      uploadUrl,
      s3Key,
      publicUrl,
      expiresInSeconds,
    };
  }
}
