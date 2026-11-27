import type { ReactNode } from 'react';

// ทุกหน้าใต้ /pro ขึ้นกับ session cookie — ห้ามให้ Next prerender เป็น static
// ไม่งั้นตอน build (ไม่มี cookie ของใคร) ผล "ไม่ได้ล็อกอิน → เด้งไป login"
// จะถูกอบค้างในแคชแล้วเสิร์ฟให้ทุกคน แม้แต่คนที่ล็อกอินสำเร็จแล้ว
export const dynamic = 'force-dynamic';

export default function ProLayout({ children }: { children: ReactNode }) {
  return children;
}
