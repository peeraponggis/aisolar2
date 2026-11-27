import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import SettleButtons from '@/components/pro/SettleButtons';
import AdminNav from '@/components/pro/AdminNav';
import { adminPendingCounts } from '@/lib/admin-leads';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { supabaseAdmin, supabaseAsUser } from '@/lib/supabase-server';
import { PAYMENT_STATUS_LABEL, findPackage } from '@/lib/pro';
import { baht, fmt } from '@/lib/format';

export const metadata: Metadata = {
  title: 'ตรวจสอบการชำระเงิน — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** ลิงก์ดูสลิปมีอายุ 10 นาที — bucket เป็น private จึงเปิดตรง ๆ ไม่ได้ */
const SLIP_URL_TTL_SECONDS = 600;

export default async function AdminPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');
  if (user.role !== 'admin') redirect('/pro');

  const asUser = supabaseAsUser(user.accessToken)!;
  const [credits, counts, { data: payments }] = await Promise.all([
    creditBalance(user),
    adminPendingCounts(),
    asUser
      .from('payments')
      .select('id, installer_id, amount_thb, gateway_ref, slip_url, status, created_at')
      .eq('purpose', 'credit_topup')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const rows = (payments ?? []) as {
    id: string;
    installer_id: string;
    amount_thb: number;
    gateway_ref: string | null;
    slip_url: string | null;
    status: string;
    created_at: string;
  }[];

  // ชื่อช่างและลิงก์สลิปต้องใช้สิทธิ์ข้าม RLS — หน้านี้กันไว้แล้วว่าเฉพาะ admin เข้าถึงได้
  const admin = supabaseAdmin()!;
  const installerIds = [...new Set(rows.map((r) => r.installer_id))];
  const { data: profiles } = installerIds.length
    ? await admin.from('profiles').select('id, full_name, company').in('id', installerIds)
    : { data: [] };
  const nameOf = new Map(
    (profiles ?? []).map((p) => [p.id as string, `${p.company ?? ''} (${p.full_name ?? ''})`]),
  );

  const slipLinks = new Map<string, string>();
  for (const row of rows) {
    if (!row.slip_url) continue;
    const { data } = await admin.storage
      .from('slips')
      .createSignedUrl(row.slip_url, SLIP_URL_TTL_SECONDS);
    if (data?.signedUrl) slipLinks.set(row.id, data.signedUrl);
  }

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <div className="wrap">
      <ProHeader
        label={user.company ?? user.email}
        credits={credits}
        isAdmin={user.role === 'admin'}
      />
      <AdminNav active="payments" pendingLeads={counts.leads} pendingPayments={counts.payments} />

      <section className="hero">
        <h1>
          ตรวจสอบ<span className="hl">การชำระเงิน</span>
        </h1>
        <p>
          รอตรวจสอบ {fmt(pending.length)} รายการ · กดดูสลิปแล้วยืนยันเพื่อเติมเครดิตให้ช่าง
        </p>
      </section>

      <div className="card">
        {rows.length === 0 ? (
          <p className="placeholder">ยังไม่มีใบแจ้งโอน</p>
        ) : (
          <div className="table-scroll">
            <table className="kv purchases">
              <thead>
                <tr>
                  <th>วันที่แจ้ง</th>
                  <th>ช่าง</th>
                  <th>แพ็กเกจ</th>
                  <th>เครดิต</th>
                  <th>จำนวนเงิน</th>
                  <th>สลิป</th>
                  <th>สถานะ</th>
                  <th>ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pkg = p.gateway_ref ? findPackage(p.gateway_ref) : undefined;
                  const slip = slipLinks.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        {new Intl.DateTimeFormat('th-TH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(p.created_at))}
                      </td>
                      <td>{nameOf.get(p.installer_id) ?? p.installer_id.slice(0, 8)}</td>
                      <td>{pkg?.label ?? '–'}</td>
                      <td>{pkg ? fmt(pkg.credits) : '–'}</td>
                      <td>{baht(Number(p.amount_thb))}</td>
                      <td>
                        {slip ? (
                          <a href={slip} target="_blank" rel="noreferrer">
                            เปิดสลิป
                          </a>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td>
                        <span className={`pay-status ${p.status}`}>
                          {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td>{p.status === 'pending' ? <SettleButtons paymentId={p.id} /> : '–'}</td>
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
