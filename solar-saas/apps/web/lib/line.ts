import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * LINE Messaging API
 *
 * ⚠ ข้อจำกัดที่ต้องรู้: Messaging API **ส่งไฟล์ PDF ไม่ได้** ชนิดข้อความที่ส่งได้มีแค่
 * text / sticker / image / video / audio / location / imagemap / template / flex
 * การ "ส่งรายงาน" ทาง LINE จึงเป็นการส่งการ์ดพร้อมปุ่มลิงก์ไปหน้ารายงาน
 * ซึ่งผู้รับกดแล้วสั่งพิมพ์เป็น PDF เองได้ ไม่ใช่การแนบไฟล์มาในแชต
 *
 * ยังไม่ตั้งค่า token = ทุกฟังก์ชันไม่ทำอะไรและคืน false ระบบอื่นจึงทำงานต่อได้ตามปกติ
 */

const API = 'https://api.line.me/v2/bot';

export function isLineConfigured(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET);
}

/** ตรวจลายเซ็นของ webhook — ถ้าไม่ตรงแปลว่าไม่ได้มาจาก LINE จริง */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret || !signature) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type LineMessage = Record<string, unknown>;

async function call(path: string, body: unknown): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn('[line] ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ข้ามการส่ง');
    return false;
  }
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('[line]', path, res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    // ส่งไม่สำเร็จต้องไม่ทำให้คำขอหลักล้ม — lead ต้องถูกบันทึกไว้ก่อนเสมอ
    console.error('[line] เรียก API ไม่สำเร็จ:', e);
    return false;
  }
}

export function pushMessage(to: string, messages: LineMessage[]): Promise<boolean> {
  return call('/message/push', { to, messages });
}

export function replyMessage(replyToken: string, messages: LineMessage[]): Promise<boolean> {
  return call('/message/reply', { replyToken, messages });
}

/** ส่งหาหลายคนพร้อมกัน — LINE จำกัดครั้งละ 500 ปลายทาง */
export async function multicast(to: string[], messages: LineMessage[]): Promise<boolean> {
  const unique = [...new Set(to.filter(Boolean))];
  if (unique.length === 0) return false;
  let ok = true;
  for (let i = 0; i < unique.length; i += 500) {
    ok = (await call('/message/multicast', { to: unique.slice(i, i + 500), messages })) && ok;
  }
  return ok;
}

export const text = (content: string): LineMessage => ({ type: 'text', text: content });

/**
 * การ์ดพร้อมปุ่มลิงก์ — ใช้แทนการแนบไฟล์ที่ LINE ทำไม่ได้
 * ปุ่มเปิดหน้ารายงานที่สั่งพิมพ์เป็น PDF ได้จากเบราว์เซอร์
 */
export function linkCard(options: {
  title: string;
  subtitle?: string;
  rows: [string, string][];
  buttonLabel: string;
  url: string;
  footer?: string;
}): LineMessage {
  return {
    type: 'flex',
    altText: options.title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: options.title, weight: 'bold', size: 'lg', wrap: true },
          ...(options.subtitle
            ? [{ type: 'text', text: options.subtitle, size: 'sm', color: '#64748B', wrap: true }]
            : []),
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: options.rows.map(([label, value]) => ({
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: label, size: 'sm', color: '#64748B', flex: 4 },
                { type: 'text', text: value, size: 'sm', weight: 'bold', flex: 5, wrap: true },
              ],
            })),
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#D97706',
            action: { type: 'uri', label: options.buttonLabel, uri: options.url },
          },
          ...(options.footer
            ? [
                {
                  type: 'text',
                  text: options.footer,
                  size: 'xxs',
                  color: '#94A3B8',
                  wrap: true,
                  align: 'center',
                },
              ]
            : []),
        ],
      },
    },
  };
}

/** URL ฐานของเว็บ ใช้ประกอบลิงก์ในข้อความ LINE ที่ต้องเป็น absolute เสมอ */
export function siteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}`;
}
