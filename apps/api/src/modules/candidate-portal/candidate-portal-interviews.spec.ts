import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  computeCompetencyScoreSummary,
  hasMeetingOverlap,
} from '@alliance-hcm/shared';
import { CandidatePortalService } from './candidate-portal.service';

describe('CandidatePortalService — Agendamiento, Conflictos, ICS y Evaluación de Competencias', () => {
  it('calcula promedio ponderado de competencias y detecta traslapes de entrevistas', () => {
    const summary = computeCompetencyScoreSummary([
      { key: 'COMUNICACION', label: 'Comunicación', score: 5, weight: 20 },
      { key: 'DOMINIO_TECNICO', label: 'Dominio Técnico', score: 4, weight: 30 },
      { key: 'RESOLUCION_PROBLEMAS', label: 'Resolución', score: 3, weight: 50 },
    ]);

    // (5*20 + 4*30 + 3*50) / 100 = 370 / 100 = 3.7
    expect(summary.overallScore).toBe(3.7);
    expect(summary.overallScoreScaled100).toBe(370);
    expect(summary.percentageScore).toBe(74);

    const a = new Date('2026-12-01T15:00:00.000Z');
    const b = new Date('2026-12-01T15:30:00.000Z');
    const c = new Date('2026-12-01T16:00:00.000Z');

    expect(hasMeetingOverlap(a, 45, b, 30)).toBe(true);
    expect(hasMeetingOverlap(a, 45, c, 30)).toBe(false);
  });

  it('bloquea doble agenda del mismo entrevistador y genera archivo .ics válido', async () => {
    const dbMock = {
      db: {
        query: {
          candidateProcesses: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'proc-1',
              candidateName: 'Laura Gómez',
              candidateEmail: 'laura@gmail.com',
              appliedRole: 'Analista Customer',
              stage: 'IN_SELECTION',
            }),
          },
          candidateMeetings: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'm-existing',
                title: 'Entrevista previa',
                scheduledAt: new Date('2026-12-01T15:00:00.000Z'),
                durationMinutes: 60,
                interviewerName: 'Carolina Mejía',
                interviewerEmail: 'carolina@alliance.com.co',
                status: 'SCHEDULED',
                process: { candidateName: 'Otro Candidato' },
              },
            ]),
            findFirst: jest.fn().mockResolvedValue({
              id: 'm-existing',
              processId: 'proc-1',
              title: 'Entrevista Técnica DSI',
              meetingType: 'Entrevista Técnica',
              scheduledAt: new Date('2026-12-01T15:00:00.000Z'),
              durationMinutes: 45,
              meetingUrl: 'https://teams.microsoft.com/l/meetup-join/demo',
              location: 'Virtual · Microsoft Teams',
              interviewerName: 'Carolina Mejía',
              notes: 'Traer portafolio.',
              process: {
                candidateName: 'Laura Gómez',
                appliedRole: 'Ingeniera Backend',
              },
            }),
          },
        },
      },
    };

    const service = new CandidatePortalService(
      dbMock as never,
      { record: jest.fn() } as never,
      { uploadObject: jest.fn(), getObjectBuffer: jest.fn() } as never,
      new JwtService({}),
      new ConfigService({}),
    );

    await expect(
      service.addMeeting(
        'proc-1',
        {
          title: 'Entrevista duplicada',
          scheduledAt: '2026-12-01T15:30:00.000Z',
          durationMinutes: 45,
          interviewerName: 'Carolina Mejía',
          interviewerEmail: 'carolina@alliance.com.co',
        },
        'th-1',
      ),
    ).rejects.toThrow(BadRequestException);

    const ics = await service.getMeetingIcs('m-existing');
    expect(ics.fileName).toContain('.ics');
    expect(ics.content).toContain('BEGIN:VCALENDAR');
    expect(ics.content).toContain('SUMMARY:Entrevista Técnica DSI · Laura Gómez');
    expect(ics.content).toContain('https://teams.microsoft.com/l/meetup-join/demo');
    expect(ics.content).toContain('END:VCALENDAR');
  });

  it('registra evaluación de competencias ponderada y marca entrevista vinculada como COMPLETED', async () => {
    const updateWhereMock = jest.fn().mockResolvedValue([]);
    const updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    const dbMock = {
      db: {
        query: {
          candidateProcesses: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'proc-1',
              candidateName: 'Laura Gómez',
              appliedRole: 'Desarrolladora DSI',
            }),
          },
          candidateMeetings: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'm-1',
              processId: 'proc-1',
              title: 'Entrevista Técnica',
              meetingType: 'Entrevista Técnica',
              operationalArea: 'DSI',
            }),
          },
        },
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockImplementation((vals: Record<string, unknown>) => ({
            returning: jest.fn().mockResolvedValue([{ id: 'eval-1', ...vals }]),
          })),
        }),
        update: jest.fn().mockReturnValue({ set: updateSetMock }),
      },
    };
    const auditMock = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new CandidatePortalService(
      dbMock as never,
      auditMock as never,
      { uploadObject: jest.fn(), getObjectBuffer: jest.fn() } as never,
      new JwtService({}),
      new ConfigService({}),
    );

    const evaluated = await service.createEvaluation(
      'proc-1',
      {
        meetingId: 'm-1',
        recommendation: 'STRONGLY_RECOMMEND',
        markMeetingCompleted: true,
        scores: [
          { key: 'COMUNICACION', label: 'Comunicación', score: 5, weight: 50 },
          { key: 'DOMINIO_TECNICO', label: 'Técnico', score: 4, weight: 50 },
        ],
        strengths: 'Dominio sólido de NestJS y Drizzle.',
      },
      {
        id: 'u-dsi',
        email: 'lider.dsi@alliance.com.co',
        fullName: 'Andrés Líder DSI',
        role: 'AREA_LEADER',
        operationalArea: 'DSI',
        clearanceDepartment: null,
        isActive: true,
      },
    );

    expect(evaluated.overallScore).toBe(4.5);
    expect(evaluated.percentageScore).toBe(90);
    expect(evaluated.recommendationLabel).toBe('Altamente Recomendado');
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'COMPLETED' }),
    );
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CANDIDATE_COMPETENCY_EVALUATED' }),
    );
  });
});
