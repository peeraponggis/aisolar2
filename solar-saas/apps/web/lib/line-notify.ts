import 'server-only';
import { supabaseAdmin } from './supabase-server';
import { isLineConfigured, linkCard, multicast, pushMessage, siteUrl, text } from './line';
import { SEGMENT_LABEL } from './pro';
import type { Quote } from './quote';

/**
 * แจ้งเตือนผ่าน LINE
 *
 * ทุกฟังก์ชันที่นี่ห้ามโยน error — ถูกเรียกหลังบันทึกข้อมูลสำเร็จแล้ว
 * ถ้า LINE ล่มหรือยังไม่ได้ตั้งค่า ต้องไม่ทำให้คำขอหลักพัง
 */

const baht = (n: number) => `฿${Math.round(n).toLocaleString('th-TH')}`;

/** ลูกค้าหลายคนพิมพ์ "คุณ" นำหน้าชื่อมาเอง อย่าเติมซ้ำ */
const greeting = (name: string) => {
  const clean = name.trim();
  return clean.startsWith('คุณ') ? `สวัสดี${clean}` : `สวัสดีคุณ${clean}`;
};

/** ผู้ใช้ที่ผูก LINE ไว้แล้ว ตามบทบาทและจังหวัด */
async function lineTargets(filter: {
  role: 'admin' | 'installer';
  province?: string;
}): Promise<string[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];
  let query = supabase
    .from('profiles')
    .select('line_user_id')
    .eq('role', filter.role)
    .not('line_user_id', 'is', null);
  if (filter.province) query = query.eq('province', filter.province);
  const { data } = await query;
  return (data ?? []).map((r) => String(r.line_user_id)).filter(Boolean);
}

/** lead ใหม่เข้าคิวรอตรวจ — แจ้งแอดมินให้รีบตรวจ ความเร็วคือทั้งหมดของตลาด lead */
export async function notifyAdminNewLead(leadId: string, quote: Quote, province: string): Promise<void> {
  if (!isLineConfigured()) return;
  const targets = await lineTargets({ role: 'admin' });
  if (targets.length === 0) return;

  await multicast(targets, [
    linkCard({
      title: 'มี Lead ใหม่รอตรวจ',
      subtitle: `${province} · ${SEGMENT_LABEL[quote.input.userType === 'home' ? 'residential' : 'sme']}`,
      rows: [
        ['ค่าไฟ/เดือน', baht(quote.input.monthlyBill)],
        ['ขนาดที่เหมาะสม', `${quote.sizing.actualKwp.toFixed(2)} kWp`],
        ['คืนทุน', quote.finance.paybackYears ? `${quote.finance.paybackYears.toFixed(1)} ปี` : 'เกินกรอบวิเคราะห์'],
      ],
      buttonLabel: 'เปิดคิวตรวจ Lead',
      url: siteUrl('/pro/admin/leads'),
      footer: `รหัส ${leadId.slice(0, 8)}`,
    }),
  ]);
}

/** lead ผ่านการตรวจแล้วขึ้นตลาด — แจ้งช่างในจังหวัดนั้นให้รีบมาซื้อ */
export async function notifyInstallersLeadListed(lead: {
  id: string;
  province: string;
  segment: keyof typeof SEGMENT_LABEL;
  monthlyBill: number;
  suggestedKwp: number;
  priceCredits: number;
}): Promise<void> {
  if (!isLineConfigured()) return;
  const targets = await lineTargets({ role: 'installer', province: lead.province });
  if (targets.length === 0) return;

  await multicast(targets, [
    linkCard({
      title: 'มี Lead ใหม่ในพื้นที่ของคุณ',
      subtitle: `${lead.province} · ${SEGMENT_LABEL[lead.segment]}`,
      rows: [
        ['ค่าไฟ/เดือน', baht(lead.monthlyBill)],
        ['ขนาดที่เหมาะสม', `${lead.suggestedKwp.toFixed(2)} kWp`],
        ['ราคา', `${lead.priceCredits} เครดิต`],
      ],
      buttonLabel: 'ดูในตลาด Lead',
      url: siteUrl('/pro/leads'),
      footer: 'ข้อมูลติดต่อจะเปิดเผยหลังซื้อ',
    }),
  ]);
}

/** ส่งรายงานให้ลูกค้าหลังผูกบัญชี LINE สำเร็จ */
export async function sendReportToCustomer(lineUserId: string, leadId: string): Promise<boolean> {
  const supabase = supabaseAdmin();
  if (!supabase) return false;

  const { data } = await supabase
    .from('leads')
    .select('contact_name, province, monthly_bill, suggested_kwp, calc_snapshot')
    .eq('id', leadId)
    .maybeSingle();

  if (!data) return false;

  const snapshot = data.calc_snapshot as { finance?: { paybackYears: number | null } } | null;
  const payback = snapshot?.finance?.paybackYears;

  return pushMessage(lineUserId, [
    text(`${greeting(String(data.contact_name))} รายงานวิเคราะห์ความคุ้มค่าของคุณพร้อมแล้ว`),
    linkCard({
      title: 'รายงานวิเคราะห์โซลาร์เซลล์',
      subtitle: 'กดเปิดแล้วสั่งพิมพ์เป็น PDF ได้จากปุ่มบนหน้ารายงาน',
      rows: [
        ['ค่าไฟ/เดือน', baht(Number(data.monthly_bill))],
        ['ขนาดที่แนะนำ', `${Number(data.suggested_kwp).toFixed(2)} kWp`],
        ['คืนทุน', payback ? `${payback.toFixed(1)} ปี` : 'เกินกรอบวิเคราะห์'],
      ],
      buttonLabel: 'เปิดรายงานฉบับเต็ม',
      url: siteUrl(`/report/${leadId}`),
      footer: 'รายงานนี้เป็นการประมาณการเพื่อใช้เปรียบเทียบข้อเสนอ ไม่ใช่ใบเสนอราคา',
    }),
  ]);
}
