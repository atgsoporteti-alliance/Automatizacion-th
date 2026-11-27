import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const createConfigMock = (overrides: Record<string, string> = {}) =>
    ({
      get: jest.fn((key: string, defaultVal?: string) => {
        const values: Record<string, string> = {
          S3_ENDPOINT: 'https://project.storage.supabase.co/storage/v1/s3',
          S3_BUCKET: 'alliance',
          S3_REGION: 'us-west-2',
          S3_FORCE_PATH_STYLE: 'true',
          S3_ACCESS_KEY: 'test-key',
          S3_SECRET_KEY: 'test-secret',
          S3_LEGACY_BUCKETS: 'alliance-hcm-docs,alliance',
          ...overrides,
        };
        return values[key] ?? defaultVal;
      }),
    }) as unknown as ConfigService;

  it('extrae bucket y key desde URLs de Supabase Storage y MinIO', () => {
    const service = new StorageService(createConfigMock());

    expect(
      service.resolveBucketAndKey(
        'https://lyvnakpcmknesqxlvawq.storage.supabase.co/storage/v1/object/public/alliance-hcm-docs/employees/1111111/doc.pdf',
      ),
    ).toEqual({
      bucket: 'alliance-hcm-docs',
      key: 'employees/1111111/doc.pdf',
    });

    expect(service.resolveBucketAndKey('employees/123/contrato.pdf')).toEqual({
      key: 'employees/123/contrato.pdf',
    });
  });

  it('resuelve archivos antiguos en bucket legado cuando no están en el bucket principal', async () => {
    const service = new StorageService(createConfigMock());
    const sendMock = jest
      .fn()
      .mockRejectedValueOnce({ Code: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
      .mockResolvedValueOnce({
        ContentType: 'application/pdf',
        Body: { transformToByteArray: async () => new Uint8Array([37, 80, 68, 70]) },
      });
    (service as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send: sendMock };

    const res = await service.getObjectBuffer('employees/1111111/doc.pdf');
    expect(res.buffer.toString()).toBe('%PDF');
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0][0].input.Bucket).toBe('alliance');
    expect(sendMock.mock.calls[1][0].input.Bucket).toBe('alliance-hcm-docs');
  });

  it('lanza NotFoundException claro si el objeto no existe en ningún bucket', async () => {
    const service = new StorageService(createConfigMock());
    const sendMock = jest.fn().mockRejectedValue({
      Code: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    });
    (service as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send: sendMock };

    await expect(service.getObjectBuffer('employees/1032489102/cedula.pdf')).rejects.toThrow(
      NotFoundException,
    );
  });
});
