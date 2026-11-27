import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/pro/AuthForm';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'เข้าสู่ระบบผู้ติดตั้ง — PROINVENTIVE Solar',
  robots: { index: false, follow: false },
};

export default async function ProLoginPage() {
  if (await getCurrentUser()) redirect('/pro');

  return (
    <div className="wrap auth-wrap">
      <header>
        <div className="brand">
          <Image className="mark" src="/logo-header.png" alt="PROINVENTIVE" width={160} height={160} priority />
          <div>
            PROINVENTIVE
            <small>สำหรับผู้ติดตั้ง</small>
          </div>
        </div>
      </header>
      <section className="hero">
        <h1>
          ตลาด<span className="hl">ลูกค้าโซลาร์</span>สำหรับผู้ติดตั้ง
        </h1>
        <p>ลูกค้าที่คำนวณความคุ้มค่าแล้วและต้องการใบเสนอราคา — เลือกซื้อเฉพาะงานที่คุณอยากได้</p>
      </section>
      <AuthForm />
    </div>
  );
}
