import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('queda inactivo limpiamente cuando faltan credenciales SMTP', async () => {
    const config = {
      get: jest.fn((_k: string, def?: string) => def ?? ''),
    } as unknown as ConfigService;

    const service = new MailService(config);
    expect(service.isConfigured()).toBe(false);

    const res = await service.sendOtpEmail({
      to: 'candidato@correo.com',
      code: '654321',
      ttlMinutes: 10,
    });
    expect(res.sent).toBe(false);
    expect(res.reason).toContain('SMTP no configurado');
  });

  it('inicializa el transporte SMTP cuando SMTP_USER y SMTP_PASS están definidos', () => {
    const values: Record<string, string> = {
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_USER: 'notificaciones@empresa.com',
      SMTP_PASS: 'abcd efgh ijkl mnop',
    };
    const config = {
      get: jest.fn((key: string, def?: string) => values[key] ?? def ?? ''),
    } as unknown as ConfigService;

    const service = new MailService(config);
    expect(service.isConfigured()).toBe(true);
  });
});
