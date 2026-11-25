import { createHash, createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { detectMeetingPlatform, MEETING_PLATFORM_LABELS } from '@alliance-hcm/shared';
import { DEFAULT_VERCEL_WEB_URL } from '../utils/web-url.util';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailDispatchResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const DIRECT_SMTP_HARD_TIMEOUT_MS = 6000;
const RELAY_HTTP_TIMEOUT_MS = 10000;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly smtpUser: string;
  private readonly fromAddress: string;
  private readonly configured: boolean;
  private readonly relayUrl: string | null;
  private readonly relaySecret: string | null;
  private readonly preferRelayFirst: boolean;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('SMTP_USER', '').trim();
    const rawPass = this.config.get<string>('SMTP_PASS', '').trim();
    const pass = rawPass.replace(/\s+/g, '');
    const host = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com').trim();
    const port = Number(this.config.get<string>('SMTP_PORT', '465'));
    const from = this.config.get<string>('SMTP_FROM', '').trim();

    this.smtpUser = user;
    this.fromAddress = from || (user ? `"Alliance HCM Talento Humano" <${user}>` : '');
    this.configured = Boolean(user && pass && host);

    const explicitRelayUrl = this.config.get<string>('MAIL_RELAY_URL', '').trim();
    const explicitRelaySecret = this.config.get<string>('MAIL_RELAY_SECRET', '').trim();
    const derivedSecret =
      user && pass ? createHash('sha256').update(`${user}:${pass}`).digest('hex') : '';

    this.relaySecret = explicitRelaySecret || derivedSecret || null;

    const isProdOrRender =
      this.config.get<string>('RENDER', '').toLowerCase() === 'true' ||
      this.config.get<string>('NODE_ENV', 'development') === 'production';

    this.relayUrl =
      explicitRelayUrl || (this.relaySecret ? `${DEFAULT_VERCEL_WEB_URL}/api/mail/send` : null);

    // Render Free Tier bloquea puertos SMTP salientes (25/465/587), por lo que en Render/Prod
    // enviamos primero vía HTTPS (puerto 443) al relay en Vercel y evitamos colgar la petición.
    this.preferRelayFirst = Boolean(this.relayUrl && this.relaySecret && isProdOrRender);

    if (this.configured) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        connectionTimeout: 4500,
        greetingTimeout: 4500,
        socketTimeout: 5500,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(
        `Servicio SMTP inicializado (${host}:${port} como ${user}${this.preferRelayFirst ? ' · modo HTTPS Relay prioritario' : ''})`,
      );
    } else if (this.relayUrl && this.relaySecret) {
      this.logger.log(`Servicio de correo inicializado vía HTTPS Relay (${this.relayUrl})`);
    } else {
      this.logger.warn(
        'SMTP_USER / SMTP_PASS no configurados; el envío de correos reales quedará inactivo hasta configurarlos.',
      );
    }
  }

  isConfigured(): boolean {
    return (
      (this.configured && this.transporter !== null) ||
      Boolean(this.relayUrl && this.relaySecret)
    );
  }

  private async sendViaDirectSmtp(input: SendEmailInput): Promise<EmailDispatchResult> {
    if (!this.transporter || !this.configured) {
      return { sent: false, reason: 'SMTP no configurado' };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const sendPromise = this.transporter.sendMail({
        from: this.smtpUser
          ? { name: 'Alliance HCM Talento Humano', address: this.smtpUser }
          : this.fromAddress,
        replyTo: this.smtpUser || undefined,
        to: input.to.trim(),
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              'Timeout conectando al servidor SMTP (el hosting puede estar bloqueando el puerto 465/587).',
            ),
          );
        }, DIRECT_SMTP_HARD_TIMEOUT_MS);
      });

      const info = await Promise.race([sendPromise, timeoutPromise]);
      this.logger.log(`Correo enviado vía SMTP directo a ${input.to} (messageId=${info.messageId})`);
      return { sent: true, messageId: info.messageId };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Fallo SMTP directo hacia ${input.to}: ${reason}`);
      return { sent: false, reason };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async sendViaHttpsRelay(input: SendEmailInput): Promise<EmailDispatchResult> {
    if (!this.relayUrl || !this.relaySecret) {
      return { sent: false, reason: 'HTTPS Mail Relay no configurado' };
    }

    const rawBody = JSON.stringify({
      to: input.to.trim(),
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', this.relaySecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    try {
      const response = await fetch(this.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mail-ts': timestamp,
          'x-mail-sig': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(RELAY_HTTP_TIMEOUT_MS),
      });

      const parsed = (await response.json().catch(() => ({}))) as {
        sent?: boolean;
        messageId?: string;
        reason?: string;
      };

      if (!response.ok || !parsed.sent) {
        const reason = parsed.reason || `HTTP ${response.status} desde Mail Relay`;
        this.logger.error(`Error HTTPS Mail Relay hacia ${input.to}: ${reason}`);
        return { sent: false, reason };
      }

      this.logger.log(
        `Correo enviado vía HTTPS Relay a ${input.to} (messageId=${parsed.messageId ?? 'ok'})`,
      );
      return { sent: true, messageId: parsed.messageId };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Excepción HTTPS Mail Relay hacia ${input.to}: ${reason}`);
      return { sent: false, reason };
    }
  }

  async sendEmail(input: SendEmailInput): Promise<EmailDispatchResult> {
    const to = input.to.trim();
    if (!to || !to.includes('@')) {
      return { sent: false, reason: 'Destinatario de correo inválido' };
    }

    if (!this.isConfigured()) {
      return { sent: false, reason: 'SMTP no configurado' };
    }

    if (this.preferRelayFirst) {
      const relayResult = await this.sendViaHttpsRelay(input);
      if (relayResult.sent) {
        return relayResult;
      }
      return relayResult;
    }

    const directResult = await this.sendViaDirectSmtp(input);
    if (directResult.sent) {
      return directResult;
    }

    if (this.relayUrl && this.relaySecret) {
      return this.sendViaHttpsRelay(input);
    }

    return directResult;
  }

  private renderLayout(params: {
    eyebrow: string;
    title: string;
    bodyHtml: string;
    ctaLabel?: string;
    ctaUrl?: string;
    footerNote?: string;
  }): string {
    const ctaBlock =
      params.ctaLabel && params.ctaUrl
        ? `<p style="margin:24px 0 10px 0;">
             <a href="${escapeHtml(params.ctaUrl)}" target="_blank" rel="noreferrer"
                style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;">
               ${escapeHtml(params.ctaLabel)}
             </a>
           </p>`
        : '';

    return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;padding:28px;">
      <p style="margin:0 0 6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;">
        Alliance HCM · ${escapeHtml(params.eyebrow)}
      </p>
      <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#09090b;">
        ${escapeHtml(params.title)}
      </h1>
      <div style="font-size:13px;line-height:1.6;color:#3f3f46;">
        ${params.bodyHtml}
      </div>
      ${ctaBlock}
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 14px 0;" />
      <p style="margin:0;font-size:11px;color:#71717a;">
        ${escapeHtml(params.footerNote ?? 'Mensaje automático del Core de Talento Humano & IT · Protección de datos Ley 1581 de 2012.')}
      </p>
    </div>
  </body>
</html>`;
  }

  async sendOtpEmail(params: { to: string; code: string; ttlMinutes: number }) {
    return this.sendEmail({
      to: params.to,
      subject: `Tu código de verificación Alliance HCM: ${params.code}`,
      text: `Tu código OTP de verificación es ${params.code}. Tiene una vigencia de ${params.ttlMinutes} minutos.`,
      html: this.renderLayout({
        eyebrow: 'Verificación de Identidad OTP',
        title: 'Código de firma electrónica',
        bodyHtml: `<p style="margin:0 0 12px 0;">Usa el siguiente código de 6 dígitos para confirmar tu firma y envío del formulario de Pre-Ingreso:</p>
          <div style="display:inline-block;padding:12px 20px;border:1px solid #d4d4d8;border-radius:6px;background:#f4f4f5;font-family:monospace;font-size:24px;font-weight:700;letter-spacing:6px;color:#09090b;">
            ${escapeHtml(params.code)}
          </div>
          <p style="margin:12px 0 0 0;font-size:12px;color:#71717a;">Este código expira en ${params.ttlMinutes} minutos.</p>`,
      }),
    });
  }

  async sendCandidatePortalInviteEmail(params: {
    to: string;
    candidateName: string;
    appliedRole?: string | null;
    portalUrl: string;
  }) {
    const roleText = params.appliedRole ? ` para el cargo <strong>${escapeHtml(params.appliedRole)}</strong>` : '';
    return this.sendEmail({
      to: params.to,
      subject: `Portal de Selección Alliance${params.appliedRole ? ` · ${params.appliedRole}` : ''}`,
      text: `Hola ${params.candidateName}, ya tienes disponible tu Portal del Candidato en Alliance. Accede aquí para cargar tu hoja de vida y ver entrevistas: ${params.portalUrl}`,
      html: this.renderLayout({
        eyebrow: 'Portal del Candidato',
        title: `Hola, ${params.candidateName}`,
        bodyHtml: `<p style="margin:0 0 10px 0;">Talento Humano abrió tu seguimiento de proceso${roleText}.</p>
          <p style="margin:0;">Desde este portal podrás cargar o actualizar tu Hoja de Vida, consultar entrevistas programadas, diligenciar tu Pre-Registro cuando se habilite y revisar notificaciones.</p>`,
        ctaLabel: 'Abrir mi Portal del Candidato',
        ctaUrl: params.portalUrl,
      }),
    });
  }

  async sendCandidateMeetingEmail(params: {
    to: string;
    candidateName: string;
    title: string;
    meetingType: string;
    scheduledAtLabel: string;
    statusLabel?: string;
    meetingUrl?: string | null;
    location?: string | null;
    interviewerName?: string | null;
    notes?: string | null;
    isUpdate?: boolean;
  }) {
    const platform = params.meetingUrl
      ? detectMeetingPlatform(params.meetingUrl, params.location)
      : null;
    const platformLabel = platform ? MEETING_PLATFORM_LABELS[platform] : null;
    const ctaLabel = !params.meetingUrl
      ? undefined
      : platform === 'TEAMS'
        ? 'Unirse por Microsoft Teams'
        : platform === 'MEET'
          ? 'Unirse por Google Meet'
          : 'Abrir enlace de reunión';

    const details = [
      `<p style="margin:0 0 8px 0;"><strong>${escapeHtml(params.title)}</strong> (${escapeHtml(params.meetingType)})</p>`,
      `<p style="margin:0 0 6px 0;"><strong>Fecha y hora:</strong> ${escapeHtml(params.scheduledAtLabel)}</p>`,
      params.statusLabel ? `<p style="margin:0 0 6px 0;"><strong>Estado:</strong> ${escapeHtml(params.statusLabel)}</p>` : '',
      params.interviewerName ? `<p style="margin:0 0 6px 0;"><strong>Con:</strong> ${escapeHtml(params.interviewerName)}</p>` : '',
      params.location ? `<p style="margin:0 0 6px 0;"><strong>Lugar / Modalidad:</strong> ${escapeHtml(params.location)}</p>` : '',
      params.meetingUrl
        ? `<p style="margin:0 0 6px 0;"><strong>Enlace (${escapeHtml(platformLabel ?? 'Videollamada')}):</strong> <a href="${escapeHtml(params.meetingUrl)}">${escapeHtml(params.meetingUrl)}</a></p>`
        : '',
      params.notes ? `<p style="margin:8px 0 0 0;"><strong>Notas:</strong> ${escapeHtml(params.notes)}</p>` : '',
    ]
      .filter(Boolean)
      .join('');

    return this.sendEmail({
      to: params.to,
      subject: `${params.isUpdate ? 'Actualización de reunión' : 'Reunión programada'}: ${params.title}`,
      text: `Hola ${params.candidateName}, ${params.isUpdate ? 'se actualizó tu reunión' : 'tienes una nueva reunión'}: ${params.title} (${params.scheduledAtLabel})${params.meetingUrl ? ` · Enlace (${platformLabel ?? 'Videollamada'}): ${params.meetingUrl}` : ''}`,
      html: this.renderLayout({
        eyebrow: 'Agenda de Selección',
        title: params.isUpdate ? 'Actualización en tu reunión' : 'Nueva entrevista / reunión programada',
        bodyHtml: `<p style="margin:0 0 12px 0;">Hola ${escapeHtml(params.candidateName)},</p>${details}`,
        ctaLabel,
        ctaUrl: params.meetingUrl ?? undefined,
      }),
    });
  }

  async sendPreOnboardingEnabledEmail(params: {
    to: string;
    candidateName: string;
    preOnboardingUrl: string;
    portalUrl: string;
  }) {
    return this.sendEmail({
      to: params.to,
      subject: 'Pre-Registro de ingreso habilitado · Alliance HCM',
      text: `Hola ${params.candidateName}, Talento Humano habilitó tu formulario de Pre-Registro (24 campos y Ley 1581): ${params.preOnboardingUrl}`,
      html: this.renderLayout({
        eyebrow: 'Pre-Ingreso Digital',
        title: 'Tu formulario de Pre-Registro está listo',
        bodyHtml: `<p style="margin:0 0 10px 0;">Hola ${escapeHtml(params.candidateName)},</p>
          <p style="margin:0;">Talento Humano habilitó el diligenciamiento de tus datos personales, soportes documentales y firma electrónica Ley 1581. También puedes acceder desde tu Portal del Candidato: ${escapeHtml(params.portalUrl)}</p>`,
        ctaLabel: 'Diligenciar Pre-Registro (24 campos)',
        ctaUrl: params.preOnboardingUrl,
      }),
    });
  }

  async sendPreOnboardingReturnEmail(params: {
    to: string;
    candidateName: string;
    correctionNote: string;
    correctionMagicLink: string;
  }) {
    return this.sendEmail({
      to: params.to,
      subject: 'Corrección solicitada en tu Pre-Registro · Alliance HCM',
      text: `Hola ${params.candidateName}, Talento Humano devolvió tu Pre-Registro para corrección: "${params.correctionNote}". Corrige aquí: ${params.correctionMagicLink}`,
      html: this.renderLayout({
        eyebrow: 'Corrección de Registro',
        title: 'Talento Humano solicitó ajustes en tu Pre-Registro',
        bodyHtml: `<p style="margin:0 0 10px 0;">Hola ${escapeHtml(params.candidateName)},</p>
          <p style="margin:0 0 10px 0;">Por favor revisa y actualiza los siguientes datos indicados por Talento Humano:</p>
          <div style="padding:12px;border-left:3px solid #d97706;background:#fffbeb;color:#78350f;font-size:13px;">
            ${escapeHtml(params.correctionNote)}
          </div>`,
        ctaLabel: 'Corregir Pre-Registro ahora',
        ctaUrl: params.correctionMagicLink,
      }),
    });
  }

  async sendHiringApprovedEmail(params: {
    to: string;
    candidateName: string;
    expiresAtLabel: string;
    portalUrl: string;
    visibilityDays: number;
  }) {
    return this.sendEmail({
      to: params.to,
      subject: 'Contratación aprobada por Talento Humano · Alliance HCM',
      text: `Felicitaciones ${params.candidateName}. Tu contratación fue aprobada por Talento Humano. Tu portal estará visible durante ${params.visibilityDays} días (hasta el ${params.expiresAtLabel}): ${params.portalUrl}`,
      html: this.renderLayout({
        eyebrow: 'Aprobación de Contratación',
        title: `¡Felicitaciones, ${params.candidateName}!`,
        bodyHtml: `<p style="margin:0 0 10px 0;">Talento Humano aprobó tu contratación.</p>
          <p style="margin:0;">Como medida de acceso temporal, tu Portal del Candidato permanecerá visible durante <strong>${params.visibilityDays} días</strong> (hasta el <strong>${escapeHtml(params.expiresAtLabel)}</strong>). Después de esa fecha tu historial continuará resguardado internamente por Talento Humano.</p>`,
        ctaLabel: 'Ver resumen en Portal del Candidato',
        ctaUrl: params.portalUrl,
      }),
    });
  }

  async sendMagicLinkInviteEmail(params: {
    to: string;
    candidateName?: string;
    magicLink: string;
  }) {
    const greeting = params.candidateName ? `Hola ${escapeHtml(params.candidateName)},` : 'Hola,';
    return this.sendEmail({
      to: params.to,
      subject: 'Enlace de Pre-Ingreso · Alliance HCM',
      text: `Ingresa al enlace seguro (vigente 72 horas) para completar tu formulario de Pre-Ingreso en Alliance: ${params.magicLink}`,
      html: this.renderLayout({
        eyebrow: 'Invitación Pre-Ingreso',
        title: 'Completa tu registro de ingreso',
        bodyHtml: `<p style="margin:0 0 10px 0;">${greeting}</p>
          <p style="margin:0;">Talento Humano te envió este enlace seguro (vigente por 72 horas) para diligenciar tus datos y firma Ley 1581.</p>`,
        ctaLabel: 'Abrir Formulario de Pre-Ingreso',
        ctaUrl: params.magicLink,
      }),
    });
  }
}
