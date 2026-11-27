/**
 * ตราสินค้าบนรายงาน (white-label)
 *
 * รายงานของ lead = ของเรา ใช้ตรา PROINVENTIVE เสมอ (ลูกค้ายังไม่ได้เลือกผู้ติดตั้ง)
 * รายงานของโปรเจกต์ = ของช่าง ใช้โลโก้และชื่อบริษัทของช่างคนนั้น เพราะเป็นเอกสารที่เขา
 * ส่งให้ลูกค้าตัวเอง ถ้าขึ้นตราเราจะเหมือนเราเป็นคนเสนอราคาแทนเขา
 */

export interface ReportBranding {
  /** ชื่อที่แสดงเป็นหัวรายงาน */
  name: string;
  /** คำบรรยายใต้ชื่อ */
  tagline: string;
  /** URL โลโก้ — ต้องเป็น absolute เพราะ PDF ถูก render โดยเบราว์เซอร์คนละที่ */
  logoUrl: string;
  /** บรรทัดติดต่อใต้หัวรายงาน (เบอร์/จังหวัด) */
  contactLine?: string;
  /** แสดงเครดิต "คำนวณด้วยระบบ PROINVENTIVE Solar" ท้ายรายงานหรือไม่ */
  showPoweredBy: boolean;
}

export const HOUSE_BRANDING: ReportBranding = {
  name: 'PROINVENTIVE Solar',
  tagline: 'รายงานวิเคราะห์ความคุ้มค่าระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์',
  logoUrl: '/logo-doc.png',
  showPoweredBy: false,
};

/**
 * ประกอบตราของช่างจากโปรไฟล์ — ไม่มีโลโก้ก็ถอยไปใช้ของเรา
 * เครดิตท้ายรายงานถอดออกได้เฉพาะแพ็กเกจที่ซื้อสิทธิ์นั้นไว้ (ดู lib/plans.ts)
 */
export function installerBranding(
  profile: {
    company: string | null;
    fullName: string | null;
    phone: string | null;
    province: string | null;
    logoUrl: string | null;
  },
  canRemoveBranding = false,
): ReportBranding {
  const contact = [profile.phone, profile.province].filter(Boolean).join(' · ');
  return {
    name: profile.company || profile.fullName || HOUSE_BRANDING.name,
    tagline: 'รายงานวิเคราะห์ความคุ้มค่าระบบผลิตไฟฟ้าพลังงานแสงอาทิตย์',
    logoUrl: profile.logoUrl || HOUSE_BRANDING.logoUrl,
    ...(contact ? { contactLine: contact } : {}),
    showPoweredBy: !canRemoveBranding,
  };
}

export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
