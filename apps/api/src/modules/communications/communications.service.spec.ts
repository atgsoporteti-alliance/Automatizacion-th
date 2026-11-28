import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { CommunicationsService } from './communications.service';

describe('CommunicationsService', () => {
  const thUser: AuthenticatedUserProfile = {
    id: 'user-th-1',
    email: 'th.analista@alliance.com',
    fullName: 'Valeria Quintero',
    role: 'TH_ANALYST',
    operationalArea: 'ALL',
    clearanceDepartment: null,
    isActive: true,
  };

  const customerUser: AuthenticatedUserProfile = {
    id: 'user-cust-1',
    email: 'operador.customer@alliance.com',
    fullName: 'Carlos Pérez',
    role: 'IT_SUPPORT',
    operationalArea: 'CUSTOMER',
    clearanceDepartment: null,
    isActive: true,
  };

  it('filtra borradores y áreas ajenas para usuarios no gestores y suprime analítica bajo umbral k=3', async () => {
    const surveyQuestions = [
      {
        id: 'q_enps',
        prompt: '¿Recomendarías Alliance? (0-10)',
        type: 'ENPS_10' as const,
        required: true,
      },
      {
        id: 'q_climate',
        prompt: 'Clima de equipo (1-5)',
        type: 'SCALE_5' as const,
        required: true,
      },
      {
        id: 'q_text',
        prompt: 'Comentario abierto',
        type: 'OPEN_TEXT' as const,
        required: false,
      },
    ];

    const dbMock = {
      db: {
        query: {
          newsPosts: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'post-public',
                title: 'Convenio Bienestar Q4',
                summary: 'Resumen',
                content: 'Detalle completo del comunicado',
                category: 'BENEFITS',
                targetArea: 'ALL',
                isPinned: true,
                isPublished: true,
                authorName: 'Valeria Quintero',
                authorEmail: thUser.email,
                authorRole: 'TH_ANALYST',
                publishedAt: new Date('2026-11-27T12:00:00Z'),
                createdAt: new Date('2026-11-27T12:00:00Z'),
                updatedAt: new Date('2026-11-27T12:00:00Z'),
              },
              {
                id: 'post-draft',
                title: 'Borrador confidencial',
                summary: null,
                content: 'No visible para colaboradores',
                category: 'GENERAL',
                targetArea: 'ALL',
                isPinned: false,
                isPublished: false,
                authorName: 'Valeria Quintero',
                authorEmail: thUser.email,
                authorRole: 'TH_ANALYST',
                publishedAt: new Date('2026-11-27T11:00:00Z'),
                createdAt: new Date('2026-11-27T11:00:00Z'),
                updatedAt: new Date('2026-11-27T11:00:00Z'),
              },
              {
                id: 'post-dsi',
                title: 'Mantenimiento DSI exclusivo',
                summary: null,
                content: 'Solo DSI',
                category: 'OPERATIONS',
                targetArea: 'DSI',
                isPinned: false,
                isPublished: true,
                authorName: 'Valeria Quintero',
                authorEmail: thUser.email,
                authorRole: 'TH_ANALYST',
                publishedAt: new Date('2026-11-27T10:00:00Z'),
                createdAt: new Date('2026-11-27T10:00:00Z'),
                updatedAt: new Date('2026-11-27T10:00:00Z'),
              },
            ]),
          },
          newsPostReactions: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'react-1',
                postId: 'post-public',
                userEmail: customerUser.email,
                reaction: 'LIKE',
                createdAt: new Date(),
              },
            ]),
          },
          newsPostComments: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          pulseSurveys: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'survey-small',
                title: 'Pulso recién abierto',
                description: 'Pocas respuestas aún',
                status: 'ACTIVE',
                targetArea: 'ALL',
                questions: surveyQuestions,
                isAnonymous: true,
                closesAt: '2026-12-31',
                createdByName: 'Valeria Quintero',
                createdByEmail: thUser.email,
                createdAt: new Date('2026-11-27T09:00:00Z'),
                updatedAt: new Date('2026-11-27T09:00:00Z'),
              },
              {
                id: 'survey-ready',
                title: 'Pulso Q4 consolidado',
                description: 'Muestra suficiente',
                status: 'ACTIVE',
                targetArea: 'ALL',
                questions: surveyQuestions,
                isAnonymous: true,
                closesAt: '2026-12-31',
                createdByName: 'Valeria Quintero',
                createdByEmail: thUser.email,
                createdAt: new Date('2026-11-26T09:00:00Z'),
                updatedAt: new Date('2026-11-26T09:00:00Z'),
              },
            ]),
          },
          pulseSurveyResponses: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'r-1',
                surveyId: 'survey-small',
                operationalAreaSnapshot: 'CUSTOMER',
                answers: { q_enps: 2, q_climate: 1, q_text: 'Dato identificable' },
                submittedDay: '2026-11-27',
              },
              {
                id: 'r-2',
                surveyId: 'survey-small',
                operationalAreaSnapshot: 'CUSTOMER',
                answers: { q_enps: 8, q_climate: 4, q_text: 'Segundo comentario' },
                submittedDay: '2026-11-27',
              },
              {
                id: 'r-3',
                surveyId: 'survey-ready',
                operationalAreaSnapshot: 'CUSTOMER',
                answers: { q_enps: 10, q_climate: 5, q_text: 'Zeta último orden envío' },
                submittedDay: '2026-11-27',
              },
              {
                id: 'r-4',
                surveyId: 'survey-ready',
                operationalAreaSnapshot: 'CUSTOMER',
                answers: { q_enps: 9, q_climate: 4, q_text: 'Alfa primero alfabético' },
                submittedDay: '2026-11-27',
              },
              {
                id: 'r-5',
                surveyId: 'survey-ready',
                operationalAreaSnapshot: 'CUSTOMER',
                answers: { q_enps: 5, q_climate: 3, q_text: 'Mejorar turnos' },
                submittedDay: '2026-11-27',
              },
              {
                id: 'r-6',
                surveyId: 'survey-ready',
                operationalAreaSnapshot: 'DSI',
                answers: { q_enps: 10, q_climate: 5 },
                submittedDay: '2026-11-27',
              },
            ]),
          },
          pulseSurveyParticipations: {
            findMany: jest.fn().mockResolvedValue([]),
          },
        },
      },
    };

    const service = new CommunicationsService(dbMock as never);
    const overview = await service.getOverview({}, customerUser);

    expect(overview.permissions.canManageCommunications).toBe(false);
    expect(overview.posts).toHaveLength(1);
    expect(overview.posts[0].id).toBe('post-public');
    expect(overview.posts[0].hasUserReacted).toBe(true);

    // Con 2 respuestas (<3), métricas eNPS, desglose por área y comentarios se suprimen
    const smallSurvey = overview.surveys.find((s) => s.id === 'survey-small')!;
    expect(smallSurvey.isKAnonymityMet).toBe(false);
    expect(smallSurvey.overallEnps).toBeNull();
    expect(smallSurvey.areaBreakdown).toEqual([]);
    expect(smallSurvey.questionSummaries[2].openTextAnswers).toEqual([]);

    // Con 4 respuestas (>=3): 3 promotores (10,9,10), 0 pasivos, 1 detractor (5) => eNPS = +50
    const readySurvey = overview.surveys.find((s) => s.id === 'survey-ready')!;
    expect(readySurvey.isKAnonymityMet).toBe(true);
    expect(readySurvey.overallEnps).toEqual({
      totalRatings: 4,
      promoters: 3,
      passives: 0,
      detractors: 1,
      score: 50,
    });
    // Área DSI con solo 1 voto queda agrupada bajo PROTECTED
    expect(readySurvey.areaBreakdown).toEqual([
      { area: 'CUSTOMER', label: 'Customer Operations', count: 3, percentage: 75 },
      {
        area: 'PROTECTED',
        label: 'Otras áreas (< 3 respuestas protegidas)',
        count: 1,
        percentage: 25,
      },
    ]);
    // Comentarios abiertos se devuelven ordenados alfabéticamente y sin autor
    expect(readySurvey.questionSummaries[2].openTextAnswers).toEqual([
      'Alfa primero alfabético',
      'Mejorar turnos',
      'Zeta último orden envío',
    ]);
  });

  it('impide doble voto anónimo mediante participantHash HMAC sin guardar userId en pulse_survey_responses', async () => {
    const insertedTables: Array<{ table: string; values: Record<string, unknown> }> = [];

    const surveyRecord = {
      id: 'survey-1',
      title: 'Pulso Semanal',
      status: 'ACTIVE',
      targetArea: 'ALL',
      closesAt: '2099-12-31',
      questions: [
        { id: 'q_climate', prompt: 'Clima', type: 'SCALE_5', required: true },
        { id: 'q_enps', prompt: 'eNPS', type: 'ENPS_10', required: true },
      ],
    };

    const participationFindFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'part-1', surveyId: 'survey-1', participantHash: 'abc' });

    const dbMock = {
      db: {
        query: {
          pulseSurveys: {
            findFirst: jest.fn().mockResolvedValue(surveyRecord),
          },
          pulseSurveyParticipations: {
            findFirst: participationFindFirst,
          },
        },
        insert: jest.fn().mockImplementation((tableObj: { _: { name?: string } }) => ({
          values: jest.fn().mockImplementation(async (val: Record<string, unknown>) => {
            insertedTables.push({
              table: tableObj?._?.name ?? 'table',
              values: val,
            });
            return [val];
          }),
        })),
      },
    };

    const service = new CommunicationsService(dbMock as never);
    const receipt = await service.submitPulseResponse(
      'survey-1',
      { answers: { q_climate: 5, q_enps: 10, extraMaliciousKey: 'ignored' } },
      customerUser,
    );

    expect(receipt.submitted).toBe(true);
    expect(insertedTables).toHaveLength(2);

    const responseRow = insertedTables[1].values;
    expect(responseRow.answers).toEqual({ q_climate: 5, q_enps: 10 });
    expect(responseRow.operationalAreaSnapshot).toBe('CUSTOMER');
    expect(responseRow).not.toHaveProperty('userEmail');
    expect(responseRow).not.toHaveProperty('userId');
    expect(responseRow).not.toHaveProperty('participantHash');
    expect(responseRow).not.toHaveProperty('ip');

    await expect(
      service.submitPulseResponse(
        'survey-1',
        { answers: { q_climate: 4, q_enps: 8 } },
        customerUser,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('valida rango numérico de preguntas y área operativa objetivo al votar', async () => {
    const dbMock = {
      db: {
        query: {
          pulseSurveys: {
            findFirst: jest
              .fn()
              .mockResolvedValueOnce({
                id: 'survey-dsi',
                title: 'Solo DSI',
                status: 'ACTIVE',
                targetArea: 'DSI',
                closesAt: null,
                questions: [{ id: 'q_1', prompt: 'Clima', type: 'SCALE_5', required: true }],
              })
              .mockResolvedValueOnce({
                id: 'survey-all',
                title: 'Global',
                status: 'ACTIVE',
                targetArea: 'ALL',
                closesAt: null,
                questions: [{ id: 'q_1', prompt: 'Clima', type: 'SCALE_5', required: true }],
              }),
          },
        },
      },
    };

    const service = new CommunicationsService(dbMock as never);

    await expect(
      service.submitPulseResponse('survey-dsi', { answers: { q_1: 5 } }, customerUser),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.submitPulseResponse('survey-all', { answers: { q_1: 9 } }, customerUser),
    ).rejects.toThrow(BadRequestException);
  });
});
