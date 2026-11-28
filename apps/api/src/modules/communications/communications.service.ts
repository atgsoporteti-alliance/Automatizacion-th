import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  newsPostComments,
  newsPostReactions,
  newsPosts,
  pulseSurveyParticipations,
  pulseSurveyResponses,
  pulseSurveys,
} from '@alliance-hcm/database';
import {
  AuthenticatedUserProfile,
  NEWS_CATEGORY_LABELS,
  NewsCategory,
  OPERATIONAL_AREAS,
  OperationalArea,
  PULSE_MIN_RESPONSES_FOR_BREAKDOWN,
  PULSE_QUESTION_TYPES,
  PULSE_SURVEY_STATUS_LABELS,
  PulseEnpsSummary,
  PulseQuestionDefinition,
  PulseQuestionType,
  PulseSurveyStatus,
  UserOperationalArea,
  computeEnpsSummary,
} from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import {
  CreateNewsCommentDto,
  CreateNewsPostDto,
  CreatePulseSurveyDto,
  SubmitPulseResponseDto,
  UpdateNewsPostDto,
  UpdatePulseSurveyStatusDto,
} from './dto/communications.dto';

const MANAGER_ROLES = new Set(['TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN']);

const AREA_LABELS: Record<string, string> = {
  ALL: 'Toda la Compañía',
  CUSTOMER: 'Customer Operations',
  VENTAS: 'Ventas & Comercial',
  DSI: 'DSI / Tecnología',
  PROTECTED: `Otras áreas (< ${PULSE_MIN_RESPONSES_FOR_BREAKDOWN} respuestas protegidas)`,
};

export interface CommunicationsOverviewFilters {
  category?: NewsCategory;
  search?: string;
  surveyStatus?: PulseSurveyStatus;
}

export interface PulseDistributionBucket {
  label: string;
  count: number;
  percentage: number;
}

export interface PulseQuestionAnalytics {
  id: string;
  prompt: string;
  type: PulseQuestionType;
  required: boolean;
  options: string[];
  answeredCount: number;
  average: number | null;
  distribution: PulseDistributionBucket[];
  enps: PulseEnpsSummary | null;
  openTextAnswers: string[];
}

