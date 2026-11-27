import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import PlanPicker from '@/components/pro/PlanPicker';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';
import { entitlementsFor, projectCount } from '@/lib/subscription';
import { SUBSCRIPTION_STATUS_LABEL } from '@/lib/plans';
import { PAYMENT_STATUS_LABEL, payeeInfo } from '@/lib/pro';
import { baht, fmt } from '@/lib/format';

export const metadata: Metadata = {
  title: 'แพ็กเกจสมาชิก — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');

  const asUser = supabaseAsUser(user.accessToken)!;
  const [credits, entitlements, used, { data: sub }, { data: payments }] = await Promise.all([
    creditBalance(user),
    entitlementsFor(user),
    projectCount(user),
    asUser
      .from('subscriptions')
      .select('status')
      .eq('installer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    asUser
      .from('payments')
      .select('id, amount_thb, gateway_ref, status, created_at')
      .eq('purpose', 'subscription')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const rows = (payments ?? []) as {
    id: string;
    amount_thb: number;
    gateway_ref: string | null;
    status: string;
    created_at: string;
  }[];

  const quotaText =
    entitlements.projectLimit === null
      ? `${fmt(used)} โปรเจกต์ (ไม่จำกัด)`
      : `${fmt(used)} / ${fmt(entitlements.projectLimit)} โปรเจกต์`;

  return (
    <div className="wrap">
      <ProHeader label={user.company ?? user.email} credits={credits} isAdmin={user.role === 'admin'} />

      <section className="hero">
        <h1>
          แพ็กเกจ<span className="hl">สมาชิก</span>
        </h1>
        <p>
          ตอนนี้ใช้แพ็กเกจ <b>{entitlements.plan.name}</b>
          {sub?.status && ` · ${SUBSCRIPTION_STATUS_LABEL[String(sub.status)] ?? sub.status}`}
        </p>
      </section>

      <div className="metrics">
        <div className="metric">
          <div className="k">แพ็กเกจปัจจุบัน</div>
          <div className="v">
            {entitlements.plan.name}
            {!entitlements.active && <small> (หมดอายุ)</small>}
          </div>
        </div>
        <div className="metric">
          <div className="k">โปรเจกต์ที่ใช้ไป</div>
          <div className="v">{quotaText}</div>
        </div>
        <div className="metric">
          <div className="k">เหลืออีก</div>
          <div className="v">
            {entitlements.daysLeft !== null ? `${fmt(Math.max(0, entitlements.daysLeft))} วัน` : 'ไม่มีกำหนด'}
          </div>
        </div>
        <div className="metric">
          <div className="k">เครดิตท้ายรายงาน</div>
          <div className="v">{entitlements.canRemoveBranding ? 'ถอดออกแล้ว' : 'ยังติดอยู่'}</div>
        </div>
      </div>

      {!entitlements.active && (
        <div className="notice warn">
          แพ็กเกจหมดอายุแล้ว — ตอนนี้ใช้สิทธิ์เท่าแพ็กเกจทดลอง (เก็บได้ 3 โปรเจกต์)
          งานเก่ายังเปิดดูได้ทั้งหมด ต่ออายุเพื่อปลดล็อกโควตาคืน
        </div>
      )}

      <PlanPicker currentPlan={entitlements.plan.id} payee={payeeInfo()} />

      <div className="card" style={{ marginTop: 20 }}>
        <h2>
          <span className="num">3</span> ประวัติการแจ้งโอนแพ็กเกจ
        </h2>
        {rows.length === 0 ? (
          <p className="placeholder">ยังไม่มีรายการ</p>
        ) : (
          <div className="table-scroll">
            <table className="kv purchases">
              <thead>
                <tr>
                  <th>วันที่แจ้ง</th>
                  <th>แพ็กเกจ</th>
                  <th>จำนวนเงิน</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(
                        new Date(p.created_at),
                      )}
                    </td>
                    <td>{p.gateway_ref?.replace(':', ' × ') ?? '–'} เดือน</td>
                    <td>{baht(Number(p.amount_thb))}</td>
                    <td>
                      <span className={`pay-status ${p.status}`}>
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
