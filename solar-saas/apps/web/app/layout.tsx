import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SNIPPET } from '@/styles/theme-manager';
import './globals.css';

/**
 * ที่อยู่ตั้งต้นของรูปภาพในเมตาแท็ก
 *
 * ถ้าไม่ตั้ง Next จะเดาเป็น http://localhost:<PORT> ทำให้ og:image ที่ส่งออกไป
 * ชี้ไป localhost — เวลาแชร์ลิงก์ใน LINE หรือ Facebook รูปตัวอย่างจะไม่ขึ้น
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'คำนวณความคุ้มค่าโซลาร์เซลล์ — PROINVENTIVE Solar',
  description:
    'กรอกค่าไฟต่อเดือน รู้ขนาดระบบที่เหมาะสม เงินลงทุน และปีคืนทุนทันที คำนวณด้วยอัตราค่าไฟ กฟภ. จริงครบ 8 ประเภท',
  openGraph: {
    title: 'ติดโซลาร์เซลล์คุ้มไหม? รู้ผลใน 30 วินาที',
    description: 'คำนวณด้วยอัตราค่าไฟ กฟภ. จริง พร้อมกราฟผลผลิตและกระแสเงินสด 15 ปี',
    siteName: 'PROINVENTIVE Solar',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/logo-doc.png', width: 360, height: 360, alt: 'PROINVENTIVE' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // inline script ด้านล่างแก้ data-theme ก่อน React hydrate — ต่างจาก SSR โดยตั้งใจ
    <html lang="th" data-theme="solar-amber" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* ตั้งธีมก่อน render เพื่อกันจอกระพริบเป็นธีมผิด */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SNIPPET }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
