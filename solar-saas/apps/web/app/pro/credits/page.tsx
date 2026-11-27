import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import TopUpForm from '@/components/pro/TopUpForm';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';
import { PAYMENT_STATUS_LABEL, findPackage, payeeInfo } from '@/lib/pro';
import { baht, fmt } from '@/lib/format';

export const metadata: Metadata = {
  title: 'เติมเครดิต — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

/** ยอดเครดิตและสถานะการชำระเงินเปลี่ยนได้ตลอด — ห้าม cache */
export const dynamic = 'force-dynamic';

export default async function CreditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');
  if (user.role !== 'installer' && user.role !== 'admin') redirect('/pro');

  const asUser = supabaseAsUser(user.accessToken)!;
  const [credits, { data: payments }] = await Promise.all([
    creditBalance(user),
    // นโยบาย "own payments" ทำให้เห็นเฉพาะของตัวเองแม้ query จะไม่ได้กรอง
    asUser
      .from('payments')
      .select('id, amount_thb, gateway_ref, status, created_at')
      .eq('purpose', 'credit_topup')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const rows = (payments ?? []) as {
    id: string;
    amount_thb: number;
    gateway_ref: string | null;
    status: string;
    created_at: string;
  }[];

  return (
    <div className="wrap">
      <ProHeader
        label={user.company ?? user.email}
        credits={credits}
        isAdmin={user.role === 'admin'}
      />

      <section className="hero">
        <h1>
          เติม<span className="hl">เครดิต</span>
        </h1>
        <p>
          เครดิตใช้ซื้อ lead ในตลาด — ตอนนี้คุณมี <b>{fmt(credits)} เครดิต</b>
        </p>
      </section>

      <TopUpForm payee={payeeInfo()} />

      <div className="card" style={{ marginTop: 20 }}>
        <h2>
          <span className="num">3</span> ประวัติการแจ้งโอน
        </h2>
        {rows.length === 0 ? (
          <p className="placeholder">ยังไม่มีรายการแจ้งโอน</p>
        ) : (
          <div className="table-scroll">
            <table className="kv purchases">
              <thead>
                <tr>
                  <th>วันที่แจ้ง</th>
                  <th>แพ็กเกจ</th>
                  <th>เครดิต</th>
                  <th>จำนวนเงิน</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pkg = p.gateway_ref ? findPackage(p.gateway_ref) : undefined;
                  return (
                    <tr key={p.id}>
                      <td>
                        {new Intl.DateTimeFormat('th-TH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(p.created_at))}
                      </td>
                      <td>{pkg?.label ?? '–'}</td>
                      <td>{pkg ? fmt(pkg.credits) : '–'}</td>
                      <td>{baht(Number(p.amount_thb))}</td>
                      <td>
                        <span className={`pay-status ${p.status}`}>
                          {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
