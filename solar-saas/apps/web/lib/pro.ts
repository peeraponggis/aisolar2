/**
 * ชั้นธุรกิจที่ 2 — ราคา lead และการปกปิดข้อมูลติดต่อก่อนซื้อ
 * ใช้ร่วมกันระหว่าง API เก็บ lead และหน้าตลาดของช่าง
 */

/** ราคา lead เป็นเครดิต ตามขนาดงาน — งานใหญ่มูลค่าสูงกว่าจึงตั้งราคาสูงกว่า */
export const LEAD_PRICE_CREDITS: Record<'residential' | 'sme' | 'ci', number> = {
  residential: 1,
  sme: 3,
  ci: 8,
};

export const SEGMENT_LABEL: Record<'residential' | 'sme' | 'ci', string> = {
  residential: 'บ้านอยู่อาศัย',
  sme: 'กิจการขนาดเล็ก–กลาง',
  ci: 'ธุรกิจและอุตสาหกรรม',
};

/** เครดิตแถมตอนสมัคร ให้ช่างลองซื้อ lead แรกได้โดยไม่ต้องเติมเงิน */
export const SIGNUP_BONUS_CREDITS = 3;

/** ปกปิดชื่อ เหลือแค่ตัวแรกของแต่ละคำ */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word.length <= 1 ? word : `${word[0]}${'•'.repeat(Math.min(word.length - 1, 5))}`))
    .join(' ');
}

/** ปกปิดเบอร์ เหลือ 3 ตัวหน้าและ 2 ตัวท้าย พอให้ช่างยืนยันได้หลังซื้อว่าตรงกัน */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '•'.repeat(digits.length);
  return `${digits.slice(0, 3)}-•••-${digits.slice(-2)}`;
}

/* ============ เติมเครดิต ============ */

export interface CreditPackage {
  /** รหัสแพ็กเกจ ใช้อ้างตอนส่งฟอร์ม — ราคาคิดจากฝั่ง server เสมอ ห้ามเชื่อตัวเลขจาก client */
  id: string;
  credits: number;
  priceThb: number;
  label: string;
}

/**
 * แพ็กเกจเครดิต — ยิ่งซื้อเยอะยิ่งถูกต่อหน่วย
 * ⚠ ตัวเลขนี้เป็นค่าตั้งต้น ควรปรับให้ตรงกับต้นทุนการหา lead จริงก่อนเปิดขาย
 */
export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'starter', credits: 5, priceThb: 500, label: 'เริ่มต้น' },
  { id: 'standard', credits: 15, priceThb: 1350, label: 'มาตรฐาน' },
  { id: 'pro', credits: 40, priceThb: 3200, label: 'มืออาชีพ' },
  { id: 'team', credits: 100, priceThb: 7000, label: 'ทีมงาน' },
];

export function findPackage(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((p) => p.id === id);
}

/** ราคาต่อเครดิต ใช้แสดงส่วนลดให้เห็นภาพ */
export function pricePerCredit(pkg: CreditPackage): number {
  return pkg.priceThb / pkg.credits;
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'รอตรวจสอบ',
  confirmed: 'เติมเครดิตแล้ว',
  failed: 'ไม่ผ่านการตรวจสอบ',
};

/** ไฟล์สลิปที่ยอมรับ — ตรวจซ้ำฝั่ง server เสมอ ไม่เชื่อ accept ของ input */
export const SLIP_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const SLIP_MAX_BYTES = 5 * 1024 * 1024;

/** ข้อมูลบัญชีรับโอน — ตั้งผ่าน env ไม่ hardcode เลขบัญชีไว้ในโค้ด */
export interface PayeeInfo {
  bank: string;
  accountName: string;
  accountNumber: string;
  promptPay: string;
  configured: boolean;
}

export function payeeInfo(): PayeeInfo {
  const bank = process.env.NEXT_PUBLIC_PAYEE_BANK ?? '';
  const accountName = process.env.NEXT_PUBLIC_PAYEE_ACCOUNT_NAME ?? '';
  const accountNumber = process.env.NEXT_PUBLIC_PAYEE_ACCOUNT_NUMBER ?? '';
  const promptPay = process.env.NEXT_PUBLIC_PAYEE_PROMPTPAY ?? '';
  return {
    bank,
    accountName,
    accountNumber,
    promptPay,
    configured: Boolean(accountNumber || promptPay),
  };
}
