/**
 * สัญญาข้อมูลของฟอร์มเก็บ lead (ชั้นธุรกิจที่ 2)
 * ฝั่ง client ส่งแค่ "ข้อมูลติดต่อ + อินพุตที่กรอก" — ผลคำนวณให้ server เรียกเอนจินเองเสมอ
 * เพื่อไม่ให้ตัวเลขใน snapshot ถูกแก้จากฝั่งเบราว์เซอร์
 */
import type { SimpleUserType, SolarRegion } from '@proinventive/solar-engine';
import { MIN_BILL, type Quote } from './quote';
import type { AdvancedOverrides } from './advanced';
import { validateQuoteInput } from './quote-input';

/**
 * รุ่นของ calc_snapshot — ขยับทุกครั้งที่โครงสร้างเปลี่ยน
 * รายงานของ lead เก่าจะไม่ถูก render ด้วยโค้ดที่คาดหวังโครงสร้างใหม่
 */
export const SNAPSHOT_VERSION = 3;

/** ผลคำนวณทั้งก้อน ณ เวลาที่สร้าง lead — รายงานอ่านจากนี่โดยไม่คำนวณใหม่ */
export type LeadSnapshot = Quote & { version: number };

export interface LeadRequest {
  contact: {
    name: string;
    phone: string;
    email?: string;
    province: string;
  };
  input: {
    monthlyBill: number;
    userType: SimpleUserType;
    daylightRatio: number;
    hasBattery: boolean;
    region: SolarRegion;
    panelWatt: number;
    /** สมมติฐานที่ผู้ใช้ปรับเองในโหมดละเอียด — ถูกบีบให้อยู่ในช่วงที่ยอมรับได้ฝั่ง server */
    advanced?: AdvancedOverrides;
  };
}

export type LeadResponse =
  | {
      ok: true;
      storage: 'supabase' | 'local-file';
      /** id ของ lead (มีเฉพาะตอนบันทึกลง Supabase สำเร็จ) */
      leadId?: string;
      /** ลิงก์รายงานฉบับเต็มของ lead นี้ */
      reportUrl?: string;
      /** รหัสให้ลูกค้าคัดลอกไปวางในแชต LINE เพื่อรับรายงาน (มีเมื่อตั้งค่า LINE แล้ว) */
      lineToken?: string;
    }
  | { ok: false; error: string };

const USER_TYPES: SimpleUserType[] = ['home', 'small', 'medium'];
const REGIONS: SolarRegion[] = ['central', 'north', 'northeast', 'south'];
const PANEL_WATTS = [620, 670, 700, 725];

/** เบอร์ไทย: 9–10 หลัก ตัดช่องว่าง/ขีดออกก่อนตรวจ */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/** ตรวจ payload ฝั่ง server — คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน */
export function validateLead(body: unknown): { value: LeadRequest } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'รูปแบบข้อมูลไม่ถูกต้อง' };
  const b = body as Partial<LeadRequest>;
  const c = b.contact;
  const i = b.input;
  if (!c || !i) return { error: 'ข้อมูลไม่ครบ' };

  const name = String(c.name ?? '').trim();
  const phone = normalizePhone(String(c.phone ?? ''));
  const province = String(c.province ?? '').trim();
  const email = String(c.email ?? '').trim();

  if (name.length < 2) return { error: 'กรุณากรอกชื่อ-นามสกุล' };
  if (!/^0\d{8,9}$/.test(phone)) return { error: 'เบอร์โทรศัพท์ไม่ถูกต้อง (ขึ้นต้นด้วย 0 และมี 9–10 หลัก)' };
  if (province.length < 2) return { error: 'กรุณากรอกจังหวัด' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'อีเมลไม่ถูกต้อง' };

  const checkedInput = validateQuoteInput(i);
  if ('error' in checkedInput) return { error: checkedInput.error };

  return {
    value: {
      contact: { name, phone, province, ...(email ? { email } : {}) },
      input: checkedInput.value,
    },
  };
}
