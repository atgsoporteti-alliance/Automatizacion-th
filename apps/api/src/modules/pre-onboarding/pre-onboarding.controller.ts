import { Body, Controller, Get, Headers, Ip, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PreOnboardingService } from './pre-onboarding.service';
import {
  GenerateMagicLinkDto,
  PresignedUrlDto,
  SendOtpDto,
  SubmitPreOnboardingDto,
  VerifyOtpDto,
} from './dto/pre-onboarding.dto';

@ApiTags('Pre-Onboarding')
@Controller('pre-onboarding')
export class PreOnboardingController {
  constructor(private readonly preOnboardingService: PreOnboardingService) { }

  @Post('magic-link')
  @ApiBearerAuth()
  @Roles('TH_ANALYST', 'TH_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Generar Magic Link temporal (JWT) para el candidato' })
  generateMagicLink(@Body() dto: GenerateMagicLinkDto) {
    return this.preOnboardingService.generateMagicLink(dto);
  }

  @Get('verify/:token')
  @Public()
  @ApiOperation({ summary: 'Validar Magic Link del portal de pre-ingreso' })
  verifyToken(@Param('token') token: string) {
    return this.preOnboardingService.verifyMagicLink(token);
  }

  @Post('otp/send')
  @Public()
  @ApiOperation({ summary: 'Enviar código OTP de 6 dígitos para firma electrónica Ley 1581' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.preOnboardingService.sendOtp(dto);
  }

  @Post('otp/verify')
  @Public()
  @ApiOperation({ summary: 'Verificar código OTP del candidato' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.preOnboardingService.verifyOtp(dto);
  }

  @Post('presigned-url')
  @Public()
  @ApiOperation({ summary: 'Generar URL prefirmada de MinIO/S3 para subir soportes PDF' })
  createPresignedUrl(@Body() dto: PresignedUrlDto) {
    return this.preOnboardingService.createPresignedUploadUrl(dto);
  }

  @Post('submit')
  @Public()
  @ApiOperation({
    summary:
      'Enviar los 24 campos de Pre-Ingreso, calcular edad automáticamente y registrar firma Ley 1581 (SHA-256 + IP + OTP)',
  })
  submit(
    @Body() dto: SubmitPreOnboardingDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.preOnboardingService.submitPreOnboarding(dto, {
      ip: ip || '127.0.0.1',
      userAgent: userAgent || 'unknown',
    });
  }
}
