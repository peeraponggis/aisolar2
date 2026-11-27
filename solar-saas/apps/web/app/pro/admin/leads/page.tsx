import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import AdminNav from '@/components/pro/AdminNav';
import ReviewLeadCard from '@/components/pro/ReviewLeadCard';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { adminPendingCounts, pendingLeads } from '@/lib/admin-leads';
import { fmt } from '@/lib/format';

export const metadata: Metadata = {
  title: 'ตรวจ Lead — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLeadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');
  if (user.role !== 'admin') redirect('/pro');

  const [credits, leads, counts] = await Promise.all([
    creditBalance(user),
    pendingLeads(),
    adminPendingCounts(),
  ]);

  return (
    <div className="wrap">
      <ProHeader label={user.company ?? user.email} credits={credits} isAdmin />
      <AdminNav active="leads" pendingLeads={counts.leads} pendingPayments={counts.payments} />

      <section className="hero">
        <h1>
          ตรวจ <span className="hl">Lead</span> ก่อนขึ้นตลาด
        </h1>
        <p>
          รอตรวจ {fmt(leads.length)} รายการ — lead จะไม่ปรากฏในตลาดจนกว่าจะอนุมัติ
          ตรวจว่าชื่อและเบอร์ดูเป็นคนจริง ค่าไฟสมเหตุสมผล และไม่ใช่รายการซ้ำ
        </p>
      </section>

      {leads.length === 0 ? (
        <div className="card">
          <p className="placeholder">ไม่มี lead รอตรวจ</p>
        </div>
      ) : (
        <div className="lead-grid">
          {leads.map((lead) => (
            <ReviewLeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
