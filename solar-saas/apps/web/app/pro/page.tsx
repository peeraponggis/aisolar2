import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { supabaseAdmin, supabaseAsUser } from '@/lib/supabase-server';
import { LEAD_PRICE_CREDITS, SEGMENT_LABEL } from '@/lib/pro';
import LineLinkBox from '@/components/LineLinkBox';
import { createLinkToken } from '@/lib/line-token';
import { isLineConfigured } from '@/lib/line';
import { fmt } from '@/lib/format';

export const metadata: Metadata = {
  title: 'แดชบอร์ดผู้ติดตั้ง — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export default async function ProDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');

  const credits = await creditBalance(user);
  // จำนวน lead ในตลาดเป็นตัวเลขรวม ไม่ใช่ข้อมูลของใครคนหนึ่ง — ต้องใช้ admin เพราะ RLS
  // ไม่เปิดให้ช่างเห็น lead ที่ยังไม่ได้ซื้อ
  const admin = supabaseAdmin()!;
  // ส่วนรายการที่ซื้อไปแล้วเป็นข้อมูลของช่างคนนี้ — อ่านในนามผู้ใช้ให้ RLS คุมอีกชั้น
  const asUser = supabaseAsUser(user.accessToken)!;

  const [{ count: listedCount }, { data: myPurchases }] = await Promise.all([
    admin.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'listed'),
    asUser
      .from('lead_purchases')
      .select('id, credits_paid, purchased_at, leads(province, segment, suggested_kwp, contact_name, contact_phone)')
      .eq('installer_id', user.id)
      .order('purchased_at', { ascending: false })
      .limit(20),
  ]);

  const { data: profile } = await asUser
    .from('profiles')
    .select('line_user_id')
    .eq('id', user.id)
    .maybeSingle();
  const lineLinked = Boolean(profile?.line_user_id);
  const lineToken = isLineConfigured() && !lineLinked ? createLinkToken('installer', user.id) : null;

  const purchases = (myPurchases ?? []) as unknown as {
    id: string;
    credits_paid: number;
    purchased_at: string;
    leads: {
      province: string;
      segment: keyof typeof SEGMENT_LABEL;
      suggested_kwp: number;
      contact_name: string;
      contact_phone: string;
    } | null;
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
          สวัสดี <span className="hl">{user.fullName ?? user.email}</span>
        </h1>
        <p>
          {user.company} · {user.province}
        </p>
      </section>

      <div className="metrics">
        <div className="metric">
          <div className="k">เครดิตคงเหลือ</div>
          <div className="v">{fmt(credits)}</div>
        </div>
        <div className="metric">
          <div className="k">lead ในตลาดตอนนี้</div>
          <div className="v">{fmt(listedCount ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="k">lead ที่ซื้อแล้ว</div>
          <div className="v">{fmt(purchases.length)}</div>
        </div>
        <div className="metric">
          <div className="k">ราคาต่อ lead</div>
          <div className="v">
            {LEAD_PRICE_CREDITS.residential}–{LEAD_PRICE_CREDITS.ci} <small>เครดิต</small>
          </div>
        </div>
      </div>

      {isLineConfigured() && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>
            <span className="num">1</span> แจ้งเตือน lead ใหม่ทาง LINE
          </h2>
          {lineLinked ? (
            <p className="placeholder">
              ผูกบัญชี LINE ไว้แล้ว — จะได้รับแจ้งเตือนทันทีเมื่อมี lead ใหม่ใน{user.province}
            </p>
          ) : (
            lineToken && (
              <LineLinkBox
                token={lineToken}
                addFriendUrl={process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? ''}
                title="ผูกบัญชีเพื่อรับแจ้งเตือนก่อนใคร"
                description={`lead ในตลาดใครซื้อก่อนได้ก่อน ผูก LINE ไว้จะได้รู้ทันทีที่มี lead ใหม่ใน${user.province ?? 'จังหวัดของคุณ'}`}
              />
            )
          )}
        </div>
      )}

      <div className="card">
        <h2>
          <span className="num">2</span> lead ที่คุณซื้อแล้ว
        </h2>
        {purchases.length === 0 ? (
          <p className="placeholder">
            ยังไม่ได้ซื้อ lead — <Link href="/pro/leads">ไปดูตลาด</Link>
          </p>
        ) : (
          <div className="table-scroll">
            <table className="kv purchases">
              <thead>
                <tr>
                  <th>วันที่ซื้อ</th>
                  <th>ลูกค้า</th>
                  <th>เบอร์ติดต่อ</th>
                  <th>จังหวัด</th>
                  <th>ประเภท</th>
                  <th>ขนาด</th>
                  <th>เครดิต</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(p.purchased_at))}</td>
                    <td>{p.leads?.contact_name ?? '–'}</td>
                    <td>{p.leads?.contact_phone ?? '–'}</td>
                    <td>{p.leads?.province ?? '–'}</td>
                    <td>{p.leads ? SEGMENT_LABEL[p.leads.segment] : '–'}</td>
                    <td>{p.leads ? `${fmt(p.leads.suggested_kwp, 2)} kWp` : '–'}</td>
                    <td>{p.credits_paid}</td>
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
