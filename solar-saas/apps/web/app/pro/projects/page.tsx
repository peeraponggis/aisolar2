import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import NewProjectButton from '@/components/pro/NewProjectButton';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, toSummary, type ProjectRow } from '@/lib/projects';
import { baht, fmt } from '@/lib/format';

export const metadata: Metadata = {
  title: 'โปรเจกต์ของฉัน — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');

  const asUser = supabaseAsUser(user.accessToken)!;
  const [credits, { data }] = await Promise.all([
    creditBalance(user),
    // นโยบาย "own projects" กรองให้เห็นเฉพาะของตัวเองอยู่แล้ว
    asUser.from('projects').select('*').order('updated_at', { ascending: false }).limit(200),
  ]);

  const projects = ((data ?? []) as ProjectRow[]).map(toSummary);
  const byStatus = PROJECT_STATUSES.map((s) => ({
    status: s,
    items: projects.filter((p) => p.status === s),
  }));

  return (
    <div className="wrap">
      <ProHeader label={user.company ?? user.email} credits={credits} isAdmin={user.role === 'admin'} />

      <section className="hero">
        <h1>
          โปรเจกต์<span className="hl">ของฉัน</span>
        </h1>
        <p>
          ทั้งหมด {fmt(projects.length)} โปรเจกต์ — สร้างจาก lead ที่ซื้อไว้ หรือเริ่มใหม่เองก็ได้
        </p>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 260, width: '100%' }}>
            <NewProjectButton />
          </div>
        </div>
      </section>

      {projects.length === 0 ? (
        <div className="card">
          <p className="placeholder">
            ยังไม่มีโปรเจกต์ — เริ่มจาก <Link href="/pro/leads">ตลาด Lead</Link> หรือกดสร้างใหม่ด้านบน
          </p>
        </div>
      ) : (
        <div className="pipeline">
          {byStatus.map(({ status, items }) => (
            <div className="pipeline-col" key={status}>
              <div className="pipeline-head">
                {PROJECT_STATUS_LABEL[status]} <span className="count">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="pipeline-empty">—</p>
              ) : (
                items.map((p) => (
                  <Link className="project-card" key={p.id} href={`/pro/projects/${p.id}`}>
                    <div className="project-name">{p.customerName}</div>
                    <div className="project-meta">
                      {p.kwp !== null ? `${fmt(p.kwp, 2)} kWp` : 'ยังไม่ได้คำนวณ'}
                      {p.priceVat !== null && ` · ${baht(p.priceVat)}`}
                    </div>
                    <div className="project-meta">
                      {p.paybackYears !== null ? `คืนทุน ${p.paybackYears.toFixed(1)} ปี` : ''}
                    </div>
                    <div className="project-date">
                      แก้ไขล่าสุด{' '}
                      {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short' }).format(new Date(p.updatedAt))}
                    </div>
                  </Link>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
