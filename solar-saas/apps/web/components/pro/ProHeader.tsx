'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
/**
 * รับเฉพาะข้อความที่ต้องแสดง — ห้ามรับ SessionUser ทั้งก้อน
 * เพราะ SessionUser มี accessToken อยู่ด้วย ถ้าส่งเข้ามาที่นี่ token จะถูก serialize
 * ไปกับ RSC payload แล้วไปโผล่ในเบราว์เซอร์ ซึ่งลบล้างเหตุผลที่ใช้ httpOnly cookie ตั้งแต่แรก
 */
export default function ProHeader({
  label,
  credits,
  isAdmin = false,
}: {
  label: string;
  credits: number;
  isAdmin?: boolean;
}) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/pro/login');
    router.refresh();
  }

  return (
    <header>
      <div className="brand">
        <Image className="mark" src="/logo-header.png" alt="PROINVENTIVE" width={160} height={160} priority />
        <div>
          PROINVENTIVE
          <small>{label}</small>
        </div>
      </div>
      <div className="pro-nav">
        <Link href="/pro">แดชบอร์ด</Link>
        <Link href="/pro/leads">ตลาด Lead</Link>
        <Link href="/pro/projects">โปรเจกต์</Link>
        <Link href="/pro/credits">เติมเครดิต</Link>
        <Link href="/pro/subscription">แพ็กเกจ</Link>
        <Link href="/pro/settings">ตั้งค่า</Link>
        {isAdmin && <Link href="/pro/admin/leads">ผู้ดูแล</Link>}
        <span className="credits" title="เครดิตคงเหลือ">
          {credits} เครดิต
        </span>
        <button type="button" className="link-btn" onClick={logout}>
          ออกจากระบบ
        </button>
      </div>
    </header>
  );
}
