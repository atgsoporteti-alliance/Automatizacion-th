import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import type { Response } from 'express';
import {
  AuthenticatedUserProfile,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  ContractStatus,
  ContractType,
  OPERATIONAL_AREAS,
  OperationalArea,
  SUPABASE_FREE_MAX_FILE_SIZE_BYTES,
} from '@alliance-hcm/shared';
import { buildContentDispositionHeader } from '../../common/utils/file-header.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ContractDateField,
  ContractSortBy,
  ContractsService,
} from './contracts.service';
import {
  CreateContractDto,
  RenewContractDto,
  TerminateContractDto,
  UpdateContractDto,
} from './dto/contracts.dto';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Listar todos los contratos laborales con búsqueda por nombre, cédula, cargo y rango de fechas',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'contractType', enum: CONTRACT_TYPES, required: false })
  @ApiQuery({ name: 'status', enum: CONTRACT_STATUSES, required: false })
  @ApiQuery({ name: 'operationalArea', enum: OPERATIONAL_AREAS, required: false })
  @ApiQuery({ name: 'dateField', required: false, enum: ['startsAt', 'endsAt', 'signedAt', 'any'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'hasDocument', required: false })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['startsAt_desc', 'startsAt_asc', 'endsAt_asc', 'endsAt_desc', 'name_asc', 'updated_desc'],
  })
  list(
    @Query('search') search?: string,
    @Query('contractType') contractType?: ContractType,
    @Query('status') status?: ContractStatus,
    @Query('operationalArea') operationalArea?: OperationalArea,
    @Query('dateField') dateField?: ContractDateField,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('hasDocument') hasDocument?: string,
    @Query('sortBy') sortBy?: ContractSortBy,
  ) {
    return this.contractsService.list({
      search,
      contractType,
      status,
      operationalArea,
      dateField,
      dateFrom,
      dateTo,
      hasDocument:
        hasDocument === 'true' || hasDocument === '1'
          ? true
          : hasDocument === 'false' || hasDocument === '0'
            ? false
            : undefined,
      sortBy,
    });
  }

  @Post()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Registrar un nuevo contrato laboral para un colaborador' })
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.contractsService.create(dto, user);
  }

  @Patch(':id')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Actualizar condiciones, fechas o notas de un contrato' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.contractsService.update(id, dto, user);
  }

  @Post(':id/renew')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Prorrogar o renovar un contrato laboral' })
  renew(
    @Param('id') id: string,
    @Body() dto: RenewContractDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.contractsService.renew(id, dto, user);
  }

  @Post(':id/terminate')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Marcar terminación o cierre de un contrato laboral' })
  terminate(
    @Param('id') id: string,
    @Body() dto: TerminateContractDto,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    return this.contractsService.terminate(id, dto, user);
  }

  @Post(':id/document')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
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
    summary: 'Adjuntar o reemplazar el PDF del contrato en Supabase Storage (alliance)',
  })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile()
    file:
      | { originalname: string; mimetype: string; size: number; buffer: Buffer }
      | undefined,
    @CurrentUser() user: AuthenticatedUserProfile,
  ) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo PDF o imagen del contrato.');
    }
    return this.contractsService.uploadDocument(id, file, user);
  }

  @Get(':id/document/content')
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Previsualizar o descargar el PDF del contrato' })
  async getDocumentContent(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.contractsService.getDocumentContent(id);
    const disposition = download === '1' || download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', buildContentDispositionHeader(disposition, file.fileName));
    res.send(file.buffer);
  }
}
