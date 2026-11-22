import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  const allowedOrigins = (process.env.WEB_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => {
      const trimmed = o.trim();
      if (!trimmed) return '';
      try {
        return new URL(trimmed).origin;
      } catch {
        return trimmed.replace(/\/+$/, '');
      }
    })
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('automatizacion-th-web.netlify.app')
      ) {
        return callback(null, true);
      }
      return callback(null, allowedOrigins[0] ?? false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Alliance HCM – Core TH & IT API')
    .setDescription(
      'API empresarial para Onboarding, Offboarding, Firma Electrónica Ley 1581 (Habeas Data), Motor de Reglas (Customer, Ventas, DSI) e integración bidireccional con ManageEngine ServiceDesk Plus.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Employees', 'Expediente Digital Único y detección anti-duplicados / reintegros')
    .addTag('Pre-Onboarding', 'Portal Pre-Ingreso, Magic Link, OTP, S3/MinIO y Firma Ley 1581')
    .addTag('Workflows', 'Máquina de estados Onboarding/Offboarding, aprobaciones TH y Líder DSI')
    .addTag('Offboarding', 'Retiros programados/inmediatos y Paz y Salvo digital multi-área')
    .addTag('Helpdesk Webhooks', 'Integración bidireccional con ManageEngine ServiceDesk Plus')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Alliance HCM API corriendo en http://localhost:${port}/api`);
  logger.log(`📚 Documentación Swagger disponible en http://localhost:${port}/api/docs`);
}

bootstrap();
