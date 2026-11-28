import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
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

export interface StorageHealthSummary {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  endpointHost: string;
  isLocalEndpoint: boolean;
  bucket: string;
  bucketAccessible: boolean;
  legacyBuckets: string[];
  hasCustomCredentials: boolean;
  availableBuckets: string[];
  latencyMs: number;
  message: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly hasCustomCredentials: boolean;
  private bucketEnsured = false;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000').trim();
    this.bucket = this.config.get<string>('S3_BUCKET', 'alliance').trim();
    const accessKey = this.config.get<string>('S3_ACCESS_KEY', 'minioadmin').trim();
    const secretKey = this.config.get<string>('S3_SECRET_KEY', 'minioadmin123').trim();
    this.hasCustomCredentials = Boolean(
      accessKey &&
        secretKey &&
        accessKey !== 'minioadmin' &&
        secretKey !== 'minioadmin123',
    );

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: this.config.get<string>('S3_REGION', 'us-west-2').trim(),
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE', 'true').trim() === 'true',
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  public getBucketName(): string {
    return this.bucket;
  }

  public async checkHealth(): Promise<StorageHealthSummary> {
    const start = Date.now();
    const isLocalEndpoint =
      this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1');
    let endpointHost = this.endpoint;
    try {
      endpointHost = new URL(this.endpoint).host;
    } catch {
      // mantener valor original si no parsea como URL
    }

    const legacyBuckets = this.getBucketCandidates().filter((b) => b !== this.bucket);

    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const probe = Promise.all([
        this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket })),
        this.s3Client.send(new ListBucketsCommand({})).catch(() => ({ Buckets: [] })),
      ]);
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout conectando a S3/Storage (3.5s)')), 3500);
      });

      const [, listRes] = await Promise.race([probe, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
      });

      const availableBuckets = (listRes.Buckets ?? [])
        .map((b) => b.Name)
        .filter((n): n is string => Boolean(n));

      const latencyMs = Date.now() - start;
      const isDegraded = isLocalEndpoint || !this.hasCustomCredentials;
      return {
        status: isDegraded ? 'DEGRADED' : 'UP',
        endpointHost,
        isLocalEndpoint,
        bucket: this.bucket,
        bucketAccessible: true,
        legacyBuckets,
        hasCustomCredentials: this.hasCustomCredentials,
        availableBuckets,
        latencyMs,
        message: isDegraded
          ? `Bucket "${this.bucket}" responde en ${endpointHost}, pero usa endpoint o credenciales locales.`
          : `Bucket "${this.bucket}" operativo en Supabase Storage (${endpointHost}).`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: 'DOWN',
        endpointHost,
        isLocalEndpoint,
        bucket: this.bucket,
        bucketAccessible: false,
        legacyBuckets,
        hasCustomCredentials: this.hasCustomCredentials,
        availableBuckets: [],
        latencyMs: Date.now() - start,
        message: isLocalEndpoint
          ? `Sin conexión a S3 en ${endpointHost} (configuración apunta a MinIO local): ${msg}`
          : `Error accediendo al bucket "${this.bucket}": ${msg}`,
      };
    }
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

  /**
   * Extrae bucket y clave S3 a partir de una URL pública/autenticada de Supabase Storage o MinIO.
   */
  public resolveBucketAndKey(
    s3KeyOrUrl: string,
  ): { bucket?: string; key: string } {
    const clean = s3KeyOrUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      return { key: clean };
    }

    try {
      const parsed = new URL(clean);
      const markers = ['/storage/v1/object/public/', '/storage/v1/object/authenticated/', '/storage/v1/s3/'];
      for (const marker of markers) {
        const idx = parsed.pathname.indexOf(marker);
        if (idx !== -1) {
          const rest = parsed.pathname.slice(idx + marker.length).replace(/^\/+/, '');
          const slashIdx = rest.indexOf('/');
          if (slashIdx > 0) {
            return {
              bucket: decodeURIComponent(rest.slice(0, slashIdx)),
              key: decodeURIComponent(rest.slice(slashIdx + 1)),
            };
          }
        }
      }

      const pathParts = parsed.pathname.replace(/^\/+/, '').split('/');
      if (pathParts.length >= 2) {
        return {
          bucket: decodeURIComponent(pathParts[0]),
          key: decodeURIComponent(pathParts.slice(1).join('/')),
        };
      }
    } catch {
      // conservar texto original si no es URL válida
    }

    return { key: clean };
  }

  private getBucketCandidates(explicitBucket?: string): string[] {
    const legacyRaw = this.config.get<string>('S3_LEGACY_BUCKETS', 'alliance-hcm-docs,alliance');
    const legacyBuckets = legacyRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return Array.from(
      new Set([explicitBucket, this.bucket, ...legacyBuckets].filter((b): b is string => Boolean(b))),
    );
  }

  async getObjectBuffer(
    s3Key: string,
    options?: { sourceUrl?: string | null },
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const urlRef = options?.sourceUrl ? this.resolveBucketAndKey(options.sourceUrl) : null;
    const directRef = this.resolveBucketAndKey(s3Key);
    const resolvedKey = directRef.key;
    const bucketCandidates = this.getBucketCandidates(urlRef?.bucket ?? directRef.bucket);

    let lastNotFoundError = false;
    let lastInfraError: unknown = null;

    for (const bucketName of bucketCandidates) {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: resolvedKey,
          }),
        );

        if (!response.Body) {
          lastNotFoundError = true;
          continue;
        }

        const bytes = await response.Body.transformToByteArray();
        return {
          buffer: Buffer.from(bytes),
          contentType: response.ContentType ?? 'application/octet-stream',
        };
      } catch (err) {
        const errRecord = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
        const statusCode = errRecord?.$metadata?.httpStatusCode;
        const code = errRecord?.Code ?? errRecord?.name ?? '';
        const isNotFound =
          statusCode === 404 || code === 'NoSuchKey' || code === 'NotFound' || code === 'NoSuchBucket';

        if (isNotFound) {
          lastNotFoundError = true;
          continue;
        }

        lastInfraError = err;
        break;
      }
    }

    if (lastInfraError) {
      const msg =
        lastInfraError instanceof Error ? lastInfraError.message : String(lastInfraError);
      this.logger.error(
        `Error conectando con Supabase/S3 Storage (${this.endpoint}, bucket=${this.bucket}, key=${resolvedKey}): ${msg}`,
      );
      const localHint = this.endpoint.includes('localhost')
        ? ' El endpoint S3 configurado apunta a localhost y no a Supabase Storage.'
        : '';
      throw new ServiceUnavailableException(
        `No se pudo leer el archivo desde Storage (${this.bucket}).${localHint} Verifica las variables S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY y S3_SECRET_KEY.`,
      );
    }

    if (lastNotFoundError) {
      this.logger.warn(
        `Archivo no encontrado en Storage (buckets probados: ${bucketCandidates.join(', ')}): ${resolvedKey}`,
      );
      throw new NotFoundException(
        `El archivo no se encontró en Supabase Storage (buckets consultados: ${bucketCandidates.join(', ')}). Si corresponde a un registro semilla de demostración, adjunta el archivo nuevamente para almacenarlo en la nube.`,
      );
    }

    throw new NotFoundException(`El objeto ${resolvedKey} no contiene datos.`);
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
