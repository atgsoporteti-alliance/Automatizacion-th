import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CandidatePortalService } from './candidate-portal.service';

describe('CandidatePortalService — Visibilidad temporal de 15 días post-contratación', () => {
  const createdAt = new Date('2026-11-01T10:00:00.000Z');
  const hiringApprovedAt = new Date('2026-11-05T15:00:00.000Z');

  function makeService(
    mockProc: Record<string, unknown>,
    storageMock = { uploadObject: jest.fn(), getObjectBuffer: jest.fn() },
  ) {
    const dbMock = {
      db: {
        query: {
          candidateProcesses: {
            findFirst: jest.fn().mockResolvedValue(mockProc),
          },
        },
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ ...mockProc, stage: 'HIRED_APPROVED' }]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'notif-1' }]),
          }),
        }),
      },
    };
    const auditMock = { record: jest.fn().mockResolvedValue(undefined) };
    const jwtMock = new JwtService({});
    const configMock = new ConfigService({ NODE_ENV: 'production' });

    return new CandidatePortalService(
      dbMock as never,
      auditMock as never,
      storageMock as never,
      jwtMock,
      configMock,
    );
  }

  it('muestra información completa al candidato durante los 15 días posteriores a la aprobación TH', async () => {
    const proc = {
      id: 'proc-1',
      accessToken: 'tok-123',
      candidateName: 'Laura Gómez',
      candidateEmail: 'laura@gmail.com',
      nationalId: '1019234567',
      appliedRole: 'Analista Customer',
      stage: 'HIRED_APPROVED',
      cvS3Key: 'candidates/proc-1/cv/cv.pdf',
      cvFileName: 'cv_laura.pdf',
      cvMimeType: 'application/pdf',
      cvFileSize: 12000,
      cvUploadedAt: createdAt,
      preOnboardingToken: 'jwt-pre',
      hiringApprovedAt,
      candidateAccessExpiresAt: new Date(hiringApprovedAt.getTime() + 15 * 24 * 60 * 60 * 1000),
      employee: null,
      workflow: null,
      meetings: [{ id: 'm1', title: 'Entrevista TH' }],
      notifications: [{ id: 'n1', title: 'Aprobada', isRead: false }],
    };

    const service = makeService(proc);
    const day14 = new Date(hiringApprovedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const portal = await service.getPublicPortalByToken('tok-123', undefined, day14);

    expect(portal.expired).toBe(false);
    expect(portal.visibility.isTemporarilyScoped).toBe(true);
    expect(portal.visibility.daysRemaining).toBe(1);
    expect('process' in portal && portal.process?.meetings).toHaveLength(1);
  });

  it('oculta el registro al candidato al cumplirse 15 días tras la aprobación TH y bloquea mutaciones', async () => {
    const proc = {
      id: 'proc-1',
      accessToken: 'tok-123',
      candidateName: 'Laura Gómez',
      candidateEmail: 'laura@gmail.com',
      nationalId: '1019234567',
      appliedRole: 'Analista Customer',
      stage: 'HIRED_APPROVED',
      cvS3Key: 'candidates/proc-1/cv/cv.pdf',
      cvFileName: 'cv_laura.pdf',
      preOnboardingToken: 'jwt-pre',
      hiringApprovedAt,
      candidateAccessExpiresAt: new Date(hiringApprovedAt.getTime() + 15 * 24 * 60 * 60 * 1000),
      employee: null,
      workflow: null,
      meetings: [{ id: 'm1', title: 'Entrevista TH' }],
      notifications: [{ id: 'n1', title: 'Aprobada', isRead: false }],
    };

    const service = makeService(proc);
    const day15Plus1Min = new Date(hiringApprovedAt.getTime() + 15 * 24 * 60 * 60 * 1000 + 60_000);
    const portal = await service.getPublicPortalByToken('tok-123', undefined, day15Plus1Min);

    expect(portal.expired).toBe(true);
    expect(portal.visibility.isExpired).toBe(true);
    expect(portal.visibility.daysRemaining).toBe(0);
    expect('process' in portal).toBe(false);

    await expect(
      service.uploadCandidateCv(
        'tok-123',
        { originalname: 'cv.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('pdf') },
        day15Plus1Min,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('devuelve Buffer binario crudo y decodifica nombres mojibake al obtener o subir la hoja de vida', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4\n%test\n');
    const storageMock = {
      uploadObject: jest.fn().mockResolvedValue({
        s3Key: 'candidates/proc-1/cv/doc.pdf',
        publicUrl: 'https://cdn.example/doc.pdf',
        mimeType: 'application/pdf',
        fileSize: pdfBytes.length,
      }),
      getObjectBuffer: jest.fn().mockResolvedValue({
        buffer: pdfBytes,
        contentType: 'application/pdf',
      }),
    };

    const mangledName = Buffer.from('Alliance HCM – Core TH.pdf', 'utf8').toString('latin1');
    const proc = {
      id: 'proc-1',
      accessToken: 'tok-123',
      candidateEmail: 'laura@gmail.com',
      stage: 'CV_UPLOADED',
      cvS3Key: 'candidates/proc-1/cv/doc.pdf',
      cvFileName: mangledName,
      cvMimeType: 'application/pdf',
      createdAt,
      hiringApprovedAt: null,
      candidateAccessExpiresAt: null,
      employee: null,
      workflow: null,
      meetings: [],
      notifications: [],
    };

    const service = makeService(proc, storageMock);

    const publicFile = await service.getPublicCvContent('tok-123');
    expect(Buffer.isBuffer(publicFile.buffer)).toBe(true);
    expect(publicFile.buffer.equals(pdfBytes)).toBe(true);
    expect(publicFile.fileName).toBe('Alliance HCM – Core TH.pdf');

    const internalFile = await service.getInternalCvContent('proc-1');
    expect(Buffer.isBuffer(internalFile.buffer)).toBe(true);
    expect(internalFile.buffer.equals(pdfBytes)).toBe(true);
    expect(internalFile.fileName).toBe('Alliance HCM – Core TH.pdf');

    await service.uploadCandidateCv('tok-123', {
      originalname: mangledName,
      mimetype: 'application/pdf',
      size: pdfBytes.length,
      buffer: pdfBytes,
    });
    expect(storageMock.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'Alliance HCM – Core TH.pdf' }),
    );
  });
});
