import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('usa HTTPS Mail Relay firmado en entorno Render/producción para evitar bloqueo de puertos SMTP', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sent: true, messageId: '<relay-test@gmail.com>' }),
    } as Response);

    const values: Record<string, string> = {
      NODE_ENV: 'production',
      RENDER: 'true',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_USER: 'notificaciones@empresa.com',
      SMTP_PASS: 'abcd efgh ijkl mnop',
    };
    const config = {
      get: jest.fn((key: string, def?: string) => values[key] ?? def ?? ''),
    } as unknown as ConfigService;

    const service = new MailService(config);
    const res = await service.sendMagicLinkInviteEmail({
      to: 'candidato@correo.com',
      candidateName: 'Laura',
      magicLink: 'https://automatizacion-th-web.vercel.app/pre-ingreso/token-demo',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://automatizacion-th-web.vercel.app/api/mail/send');
    expect((init?.headers as Record<string, string>)['x-mail-sig']).toMatch(/^[a-f0-9]{64}$/);
    expect(res.sent).toBe(true);
    expect(res.messageId).toBe('<relay-test@gmail.com>');
  });
});
