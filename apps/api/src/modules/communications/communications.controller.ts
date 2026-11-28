import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUserProfile,
  NEWS_CATEGORIES,
  NewsCategory,
  PULSE_SURVEY_STATUSES,
  PulseSurveyStatus,
} from '@alliance-hcm/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CommunicationsService } from './communications.service';
import {
  CreateNewsCommentDto,
  CreateNewsPostDto,
  CreatePulseSurveyDto,
  SubmitPulseResponseDto,
  UpdateNewsPostDto,
  UpdatePulseSurveyStatusDto,
} from './dto/communications.dto';

const ALL_INTERNAL_ROLES = [
  'TH_ANALYST',
  'TH_ADMIN',
  'AREA_LEADER',
  'IT_SUPPORT',
  'CLEARANCE_APPROVER',
  'SUPER_ADMIN',
] as const;

@ApiTags('Communications')
@ApiBearerAuth()
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get('overview')
  @Roles(...ALL_INTERNAL_ROLES)
  @ApiOperation({
    summary:
      'Listar muro de noticias corporativas y encuestas de pulso con analítica protegida por k-anonimidad',
  })
  @ApiQuery({ name: 'category', enum: NEWS_CATEGORIES, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'surveyStatus', enum: PULSE_SURVEY_STATUSES, required: false })
  getOverview(
    @CurrentUser() user: AuthenticatedUserProfile,
    @Query('category') category?: NewsCategory,
    @Query('search') search?: string,
    @Query('surveyStatus') surveyStatus?: PulseSurveyStatus,
  ) {
    return this.communicationsService.getOverview(
      { category, search, surveyStatus },
      user,
    );
  }

  @Post('news')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Publicar un comunicado en el muro de noticias corporativas' })
  createNewsPost(
    @Body() dto: CreateNewsPostDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.communicationsService.createNewsPost(dto, user);
  }

  @Patch('news/:id')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Actualizar, fijar o cambiar publicación de un comunicado' })
  updateNewsPost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsPostDto,
  ) {
    return this.communicationsService.updateNewsPost(id, dto);
  }

  @Delete('news/:id')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Eliminar un comunicado del muro de noticias' })
  deleteNewsPost(@Param('id', ParseUUIDPipe) id: string) {
    return this.communicationsService.deleteNewsPost(id);
  }

  @Post('news/:id/react')
  @Roles(...ALL_INTERNAL_ROLES)
  @ApiOperation({ summary: 'Alternar reacción Me gusta sobre un comunicado' })
  toggleNewsReaction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.communicationsService.toggleNewsReaction(id, user);
  }

  @Post('news/:id/comments')
  @Roles(...ALL_INTERNAL_ROLES)
  @ApiOperation({ summary: 'Publicar un comentario en un comunicado' })
  addNewsComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNewsCommentDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.communicationsService.addNewsComment(id, dto, user);
  }

  @Post('surveys')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Crear una nueva encuesta de pulso anónima' })
  createPulseSurvey(
    @Body() dto: CreatePulseSurveyDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.communicationsService.createPulseSurvey(dto, user);
  }

  @Patch('surveys/:id/status')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Cambiar el estado de una encuesta de pulso (DRAFT/ACTIVE/CLOSED)' })
  updatePulseSurveyStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePulseSurveyStatusDto,
  ) {
    return this.communicationsService.updatePulseSurveyStatus(id, dto);
  }

  @Post('surveys/:id/respond')
  @Roles(...ALL_INTERNAL_ROLES)
  @ApiOperation({
    summary:
      'Enviar respuesta 100% anónima a una encuesta de pulso (sin vínculo de usuario ni bitácora)',
  })
  submitPulseResponse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitPulseResponseDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.communicationsService.submitPulseResponse(id, dto, user);
  }
}
