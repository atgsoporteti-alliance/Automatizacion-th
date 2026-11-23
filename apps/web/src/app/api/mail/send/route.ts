import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

interface RelayMailPayload {
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
}

function resolveRelaySecret(): string | null {
  const explicit = process.env.MAIL_RELAY_SECRET?.trim();
  if (explicit) return explicit;

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim().replace(/\s+/g, '');
  if (!user || !pass) return null;

  return createHash('sha256').update(`${user}:${pass}`).digest('hex');
}

function verifySignature(params: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
}): boolean {
  const tsNum = Number(params.timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60_000) {
    return false;
  }

  const expectedHex = createHmac('sha256', params.secret)
    .update(`${params.timestamp}.${params.rawBody}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const receivedBuf = Buffer.from(params.signature, 'hex');
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(request: Request) {
  const relaySecret = resolveRelaySecret();
  if (!relaySecret) {
    return NextResponse.json(
      { sent: false, reason: 'SMTP / MAIL_RELAY_SECRET no configurados en Vercel' },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-mail-ts') ?? '';
  const signature = request.headers.get('x-mail-sig') ?? '';

  if (
    !timestamp ||
    !signature ||
    !verifySignature({ secret: relaySecret, timestamp, rawBody, signature })
  ) {
    return NextResponse.json({ sent: false, reason: 'Firma HMAC inválida o expirada' }, { status: 401 });
  }

  let payload: RelayMailPayload;
  try {
    payload = JSON.parse(rawBody) as RelayMailPayload;
  } catch {
    return NextResponse.json({ sent: false, reason: 'JSON inválido' }, { status: 400 });
  }

  const to = payload.to?.trim() ?? '';
  const subject = payload.subject?.trim() ?? '';
  const text = payload.text ?? '';
  const html = payload.html ?? '';

  if (!to || !to.includes('@') || !subject || (!text && !html)) {
    return NextResponse.json(
      { sent: false, reason: 'Faltan campos obligatorios (to, subject, text/html)' },
      { status: 400 },
    );
  }

  const user = process.env.SMTP_USER?.trim() ?? '';
  const pass = (process.env.SMTP_PASS?.trim() ?? '').replace(/\s+/g, '');
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || '465');
  const from = process.env.SMTP_FROM?.trim() || `"Alliance HCM · Talento Humano" <${user}>`;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      connectionTimeout: 6000,
      greetingTimeout: 6000,
      socketTimeout: 8000,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    return NextResponse.json({ sent: true, messageId: info.messageId });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ sent: false, reason }, { status: 502 });
  }
}
