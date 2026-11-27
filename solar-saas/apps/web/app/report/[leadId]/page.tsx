import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReportDocument from '@/components/report/ReportDocument';
import ReportTheme from '@/components/report/ReportTheme';
import { supabaseAdmin } from '@/lib/supabase-server';
import { SNAPSHOT_VERSION, type LeadSnapshot } from '@/lib/lead';
import type { Quote } from '@/lib/quote';

export const metadata: Metadata = {
  title: 'รายงานวิเคราะห์ความคุ้มค่า — PROINVENTIVE Solar',
  // ลิงก์รายงานเป็น capability URL (เดา UUID ไม่ได้) — กันไม่ให้ search engine เก็บเข้าดัชนี
  robots: { index: false, follow: false },
};

/** รายงานของ lead จริง — อ่านจาก calc_snapshot เท่านั้น ห้ามคำนวณใหม่ */
export default async function LeadReportPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) notFound();

  const supabase = supabaseAdmin();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from('leads')
    .select('contact_name, created_at, calc_snapshot')
    .eq('id', leadId)
    .maybeSingle();

  if (error || !data?.calc_snapshot) notFound();

  const snapshot = data.calc_snapshot as LeadSnapshot;
  // snapshot รุ่นเก่าไม่มีข้อมูลกราฟครบ — ไม่ render ดีกว่าเดารูปแบบผิด
  if (snapshot.version !== SNAPSHOT_VERSION) notFound();

  const issuedAt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(
    new Date(data.created_at as string),
  );

  return (
    <>
      <ReportTheme />
      <ReportDocument
        quote={snapshot as unknown as Quote}
        meta={{ customerName: data.contact_name as string, issuedAt, source: 'snapshot' }}
      />
    </>
  );
}
