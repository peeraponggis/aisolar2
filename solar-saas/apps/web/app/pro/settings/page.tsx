import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ProHeader from '@/components/pro/ProHeader';
import ProfileForm from '@/components/pro/ProfileForm';
import { creditBalance, getCurrentUser } from '@/lib/auth';
import { supabaseAsUser } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'ตั้งค่าบริษัท — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/pro/login');

  const asUser = supabaseAsUser(user.accessToken)!;
  const [credits, { data }] = await Promise.all([
    creditBalance(user),
    asUser.from('profiles').select('full_name, company, phone, province, logo_url').eq('id', user.id).maybeSingle(),
  ]);

  return (
    <div className="wrap">
      <ProHeader label={user.company ?? user.email} credits={credits} isAdmin={user.role === 'admin'} />

      <section className="hero">
        <h1>
          ตั้งค่า<span className="hl">บริษัท</span>
        </h1>
        <p>รายงานที่ส่งให้ลูกค้าจะขึ้นโลโก้และชื่อบริษัทของคุณ ไม่ใช่ของ PROINVENTIVE</p>
      </section>

      <ProfileForm
        initial={{
          fullName: String(data?.full_name ?? ''),
          company: String(data?.company ?? ''),
          phone: String(data?.phone ?? ''),
          province: String(data?.province ?? ''),
          logoUrl: (data?.logo_url as string | null) ?? null,
        }}
      />
    </div>
  );
}
