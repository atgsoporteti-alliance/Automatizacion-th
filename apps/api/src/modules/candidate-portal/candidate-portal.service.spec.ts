import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CandidatePortalService } from './candidate-portal.service';

describe('CandidatePortalService — Visibilidad temporal de 15 días post-contratación', () => {
  const createdAt = new Date('2026-11-01T10:00:00.000Z');
  const hiringApprovedAt = new Date('2026-11-05T15:00:00.000Z');

  function makeService(
    mockProc: Record<string, unknown>,
    storageMock = {
      uploadObject: jest.fn(),
      getObjectBuffer: jest.fn(),
      validateFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(true),
    },
    options?: {
      meeting?: Record<string, unknown> | null;
      mailService?: { sendCandidateMeetingEmail: jest.Mock };
    },
  ) {
    const dbMock = {
      db: {
        query: {
          candidateProcesses: {
            findFirst: jest.fn().mockResolvedValue(mockProc),
          },
          candidateMeetings: {
            findFirst: jest.fn().mockResolvedValue(options?.meeting ?? null),
          },
        },
        update: jest.fn().mockImplementation(() => ({
          set: jest.fn().mockImplementation((vals: Record<string, unknown>) => ({
            where: jest.fn().mockReturnValue({
              returning: jest
                .fn()
                .mockResolvedValue([{ ...(options?.meeting ?? mockProc), ...vals }]),
            }),
          })),
        })),
        insert: jest.fn().mockImplementation(() => ({
          values: jest.fn().mockImplementation((vals: Record<string, unknown>) => ({
            returning: jest.fn().mockResolvedValue([{ id: 'row-1', ...vals }]),
          })),
        })),
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
      options?.mailService as never,
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
        s3Key: 'candidates/proc-1/cv/doc-new.pdf',
        publicUrl: 'https://cdn.example/doc-new.pdf',
        mimeType: 'application/pdf',
        fileSize: pdfBytes.length,
      }),
      getObjectBuffer: jest.fn().mockResolvedValue({
        buffer: pdfBytes,
        contentType: 'application/pdf',
      }),
      validateFile: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(true),
    };

    const mangledName = Buffer.from('Alliance HCM – Core TH.pdf', 'utf8').toString('latin1');
    const proc = {
      id: 'proc-1',
      accessToken: 'tok-123',
      candidateEmail: 'laura@gmail.com',
      stage: 'CV_UPLOADED',
      habeasDataAcceptedAt: createdAt,
      habeasDataPolicyVersion: 'ALLIANCE-HD-2026-v1.0',
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
    expect(storageMock.deleteObject).toHaveBeenCalledWith('candidates/proc-1/cv/doc.pdf');
  });

  it('exige autorización previa Ley 1581 antes de subir CV en el portal público', async () => {
    const procWithoutConsent = {
      id: 'proc-2',
      accessToken: 'tok-no-consent',
      candidateEmail: 'nuevo@gmail.com',
      stage: 'REGISTERED',
      habeasDataAcceptedAt: null,
      habeasDataPolicyVersion: null,
      cvS3Key: null,
      createdAt,
      hiringApprovedAt: null,
    };
    const service = makeService(procWithoutConsent);

    await expect(
      service.uploadCandidateCv('tok-no-consent', {
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
        size: 100,
        buffer: Buffer.from('%PDF-1.4'),
      }),
    ).rejects.toThrow(BadRequestException);

    const consented = await service.acceptPublicConsent('tok-no-consent', createdAt);
    expect(consented.accepted).toBe(true);
    expect(consented.habeasDataAcceptedAt).toEqual(createdAt);
  });

  it('normaliza enlaces de Microsoft Teams y Google Meet al crear y actualizar reuniones', async () => {
    const mailMock = {
      sendCandidateMeetingEmail: jest.fn().mockResolvedValue({ sent: true }),
    };
    const proc = {
      id: 'proc-1',
      accessToken: 'tok-123',
      candidateName: 'Laura Gómez',
      candidateEmail: 'laura@gmail.com',
      stage: 'CV_UPLOADED',
    };
    const existingMeeting = {
      id: 'meet-1',
      processId: 'proc-1',
      title: 'Entrevista Técnica',
      meetingType: 'Entrevista Técnica',
      scheduledAt: new Date('2026-12-01T15:00:00.000Z'),
      meetingUrl: null,
      location: 'Virtual · Google Meet / Teams',
      interviewerName: 'Carlos Ruiz',
      status: 'SCHEDULED',
      notes: null,
    };

    const service = makeService(proc, undefined, {
      meeting: existingMeeting,
      mailService: mailMock,
    });

    const created = await service.addMeeting(
      'proc-1',
      {
        title: 'Entrevista TH',
        scheduledAt: '2026-12-01T15:00:00.000Z',
        meetingUrl: 'teams.microsoft.com/l/meetup-join/19%3ameeting_abc',
        location: 'Virtual · Google Meet / Teams',
      },
      'th-user-1',
    );

    expect(created.meetingUrl).toBe('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc');
    expect(created.location).toBe('Virtual · Microsoft Teams');
    expect(mailMock.sendCandidateMeetingEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc',
        location: 'Virtual · Microsoft Teams',
        isUpdate: false,
      }),
    );

    const updated = await service.updateMeeting(
      'meet-1',
      {
        meetingUrl: 'meet.google.com/abc-defg-hij',
      },
      'th-user-1',
    );

    expect(updated.status).toBe('SCHEDULED');
    expect(updated.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(updated.location).toBe('Virtual · Google Meet');
    expect(mailMock.sendCandidateMeetingEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        location: 'Virtual · Google Meet',
        isUpdate: true,
      }),
    );

    await expect(
      service.addMeeting(
        'proc-1',
        {
          title: 'Enlace inválido',
          scheduledAt: '2026-12-01T15:00:00.000Z',
          meetingUrl: 'esto no es una url',
        },
        'th-user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
