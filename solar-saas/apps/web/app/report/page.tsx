import type { Metadata } from 'next';
import ReportDocument from '@/components/report/ReportDocument';
import ReportTheme from '@/components/report/ReportTheme';
import { parseReportParams } from '@/lib/report-link';
import { computeQuote } from '@/lib/quote';

export const metadata: Metadata = {
  title: 'รายงานวิเคราะห์ความคุ้มค่า — PROINVENTIVE Solar',
};

/** รายงานพรีวิว: คำนวณจากอินพุตในลิงก์ (ยังไม่มี lead จึงยังไม่มี snapshot ให้อ่าน) */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = parseReportParams(await searchParams);
  const quote = computeQuote(input);
  const issuedAt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date());

  return (
    <>
      <ReportTheme />
      <ReportDocument quote={quote} meta={{ issuedAt, source: 'preview' }} />
    </>
  );
}
