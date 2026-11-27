import 'server-only';
import nodemailer from 'nodemailer';

/**
 * ส่งอีเมลพร้อมไฟล์แนบ — รองรับสองทาง เลือกอัตโนมัติจาก env
 *
 * 1. Resend (ตั้ง RESEND_API_KEY) — เรียกผ่าน HTTP ไม่ต้องตั้ง SMTP ใด ๆ แต่ต้องยืนยันโดเมนก่อน
 * 2. SMTP (ตั้ง SMTP_HOST) — ใช้กับอีเมลธุรกิจที่มีอยู่แล้วได้เลย เช่น Google Workspace
 *
 * ไม่ตั้งค่าเลย = ไม่ส่งและ log เตือน ระบบอื่นทำงานต่อได้ตามปกติ
 * ต่างจาก LINE ตรงที่อีเมล **แนบไฟล์ PDF ได้จริง** จึงเป็นช่องทางเดียวที่ส่งไฟล์ให้ลูกค้าได้
 */

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
}

export type EmailProvider = 'resend' | 'smtp' | 'none';

export function emailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'none';
}

export function isEmailConfigured(): boolean {
  return emailProvider() !== 'none';
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? 'PROINVENTIVE Solar <onboarding@resend.dev>';
}

async function sendViaResend(message: EmailMessage): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString('base64'),
            })),
          }
        : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    console.error('[email] resend', res.status, (await res.text()).slice(0, 300));
    return false;
  }
  return true;
}

async function sendViaSmtp(message: EmailMessage): Promise<boolean> {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 คือ SMTPS ที่เข้ารหัสตั้งแต่เชื่อมต่อ ส่วน 587 ใช้ STARTTLS ทีหลัง
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  await transport.sendMail({
    from: fromAddress(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return true;
}

/** ส่งอีเมล — ไม่โยน error ออกไป ผู้เรียกอยู่หลังการบันทึกข้อมูลเสมอ */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const provider = emailProvider();
  if (provider === 'none') {
    console.warn('[email] ยังไม่ได้ตั้งค่า RESEND_API_KEY หรือ SMTP_HOST — ข้ามการส่ง');
    return false;
  }
  try {
    return provider === 'resend' ? await sendViaResend(message) : await sendViaSmtp(message);
  } catch (e) {
    console.error('[email] ส่งไม่สำเร็จ:', e);
    return false;
  }
}
