import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AuthenticatedUserProfile,
  OPERATIONAL_AREAS,
  OperationalArea,
  SUPABASE_FREE_MAX_FILE_SIZE_BYTES,
  TIME_REQUEST_CATEGORIES,
  TIME_REQUEST_STATUSES,
  TimeRequestCategory,
  TimeRequestStatus,
} from '@alliance-hcm/shared';
import { buildContentDispositionHeader } from '../../common/utils/file-header.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTimeRequestDto, ReviewTimeRequestDto } from './dto/time-requests.dto';
import { TimeRequestsService } from './time-requests.service';

@ApiTags('Time Requests')
@ApiBearerAuth()
@Controller('time-requests')
export class TimeRequestsController {
  constructor(private readonly timeRequestsService: TimeRequestsService) {}

  @Get()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Listar incapacidades, licencias, permisos personales y horas extra con KPIs',
  })
  @ApiQuery({ name: 'category', enum: TIME_REQUEST_CATEGORIES, required: false })
  @ApiQuery({ name: 'status', enum: TIME_REQUEST_STATUSES, required: false })
  @ApiQuery({ name: 'operationalArea', enum: OPERATIONAL_AREAS, required: false })
  @ApiQuery({ name: 'search', required: false })
  list(
    @CurrentUser() user: AuthenticatedUserProfile,
    @Query('category') category?: TimeRequestCategory,
    @Query('status') status?: TimeRequestStatus,
    @Query('operationalArea') operationalArea?: OperationalArea,
    @Query('search') search?: string,
  ) {
    return this.timeRequestsService.list(
      { category, status, operationalArea, search },
      user,
    );
  }

  @Post()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Registrar incapacidad, licencia, permiso personal o reporte de horas extra',
  })
  create(
    @Body() dto: CreateTimeRequestDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.timeRequestsService.create(dto, user);
  }

  @Post(':id/review')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Aprobar, rechazar o cancelar una novedad o solicitud de horas extra',
  })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewTimeRequestDto,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Req() req: Request,
  ) {
    const requestOrigin = req.headers.origin;
    return this.timeRequestsService.review(
      id,
      dto,
      user,
      typeof requestOrigin === 'string' ? requestOrigin : undefined,
    );
  }

  @Post(':id/support')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: SUPABASE_FREE_MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Adjuntar soporte médico o comprobante de incapacidad/licencia en Storage S3',
  })
  uploadSupport(
    @Param('id') id: string,
    @UploadedFile()
    file:
      | { originalname: string; mimetype: string; size: number; buffer: Buffer }
      | undefined,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo PDF o imagen de soporte.');
    }
    return this.timeRequestsService.uploadSupport(id, file, user);
  }

  @Get(':id/support/content')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'AREA_LEADER', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Previsualizar o descargar soporte binario de una novedad',
  })
  async getSupportContent(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @CurrentUser() user: AuthenticatedUserProfile,
    @Res() res: Response,
  ) {
    const file = await this.timeRequestsService.getSupportContent(id, user);
    const disposition = download === '1' || download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', buildContentDispositionHeader(disposition, file.fileName));
    res.send(file.buffer);
  }
}