export interface PulseAreaBreakdownItem {
  area: string;
  label: string;
  count: number;
  percentage: number;
}

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  private canManage(user: AuthenticatedUserProfile): boolean {
    return MANAGER_ROLES.has(user.role);
  }

  private matchesTargetArea(
    targetArea: string,
    user: AuthenticatedUserProfile,
  ): boolean {
    if (this.canManage(user)) return true;
    if (!targetArea || targetArea === 'ALL') return true;
    if (!user.operationalArea || user.operationalArea === 'ALL') return true;
    return targetArea === user.operationalArea;
  }

  private toOperationalAreaSnapshot(
    userArea?: UserOperationalArea | null,
  ): OperationalArea | null {
    if (!userArea || userArea === 'ALL') return null;
    if ((OPERATIONAL_AREAS as readonly string[]).includes(userArea)) {
      return userArea as OperationalArea;
    }
    return null;
  }

  private getTodayDateOnly(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private computeParticipantHash(surveyId: string, email: string): string {
    const secret =
      this.configService?.get<string>('JWT_SECRET') ||
      this.configService?.get<string>('SUPABASE_JWT_SECRET') ||
      process.env.JWT_SECRET ||
      process.env.SUPABASE_JWT_SECRET ||
      'alliance-hcm-anonymous-pulse-salt';

    return createHmac('sha256', secret)
      .update(`${surveyId}:${email.trim().toLowerCase()}`)
      .digest('hex');
  }

  private assertCanInteractWithPost(
    post: { isPublished: boolean; targetArea: string },
    user: AuthenticatedUserProfile,
  ): void {
    if (!post.isPublished && !this.canManage(user)) {
      throw new ForbiddenException('Este comunicado aún se encuentra en borrador.');
    }
    if (!this.matchesTargetArea(post.targetArea, user)) {
      throw new ForbiddenException('Este comunicado no corresponde a tu área operativa.');
    }
  }

  private normalizeQuestions(
    rawQuestions: CreatePulseSurveyDto['questions'],
  ): PulseQuestionDefinition[] {
    const seenIds = new Set<string>();
    return rawQuestions.map((question, index) => {
      const baseId = question.id.trim() || `q_${index + 1}`;
      const id = seenIds.has(baseId) ? `${baseId}_${index + 1}` : baseId;
      seenIds.add(id);

      const prompt = question.prompt.trim();
      const type = question.type;
      if (!(PULSE_QUESTION_TYPES as readonly string[]).includes(type)) {
        throw new BadRequestException(`Tipo de pregunta no soportado: ${type}`);
      }

      let options: string[] | undefined;
      if (type === 'SINGLE_CHOICE') {
        const cleaned = Array.from(
          new Set((question.options ?? []).map((opt) => opt.trim()).filter(Boolean)),
        );
        if (cleaned.length < 2) {
          throw new BadRequestException(
            `La pregunta de selección única "${prompt}" requiere al menos 2 opciones distintas.`,
          );
        }
        options = cleaned;
      }

      return {
        id,
        prompt,
        type,
        required: question.required ?? true,
        ...(options ? { options } : {}),
      };
    });
  }

  private validateAndSanitizeAnswers(
    questions: PulseQuestionDefinition[],
    rawAnswers: Record<string, number | string>,
  ): Record<string, number | string> {
    const sanitized: Record<string, number | string> = {};

    for (const q of questions) {
      const value = rawAnswers?.[q.id];
      const isEmpty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0);

      if (isEmpty) {
        if (q.required !== false) {
          throw new BadRequestException(`Debes responder la pregunta: "${q.prompt}".`);
        }
        continue;
      }

      if (q.type === 'SCALE_5') {
        const num = Number(value);
        if (!Number.isInteger(num) || num < 1 || num > 5) {
          throw new BadRequestException(
            `La pregunta "${q.prompt}" requiere un valor entero entre 1 y 5.`,
          );
        }
        sanitized[q.id] = num;
        continue;
      }

      if (q.type === 'ENPS_10') {
        const num = Number(value);
        if (!Number.isInteger(num) || num < 0 || num > 10) {
          throw new BadRequestException(
            `La pregunta eNPS "${q.prompt}" requiere un entero entre 0 y 10.`,
          );
        }
        sanitized[q.id] = num;
        continue;
      }

      if (q.type === 'SINGLE_CHOICE') {
        const text = String(value).trim();
        if (!q.options?.includes(text)) {
          throw new BadRequestException(
            `Opción inválida para "${q.prompt}". Selecciona una alternativa permitida.`,
          );
        }
        sanitized[q.id] = text;
        continue;
      }

      const text = String(value).trim();
      if (text.length > 1000) {
        throw new BadRequestException(
          `El comentario en "${q.prompt}" no puede superar 1000 caracteres.`,
        );
      }
      sanitized[q.id] = text;
    }

    if (Object.keys(sanitized).length === 0) {
      throw new BadRequestException('Debes responder al menos una pregunta de la encuesta.');
    }

    return sanitized;
  }

  private buildQuestionAnalytics(
    questions: PulseQuestionDefinition[],
    responses: Array<{ answers: Record<string, number | string> }>,
    isKAnonymityMet: boolean,
  ): { questionSummaries: PulseQuestionAnalytics[]; overallEnps: PulseEnpsSummary | null } {
    const allEnpsScores: number[] = [];

    const questionSummaries = questions.map((q) => {
      const values = responses
        .map((r) => r.answers?.[q.id])
        .filter((v) => v !== undefined && v !== null && String(v).trim().length > 0);

      if (!isKAnonymityMet) {
        return {
          id: q.id,
          prompt: q.prompt,
          type: q.type,
          required: q.required !== false,
          options: q.options ?? [],
          answeredCount: values.length,
          average: null,
          distribution: [],
          enps: null,
          openTextAnswers: [],
        };
      }

      if (q.type === 'SCALE_5') {
        const nums = values.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
        const avg =
          nums.length > 0
            ? Number((nums.reduce((acc, cur) => acc + cur, 0) / nums.length).toFixed(2))
            : null;
        const counts = new Map<number, number>([
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
          [5, 0],
        ]);
        for (const n of nums) {
          counts.set(Math.round(n), (counts.get(Math.round(n)) ?? 0) + 1);
        }
        return {
          id: q.id,
          prompt: q.prompt,
          type: q.type,
          required: q.required !== false,
          options: [],
          answeredCount: nums.length,
          average: avg,
          distribution: [1, 2, 3, 4, 5].map((rating) => {
            const count = counts.get(rating) ?? 0;
            return {
              label: `${rating}`,
              count,
              percentage: nums.length > 0 ? Math.round((count / nums.length) * 100) : 0,
            };
          }),
          enps: null,
          openTextAnswers: [],
        };
      }

      if (q.type === 'ENPS_10') {
        const nums = values.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
        allEnpsScores.push(...nums);
        const enps = computeEnpsSummary(nums);
        const avg =
          nums.length > 0
            ? Number((nums.reduce((acc, cur) => acc + cur, 0) / nums.length).toFixed(2))
            : null;
        return {
          id: q.id,
          prompt: q.prompt,
          type: q.type,
          required: q.required !== false,
          options: [],
          answeredCount: nums.length,
          average: avg,
          distribution: [
            {
              label: 'Promotores (9-10)',
              count: enps.promoters,
              percentage:
                nums.length > 0 ? Math.round((enps.promoters / nums.length) * 100) : 0,
            },
            {
              label: 'Pasivos (7-8)',
              count: enps.passives,
              percentage:
                nums.length > 0 ? Math.round((enps.passives / nums.length) * 100) : 0,
            },
            {
              label: 'Detractores (0-6)',
              count: enps.detractors,
              percentage:
                nums.length > 0 ? Math.round((enps.detractors / nums.length) * 100) : 0,
            },
          ],
          enps,
          openTextAnswers: [],
        };
      }

      if (q.type === 'SINGLE_CHOICE') {
        const options = q.options ?? [];
        const counts = new Map<string, number>();
        for (const opt of options) counts.set(opt, 0);
        for (const v of values) {
          const text = String(v).trim();
          counts.set(text, (counts.get(text) ?? 0) + 1);
        }
        return {
          id: q.id,
          prompt: q.prompt,
          type: q.type,
          required: q.required !== false,
          options,
          answeredCount: values.length,
          average: null,
          distribution: Array.from(counts.entries()).map(([label, count]) => ({
            label,
            count,
            percentage: values.length > 0 ? Math.round((count / values.length) * 100) : 0,
          })),
          enps: null,
          openTextAnswers: [],
        };
      }

      // OPEN_TEXT: ordenados alfabéticamente para romper cualquier inferencia por orden de envío.
      const openTextAnswers = values
        .map((v) => String(v).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .slice(0, 100);

      return {
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        required: q.required !== false,
        options: [],
        answeredCount: openTextAnswers.length,
        average: null,
        distribution: [],
        enps: null,
        openTextAnswers,
      };
    });

    const overallEnps =
      isKAnonymityMet && allEnpsScores.length > 0
        ? computeEnpsSummary(allEnpsScores)
        : null;

    return { questionSummaries, overallEnps };
  }

  private buildAreaBreakdown(
    responses: Array<{ operationalAreaSnapshot: string | null }>,
    isKAnonymityMet: boolean,
  ): PulseAreaBreakdownItem[] {
    if (!isKAnonymityMet || responses.length === 0) return [];

    const counts = new Map<string, number>();
    for (const r of responses) {
      const bucket = r.operationalAreaSnapshot ?? 'ALL';
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    const total = responses.length;
    const result: PulseAreaBreakdownItem[] = [];
    let hiddenCount = 0;

    for (const [area, count] of counts.entries()) {
      if (area !== 'ALL' && count >= PULSE_MIN_RESPONSES_FOR_BREAKDOWN) {
        result.push({
          area,
          label: AREA_LABELS[area] ?? area,
          count,
          percentage: Math.round((count / total) * 100),
        });
      } else {
        hiddenCount += count;
      }
    }

    if (hiddenCount > 0) {
      result.push({
        area: 'PROTECTED',
        label: AREA_LABELS.PROTECTED,
        count: hiddenCount,
        percentage: Math.round((hiddenCount / total) * 100),
      });
    }

    return result.sort((a, b) => b.count - a.count);
  }

  async getOverview(
    filters: CommunicationsOverviewFilters,
    user: AuthenticatedUserProfile,
  ) {
    const isManager = this.canManage(user);
    const today = this.getTodayDateOnly();

    const [allPosts, allReactions, allComments, allSurveys, allResponses] =
      await Promise.all([
        this.database.db.query.newsPosts.findMany({
          orderBy: [
            desc(newsPosts.isPinned),
            desc(newsPosts.publishedAt),
            desc(newsPosts.createdAt),
          ],
        }),
        this.database.db.query.newsPostReactions.findMany({
          orderBy: [asc(newsPostReactions.createdAt)],
        }),
        this.database.db.query.newsPostComments.findMany({
          orderBy: [asc(newsPostComments.createdAt)],
        }),
        this.database.db.query.pulseSurveys.findMany({
          orderBy: [desc(pulseSurveys.createdAt)],
        }),
        this.database.db.query.pulseSurveyResponses.findMany({
          columns: {
            id: true,
            surveyId: true,
            operationalAreaSnapshot: true,
            answers: true,
            submittedDay: true,
          },
        }),
      ]);

    const visiblePostsBase = allPosts.filter((post) => {
      if (!isManager && !post.isPublished) return false;
      return this.matchesTargetArea(post.targetArea, user);
    });

    const normalizedSearch = filters.search?.trim().toLowerCase() ?? '';
    const filteredPosts = visiblePostsBase.filter((post) => {
      if (filters.category && post.category !== filters.category) return false;
      if (normalizedSearch) {
        const haystack = `${post.title} ${post.summary ?? ''} ${post.content} ${post.authorName}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });

    const reactionsByPost = new Map<string, typeof allReactions>();
    for (const r of allReactions) {
      const list = reactionsByPost.get(r.postId) ?? [];
      list.push(r);
      reactionsByPost.set(r.postId, list);
    }

    const commentsByPost = new Map<string, typeof allComments>();
    for (const c of allComments) {
      const list = commentsByPost.get(c.postId) ?? [];
      list.push(c);
      commentsByPost.set(c.postId, list);
    }

    const userEmailLower = user.email.trim().toLowerCase();
    const posts = filteredPosts.map((post) => {
      const postReactions = reactionsByPost.get(post.id) ?? [];
      const postComments = commentsByPost.get(post.id) ?? [];
      return {
        id: post.id,
        title: post.title,
        summary: post.summary,
        content: post.content,
        category: post.category,
        categoryLabel: NEWS_CATEGORY_LABELS[post.category] ?? post.category,
        targetArea: post.targetArea,
        targetAreaLabel: AREA_LABELS[post.targetArea] ?? post.targetArea,
        isPinned: post.isPinned,
        isPublished: post.isPublished,
        authorName: post.authorName,
        authorRole: post.authorRole,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        reactionsCount: postReactions.length,
        hasUserReacted: postReactions.some(
          (item) => item.userEmail.trim().toLowerCase() === userEmailLower,
        ),
        commentsCount: postComments.length,
        comments: postComments.map((c) => ({
          id: c.id,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt,
        })),
      };
    });

    const visibleSurveysBase = allSurveys.filter((survey) => {
      if (!isManager && survey.status === 'DRAFT') return false;
      return this.matchesTargetArea(survey.targetArea, user);
    });

    const filteredSurveys = visibleSurveysBase.filter((survey) => {
      if (filters.surveyStatus && survey.status !== filters.surveyStatus) return false;
      if (normalizedSearch) {
        const haystack = `${survey.title} ${survey.description ?? ''}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });

    const surveyHashPairs = visibleSurveysBase.map((s) => ({
      surveyId: s.id,
      hash: this.computeParticipantHash(s.id, user.email),
    }));

    const userParticipatedSurveyIds = new Set<string>();
    if (surveyHashPairs.length > 0) {
      const participations =
        await this.database.db.query.pulseSurveyParticipations.findMany({
          where: inArray(
            pulseSurveyParticipations.participantHash,
            surveyHashPairs.map((pair) => pair.hash),
          ),
        });
      for (const p of participations) {
        userParticipatedSurveyIds.add(p.surveyId);
      }
    }

    const responsesBySurvey = new Map<string, typeof allResponses>();
    for (const resp of allResponses) {
      const list = responsesBySurvey.get(resp.surveyId) ?? [];
      list.push(resp);
      responsesBySurvey.set(resp.surveyId, list);
    }

    const surveys = filteredSurveys.map((survey) => {
      const surveyResponses = responsesBySurvey.get(survey.id) ?? [];
      const totalResponses = surveyResponses.length;
      const isKAnonymityMet = totalResponses >= PULSE_MIN_RESPONSES_FOR_BREAKDOWN;
      const hasResponded = userParticipatedSurveyIds.has(survey.id);
      const isExpired = Boolean(survey.closesAt && survey.closesAt < today);
      const canRespond = survey.status === 'ACTIVE' && !isExpired && !hasResponded;

      const { questionSummaries, overallEnps } = this.buildQuestionAnalytics(
        survey.questions,
        surveyResponses,
        isKAnonymityMet,
      );

      return {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        status: survey.status,
        statusLabel: PULSE_SURVEY_STATUS_LABELS[survey.status] ?? survey.status,
        targetArea: survey.targetArea,
        targetAreaLabel: AREA_LABELS[survey.targetArea] ?? survey.targetArea,
        isAnonymous: survey.isAnonymous,
        closesAt: survey.closesAt,
        isExpired,
        createdByName: survey.createdByName,
        createdAt: survey.createdAt,
        updatedAt: survey.updatedAt,
        totalResponses,
        hasResponded,
        canRespond,
        privacyThreshold: PULSE_MIN_RESPONSES_FOR_BREAKDOWN,
        isKAnonymityMet,
        privacyNotice: isKAnonymityMet
          ? null
          : `Mínimo ${PULSE_MIN_RESPONSES_FOR_BREAKDOWN} respuestas requeridas para mostrar métricas y comentarios (protección k-anonimidad).`,
        overallEnps,
        areaBreakdown: this.buildAreaBreakdown(surveyResponses, isKAnonymityMet),
        questionSummaries,
      };
    });

    const latestSurveyWithEnps = surveys.find((s) => s.overallEnps?.score !== null && s.overallEnps);

    return {
      permissions: {
        canManageCommunications: isManager,
        canRespondPulse: true,
      },
      newsKpis: {
        totalPosts: visiblePostsBase.length,
        pinnedCount: visiblePostsBase.filter((p) => p.isPinned && p.isPublished).length,
        draftCount: visiblePostsBase.filter((p) => !p.isPublished).length,
        totalReactions: visiblePostsBase.reduce(
          (acc, p) => acc + (reactionsByPost.get(p.id)?.length ?? 0),
          0,
        ),
        totalComments: visiblePostsBase.reduce(
          (acc, p) => acc + (commentsByPost.get(p.id)?.length ?? 0),
          0,
        ),
      },
      posts,
      surveyKpis: {
        totalSurveys: visibleSurveysBase.length,
        activeCount: visibleSurveysBase.filter(
          (s) => s.status === 'ACTIVE' && !(s.closesAt && s.closesAt < today),
        ).length,
        respondedByMeCount: visibleSurveysBase.filter((s) =>
          userParticipatedSurveyIds.has(s.id),
        ).length,
        pendingForMeCount: visibleSurveysBase.filter(
          (s) =>
            s.status === 'ACTIVE' &&
            !(s.closesAt && s.closesAt < today) &&
            !userParticipatedSurveyIds.has(s.id),
        ).length,
        totalResponses: visibleSurveysBase.reduce(
          (acc, s) => acc + (responsesBySurvey.get(s.id)?.length ?? 0),
          0,
        ),
        latestEnpsScore: latestSurveyWithEnps?.overallEnps?.score ?? null,
      },
      surveys,
    };
  }

  async createNewsPost(dto: CreateNewsPostDto, user: AuthenticatedUserProfile) {
    const now = new Date();
    const isPublished = dto.isPublished ?? true;

    const [created] = await this.database.db
      .insert(newsPosts)
      .values({
        title: dto.title.trim(),
        summary: dto.summary?.trim() || null,
        content: dto.content.trim(),
        category: dto.category,
        targetArea: dto.targetArea ?? 'ALL',
        isPinned: dto.isPinned ?? false,
        isPublished,
        authorName: user.fullName,
        authorEmail: user.email,
        authorRole: user.role,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  }

  async updateNewsPost(
    postId: string,
    dto: UpdateNewsPostDto,
  ) {
    const existing = await this.database.db.query.newsPosts.findFirst({
      where: eq(newsPosts.id, postId),
    });
    if (!existing) {
      throw new NotFoundException(`Comunicado ${postId} no encontrado.`);
    }

    const [updated] = await this.database.db
      .update(newsPosts)
      .set({
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary.trim() || null } : {}),
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.targetArea !== undefined ? { targetArea: dto.targetArea } : {}),
        ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
        updatedAt: new Date(),
      })
      .where(eq(newsPosts.id, postId))
      .returning();

    return updated;
  }

  async deleteNewsPost(postId: string) {
    const existing = await this.database.db.query.newsPosts.findFirst({
      where: eq(newsPosts.id, postId),
    });
    if (!existing) {
      throw new NotFoundException(`Comunicado ${postId} no encontrado.`);
    }

    await this.database.db.delete(newsPosts).where(eq(newsPosts.id, postId));
    return { deleted: true, id: postId };
  }

  async toggleNewsReaction(postId: string, user: AuthenticatedUserProfile) {
    const post = await this.database.db.query.newsPosts.findFirst({
      where: eq(newsPosts.id, postId),
    });
    if (!post) {
      throw new NotFoundException(`Comunicado ${postId} no encontrado.`);
    }
    this.assertCanInteractWithPost(post, user);

    const emailNormalized = user.email.trim().toLowerCase();
    const existing = await this.database.db.query.newsPostReactions.findFirst({
      where: and(
        eq(newsPostReactions.postId, postId),
        eq(newsPostReactions.userEmail, emailNormalized),
      ),
    });

    if (existing) {
      await this.database.db
        .delete(newsPostReactions)
        .where(eq(newsPostReactions.id, existing.id));
      return { postId, reacted: false };
    }

    await this.database.db.insert(newsPostReactions).values({
      postId,
      userEmail: emailNormalized,
      reaction: 'LIKE',
    });

    return { postId, reacted: true };
  }

  async addNewsComment(
    postId: string,
    dto: CreateNewsCommentDto,
    user: AuthenticatedUserProfile,
  ) {
    const post = await this.database.db.query.newsPosts.findFirst({
      where: eq(newsPosts.id, postId),
    });
    if (!post) {
      throw new NotFoundException(`Comunicado ${postId} no encontrado.`);
    }
    this.assertCanInteractWithPost(post, user);

    const [created] = await this.database.db
      .insert(newsPostComments)
      .values({
        postId,
        authorName: user.fullName,
        authorEmail: user.email.trim().toLowerCase(),
        body: dto.body.trim(),
      })
      .returning();

    return {
      id: created.id,
      postId: created.postId,
      authorName: created.authorName,
      body: created.body,
      createdAt: created.createdAt,
    };
  }

  async createPulseSurvey(
    dto: CreatePulseSurveyDto,
    user: AuthenticatedUserProfile,
  ) {
    const questions = this.normalizeQuestions(dto.questions);
    const now = new Date();

    const [created] = await this.database.db
      .insert(pulseSurveys)
      .values({
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        status: dto.status ?? 'ACTIVE',
        targetArea: dto.targetArea ?? 'ALL',
        questions,
        isAnonymous: true,
        closesAt: dto.closesAt || null,
        createdByName: user.fullName,
        createdByEmail: user.email,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  }

  async updatePulseSurveyStatus(
    surveyId: string,
    dto: UpdatePulseSurveyStatusDto,
  ) {
    const existing = await this.database.db.query.pulseSurveys.findFirst({
      where: eq(pulseSurveys.id, surveyId),
    });
    if (!existing) {
      throw new NotFoundException(`Encuesta de pulso ${surveyId} no encontrada.`);
    }

    const [updated] = await this.database.db
      .update(pulseSurveys)
      .set({
        status: dto.status,
        updatedAt: new Date(),
      })
      .where(eq(pulseSurveys.id, surveyId))
      .returning();

    return updated;
  }

  async submitPulseResponse(
    surveyId: string,
    dto: SubmitPulseResponseDto,
    user: AuthenticatedUserProfile,
  ) {
    const survey = await this.database.db.query.pulseSurveys.findFirst({
      where: eq(pulseSurveys.id, surveyId),
    });
    if (!survey) {
      throw new NotFoundException(`Encuesta de pulso ${surveyId} no encontrada.`);
    }
    if (!this.matchesTargetArea(survey.targetArea, user)) {
      throw new ForbiddenException('Esta encuesta no corresponde a tu área operativa.');
    }
    if (survey.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Esta encuesta de pulso no está abierta para nuevas respuestas.',
      );
    }

    const today = this.getTodayDateOnly();
    if (survey.closesAt && survey.closesAt < today) {
      throw new BadRequestException('El plazo de respuesta para esta encuesta ya venció.');
    }

    const cleanAnswers = this.validateAndSanitizeAnswers(survey.questions, dto.answers);
    const participantHash = this.computeParticipantHash(survey.id, user.email);
    const operationalAreaSnapshot = this.toOperationalAreaSnapshot(user.operationalArea);

    const persistVote = async (dbClient: typeof this.database.db) => {
      const existingParticipation =
        await dbClient.query.pulseSurveyParticipations.findFirst({
          where: and(
            eq(pulseSurveyParticipations.surveyId, survey.id),
            eq(pulseSurveyParticipations.participantHash, participantHash),
          ),
        });

      if (existingParticipation) {
        throw new ConflictException(
          'Ya registraste tu respuesta anónima en esta encuesta.',
        );
      }

      try {
        await dbClient.insert(pulseSurveyParticipations).values({
          surveyId: survey.id,
          participantHash,
          submittedDay: today,
        });
      } catch (err: unknown) {
        const pgCode =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: string }).code)
            : '';
        if (pgCode === '23505') {
          throw new ConflictException(
            'Ya registraste tu respuesta anónima en esta encuesta.',
          );
        }
        throw err;
      }

      // Almacena respuestas desvinculadas de cualquier usuario, correo, hash o IP.
      await dbClient.insert(pulseSurveyResponses).values({
        surveyId: survey.id,
        operationalAreaSnapshot,
        answers: cleanAnswers,
        submittedDay: today,
      });
    };

    if (typeof this.database.db.transaction === 'function') {
      await this.database.db.transaction(async (tx) => {
        await persistVote(tx as unknown as typeof this.database.db);
      });
    } else {
      await persistVote(this.database.db);
    }

    return {
      submitted: true,
      surveyId: survey.id,
      anonymousReceipt: true,
      privacyGuarantee:
        'Tu respuesta fue almacenada de forma 100% anónima sin vínculo de identidad ni bitácora personal.',
    };
  }
}
