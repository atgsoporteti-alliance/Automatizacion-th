import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { buildContentDispositionHeader } from '../../common/utils/file-header.util';
import { CandidatePortalService } from './candidate-portal.service';
import {
  CreateCandidateMeetingDto,
  CreateCandidateProcessDto,
  CreateCompetencyEvaluationDto,
  UpdateCandidateMeetingDto,
  UpdateCandidateStageDto,
} from './dto/candidate-portal.dto';

interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Candidate Portal')
@Controller('candidate-portal')
export class CandidatePortalController {
  constructor(private readonly candidatePortalService: CandidatePortalService) {}

  // --- Endpoints internos para Talento Humano / Super Admin (siempre visibles sin límite de 15 días) ---

  @Get('processes')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Listar procesos de selección y seguimiento de candidatos' })
  listProcesses(@Headers('origin') origin?: string) {
    return this.candidatePortalService.listProcesses(origin);
  }

  @Post('processes')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Crear proceso de selección y generar enlace del Portal Candidato' })
  createProcess(
    @Body() dto: CreateCandidateProcessDto,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Headers('origin') origin?: string,
  ) {
    return this.candidatePortalService.createProcess(dto, user.id, origin);
  }

  @Patch('processes/:id/stage')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Actualizar etapa del candidato; al aprobar contratación inicia ventana temporal de 15 días para el candidato',
  })
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateCandidateStageDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.candidatePortalService.updateStage(id, dto, user.id);
  }

  @Post('processes/:id/approve-hiring')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Aprobar contratación del candidato (activa visibilidad temporal de 15 días)',
  })
  approveHiring(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Body('note') note?: string,
  ) {
    return this.candidatePortalService.markHiringApproved({
      processId: id,
      actorId: user.id,
      note,
    });
  }

  @Get('interviews/agenda')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Obtener agenda global de entrevistas y resumen de evaluación de competencias (TH y Líderes)',
  })
  getInterviewsAgenda(
    @CurrentUser() user: AuthenticatedUserProfile,
    @Headers('origin') origin?: string,
  ) {
    return this.candidatePortalService.getInterviewsAgenda(user, origin);
  }

  @Post('processes/:id/meetings')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Programar reunión / entrevista en el portal del candidato' })
  addMeeting(
    @Param('id') id: string,
    @Body() dto: CreateCandidateMeetingDto,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Headers('origin') origin?: string,
  ) {
    return this.candidatePortalService.addMeeting(id, dto, user.id, origin);
  }

  @Patch('meetings/:meetingId')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Actualizar estado, enlace, duración o fecha de una reunión del candidato' })
  updateMeeting(
    @Param('meetingId') meetingId: string,
    @Body() dto: UpdateCandidateMeetingDto,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Headers('origin') origin?: string,
  ) {
    return this.candidatePortalService.updateMeeting(meetingId, dto, user.id, origin);
  }

  @Get('meetings/:meetingId/ics')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Descargar evento de entrevista en formato calendario (.ics)' })
  async downloadInternalMeetingIcs(
    @Param('meetingId') meetingId: string,
    @Res() res: Response,
  ) {
    const ics = await this.candidatePortalService.getMeetingIcs(meetingId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', buildContentDispositionHeader('attachment', ics.fileName));
    res.send(ics.content);
  }

  @Get('processes/:id/evaluations')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Listar evaluaciones de competencias de un candidato' })
  listEvaluations(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.candidatePortalService.listEvaluations(id, user);
  }

  @Post('processes/:id/evaluations')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Registrar evaluación de competencias (escala 1-5 ponderada) para un candidato',
  })
  createEvaluation(
    @Param('id') id: string,
    @Body() dto: CreateCompetencyEvaluationDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.candidatePortalService.createEvaluation(id, dto, user);
  }

  @Post('processes/:id/enable-pre-onboarding')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Habilitar enlace de Pre-Registro dentro del dashboard del candidato' })
  enablePreOnboarding(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Headers('origin') origin?: string,
  ) {
    return this.candidatePortalService.enablePreOnboarding(id, user.id, origin);
  }

  @Get('processes/:id/cv/content')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Previsualizar o descargar Hoja de Vida del candidato (uso interno TH)' })
  async getInternalCvContent(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.candidatePortalService.getInternalCvContent(id);
    const disposition = download === '1' || download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', buildContentDispositionHeader(disposition, file.fileName));
    res.send(file.buffer);
  }

  // --- Endpoints públicos del Candidato (visibles máximo 15 días tras aprobación TH) ---

  @Get('public/:token')
  @Public()
  @ApiOperation({ summary: 'Obtener dashboard completo del candidato según token seguro' })
  getPublicPortal(@Param('token') token: string, @Headers('origin') origin?: string) {
    return this.candidatePortalService.getPublicPortalByToken(token, origin);
  }

  @Post('public/:token/cv')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Subir Hoja de Vida (CV) al bucket S3 (alliance) para selección' })
  uploadCv(
    @Param('token') token: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo válido para tu hoja de vida.');
    }
    return this.candidatePortalService.uploadCandidateCv(token, file);
  }

  @Get('public/:token/cv/content')
  @Public()
  @ApiOperation({ summary: 'Previsualizar o descargar Hoja de Vida desde el portal del candidato' })
  async getPublicCvContent(
    @Param('token') token: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.candidatePortalService.getPublicCvContent(token);
    const disposition = download === '1' || download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', buildContentDispositionHeader(disposition, file.fileName));
    res.send(file.buffer);
  }

  @Post('public/:token/notifications/read')
  @Public()
  @ApiOperation({ summary: 'Marcar notificaciones del candidato como leídas' })
  markNotificationsRead(@Param('token') token: string) {
    return this.candidatePortalService.markNotificationsRead(token);
  }

  @Get('public/:token/meetings/:meetingId/ics')
  @Public()
  @ApiOperation({ summary: 'Descargar evento de entrevista (.ics) desde el portal del candidato' })
  async downloadPublicMeetingIcs(
    @Param('token') token: string,
    @Param('meetingId') meetingId: string,
    @Res() res: Response,
  ) {
    const ics = await this.candidatePortalService.getPublicMeetingIcs(token, meetingId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', buildContentDispositionHeader('attachment', ics.fileName));
    res.send(ics.content);
  }
}
