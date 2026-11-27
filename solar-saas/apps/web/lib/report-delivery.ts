import 'server-only';
import { supabaseAdmin } from './supabase-server';
import { isEmailConfigured, sendEmail } from './email';
import { isPdfAvailable, renderPdf } from './pdf';
import { siteUrl } from './line';

/**
 * ส่งรายงานเป็นไฟล์ PDF แนบไปทางอีเมล
 *
 * นี่คือช่องทางเดียวที่ส่ง "ไฟล์" ให้ลูกค้าได้จริง — LINE แนบไฟล์ไม่ได้ ส่งได้แค่ลิงก์
 *
 * ตัวสร้าง PDF เปิดหน้า /report/[id]?pdf=1 ด้วย Chromium จริง ผลที่ได้จึงเหมือนกับที่ลูกค้า
 * กด Ctrl+P บนหน้าเดียวกันเป๊ะ ๆ ไม่ต้องมีสองที่ให้ดูแลให้ตรงกัน
 */

const SUBJECT = 'รายงานวิเคราะห์ความคุ้มค่าโซลาร์เซลล์ของคุณ';

export type DeliveryResult = 'sent' | 'no-email' | 'not-configured' | 'failed';

/** ลูกค้าหลายคนพิมพ์ "คุณ" นำหน้าชื่อมาเอง อย่าเติมซ้ำจนกลายเป็น "คุณคุณสมชาย" */
function greeting(name: string): string {
  const clean = name.trim();
  return clean.startsWith('คุณ') ? `สวัสดี${clean}` : `สวัสดีคุณ${clean}`;
}

function body(name: string, url: string): { text: string; html: string } {
  const text = [
    greeting(name),
    '',
    'รายงานวิเคราะห์ความคุ้มค่าการติดตั้งโซลาร์เซลล์ของคุณแนบมาในอีเมลนี้แล้ว (ไฟล์ PDF)',
    'เปิดดูฉบับออนไลน์ได้ที่:',
    url,
    '',
    'รายงานนี้เป็นการประมาณการเบื้องต้นเพื่อใช้เปรียบเทียบข้อเสนอจากผู้ติดตั้ง ไม่ใช่ใบเสนอราคา',
    'ตัวเลขจริงขึ้นกับการสำรวจหน้างาน โครงสร้างหลังคา และอัตราค่าไฟที่บังคับใช้ ณ เวลาติดตั้ง',
    '',
    'PROINVENTIVE Solar',
  ].join('\n');

  const html = `
    <div style="font-family:'IBM Plex Sans Thai',sans-serif;line-height:1.8;color:#1e293b">
      <p>${greeting(name)}</p>
      <p>รายงานวิเคราะห์ความคุ้มค่าการติดตั้งโซลาร์เซลล์ของคุณ <b>แนบมาในอีเมลนี้แล้ว (ไฟล์ PDF)</b></p>
      <p><a href="${url}" style="color:#d97706;font-weight:600">เปิดดูรายงานฉบับออนไลน์</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
      <p style="font-size:13px;color:#64748b">
        รายงานนี้เป็นการประมาณการเบื้องต้นเพื่อใช้เปรียบเทียบข้อเสนอจากผู้ติดตั้ง ไม่ใช่ใบเสนอราคา
        ตัวเลขจริงขึ้นกับการสำรวจหน้างาน โครงสร้างหลังคา และอัตราค่าไฟที่บังคับใช้ ณ เวลาติดตั้ง
      </p>
      <p style="font-size:13px;color:#64748b">PROINVENTIVE Solar</p>
    </div>`;

  return { text, html };
}

/**
 * สร้าง PDF ของ lead แล้วส่งอีเมลให้ลูกค้า
 * เรียกได้หลังบันทึก lead แล้วเท่านั้น และไม่โยน error ออกไป
 */
export async function emailReportToCustomer(leadId: string): Promise<DeliveryResult> {
  const supabase = supabaseAdmin();
  if (!supabase) return 'not-configured';

  const { data } = await supabase
    .from('leads')
    .select('contact_name, contact_email')
    .eq('id', leadId)
    .maybeSingle();

  const email = data?.contact_email ? String(data.contact_email) : '';
  if (!email) return 'no-email';
  if (!isEmailConfigured()) {
    console.warn('[report-delivery] ยังไม่ได้ตั้งค่าอีเมล — ข้ามการส่ง');
    return 'not-configured';
  }

  const reportUrl = siteUrl(`/report/${leadId}`);

  try {
    const attachments = isPdfAvailable()
      ? [
          {
            filename: `PROINVENTIVE-Solar-Report-${leadId.slice(0, 8)}.pdf`,
            content: await renderPdf(`${reportUrl}?pdf=1`),
            contentType: 'application/pdf',
          },
        ]
      : [];

    if (attachments.length === 0) {
      console.warn('[report-delivery] ไม่พบเบราว์เซอร์สำหรับสร้าง PDF — ส่งเฉพาะลิงก์');
    }

    const { text, html } = body(String(data?.contact_name ?? ''), reportUrl);
    const ok = await sendEmail({ to: email, subject: SUBJECT, text, html, attachments });
    return ok ? 'sent' : 'failed';
  } catch (e) {
    console.error('[report-delivery] ส่งรายงานไม่สำเร็จ:', e);
    return 'failed';
  }
}
