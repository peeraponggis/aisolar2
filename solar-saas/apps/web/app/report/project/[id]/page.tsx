import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import ReportDocument from '@/components/report/ReportDocument';
import ReportTheme from '@/components/report/ReportTheme';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';
import { PROJECT_SNAPSHOT_VERSION, type ProjectRow } from '@/lib/projects';
import { installerBranding } from '@/lib/branding';
import { entitlementsFor } from '@/lib/subscription';
import type { Quote } from '@/lib/quote';

export const metadata: Metadata = {
  title: 'รายงานโปรเจกต์ — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

/** รายงานของโปรเจกต์ — อ่านจาก results ที่บันทึกไว้ ไม่คำนวณใหม่ */
export default async function ProjectReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const asUser = supabaseAsUser(user.accessToken);
  if (!asUser) notFound();

  // RLS กรองให้เหลือเฉพาะโปรเจกต์ของช่างคนนี้
  const [{ data }, { data: profile }, entitlements] = await Promise.all([
    asUser.from('projects').select('*').eq('id', id).maybeSingle(),
    asUser.from('profiles').select('company, full_name, phone, province, logo_url').eq('id', user.id).maybeSingle(),
    entitlementsFor(user),
  ]);
  if (!data) notFound();

  const project = data as ProjectRow;
  if (!project.results || project.results.version !== PROJECT_SNAPSHOT_VERSION) notFound();

  const issuedAt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(
    new Date(project.updated_at),
  );

  return (
    <>
      <ReportTheme />
      <ReportDocument
        quote={project.results as unknown as Quote}
        meta={{ customerName: project.customer_name, issuedAt, source: 'snapshot' }}
        branding={installerBranding({
          company: (profile?.company as string | null) ?? null,
          fullName: (profile?.full_name as string | null) ?? null,
          phone: (profile?.phone as string | null) ?? null,
          province: (profile?.province as string | null) ?? null,
          logoUrl: (profile?.logo_url as string | null) ?? null,
        }, entitlements.canRemoveBranding)}
      />
    </>
  );
}
