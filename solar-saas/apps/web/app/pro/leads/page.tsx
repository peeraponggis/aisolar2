import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import LeadCard from '@/components/pro/LeadCard';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { listMarketLeads } from '@/lib/marketplace';

export const metadata: Metadata = {
  title: 'ตลาด Lead — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

/** ตลาดมี lead เข้าออกตลอด — ห้าม cache หน้านี้ */
export const dynamic = 'force-dynamic';

export default async function MarketplacePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');
  if (user.role !== 'installer' && user.role !== 'admin') redirect('/pro');

  const [credits, leads] = await Promise.all([creditBalance(user), listMarketLeads(user.id)]);

  return (
    <div className="wrap">
      <ProHeader
        label={user.company ?? user.email}
        credits={credits}
        isAdmin={user.role === 'admin'}
      />

      <section className="hero">
        <h1>
          ตลาด <span className="hl">Lead</span>
        </h1>
        <p>
          ลูกค้าที่คำนวณความคุ้มค่าแล้วและขอใบเสนอราคา — ข้อมูลติดต่อจะเปิดเผยหลังซื้อ
          ซื้อแล้วเปิดรายงานฉบับเต็มของลูกค้ารายนั้นได้ทันที
        </p>
      </section>

      {leads.length === 0 ? (
        <div className="card">
          <p className="placeholder">ยังไม่มี lead ในตลาดตอนนี้ — กลับมาดูใหม่อีกครั้ง</p>
        </div>
      ) : (
        <div className="lead-grid">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} credits={credits} />
          ))}
        </div>
      )}
    </div>
  );
}
