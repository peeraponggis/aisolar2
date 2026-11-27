import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import ProjectEditor from '@/components/pro/ProjectEditor';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';
import type { ProjectRow } from '@/lib/projects';

export const metadata: Metadata = {
  title: 'แก้ไขโปรเจกต์ — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const asUser = supabaseAsUser(user.accessToken)!;
  const [credits, { data }] = await Promise.all([
    creditBalance(user),
    asUser.from('projects').select('*').eq('id', id).maybeSingle(),
  ]);

  // RLS กรองโปรเจกต์ของคนอื่นออกไปแล้ว ไม่ต้องเช็ค installer_id ซ้ำในโค้ด
  if (!data) notFound();
  const project = data as ProjectRow;

  return (
    <div className="wrap">
      <ProHeader label={user.company ?? user.email} credits={credits} isAdmin={user.role === 'admin'} />

      <div className="breadcrumb">
        <Link href="/pro/projects">← กลับไปรายการโปรเจกต์</Link>
      </div>

      <ProjectEditor
        projectId={project.id}
        initialName={project.customer_name}
        initialStatus={project.status}
        initialInput={project.bill_input}
        leadId={project.lead_id}
      />
    </div>
  );
}
