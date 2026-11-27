/**
 * แพ็กเกจสมาชิกของช่าง (ชั้นธุรกิจที่ 3)
 *
 * นิยามไว้ในโค้ดที่เดียว ไม่ทำเป็นตารางในฐานข้อมูล — ราคาและสิทธิ์เปลี่ยนไม่บ่อย
 * และการมีตารางแยกจะทำให้ต้องดูแลให้ตรงกับโค้ดอยู่ดี ตาราง subscriptions เก็บแค่ว่า
 * ใครอยู่แพ็กเกจไหนและหมดอายุเมื่อไร
 */

export const PLAN_IDS = ['trial', 'starter', 'pro', 'team'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  /** ราคาต่อเดือน (บาท) — 0 = ไม่ต้องจ่าย */
  priceThb: number;
  /** จำนวนโปรเจกต์ที่เก็บพร้อมกันได้ — null = ไม่จำกัด */
  projectLimit: number | null;
  /** ถอดเครดิต "คำนวณด้วยระบบ PROINVENTIVE" ออกจากรายงานได้ไหม */
  canRemoveBranding: boolean;
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial',
    name: 'ทดลองใช้',
    priceThb: 0,
    projectLimit: 3,
    canRemoveBranding: false,
    highlights: ['ทดลองฟรี 14 วัน', 'เก็บได้ 3 โปรเจกต์', 'รายงานใส่โลโก้ของคุณได้'],
  },
  starter: {
    id: 'starter',
    name: 'เริ่มต้น',
    priceThb: 690,
    projectLimit: 25,
    canRemoveBranding: false,
    highlights: ['เก็บได้ 25 โปรเจกต์', 'รายงานใส่โลโก้ของคุณ', 'แจ้งเตือน lead ทาง LINE'],
  },
  pro: {
    id: 'pro',
    name: 'มืออาชีพ',
    priceThb: 1490,
    projectLimit: null,
    canRemoveBranding: true,
    highlights: ['โปรเจกต์ไม่จำกัด', 'ถอดเครดิต PROINVENTIVE ออกจากรายงานได้', 'รายงานเป็นของคุณ 100%'],
  },
  team: {
    id: 'team',
    name: 'ทีมงาน',
    priceThb: 2990,
    projectLimit: null,
    canRemoveBranding: true,
    highlights: ['ทุกอย่างในแพ็กเกจมืออาชีพ', 'รองรับทีมหลายคน (เร็ว ๆ นี้)', 'ซัพพอร์ตแบบเร่งด่วน'],
  },
};

export const TRIAL_DAYS = 14;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: 'ใช้งานอยู่',
  past_due: 'เกินกำหนดชำระ',
  suspended: 'ระงับชั่วคราว',
  cancelled: 'ยกเลิกแล้ว',
};

/** สิทธิ์ที่ใช้ได้จริง ณ ตอนนี้ — คิดจากแพ็กเกจ สถานะ และวันหมดอายุรวมกัน */
export interface Entitlements {
  /** แพ็กเกจที่ซื้อไว้ */
  plan: Plan;
  /** แพ็กเกจที่ใช้สิทธิ์ได้จริงตอนนี้ — หมดอายุแล้วจะเป็น trial ไม่ใช่ตัวที่ซื้อไว้ */
  effectivePlan: Plan;
  /** แพ็กเกจยังใช้ได้อยู่ไหม (ยังไม่หมดอายุและสถานะปกติ) */
  active: boolean;
  projectLimit: number | null;
  canRemoveBranding: boolean;
  expiresAt: string | null;
  /** เหลืออีกกี่วัน — null ถ้าไม่มีวันหมดอายุ */
  daysLeft: number | null;
}

/**
 * หมดอายุแล้วไม่ตัดสิทธิ์ทิ้งทั้งหมด แต่ถอยกลับไปเป็นข้อจำกัดของ trial
 * ช่างจะยังเปิดงานเก่าดูได้ ไม่ใช่ล็อกออกจากข้อมูลตัวเองเพราะลืมต่ออายุ
 */
export function entitlementsFrom(
  row: { plan: string; status: string; current_period_end: string | null; trial_ends_at: string | null } | null,
  now = new Date(),
): Entitlements {
  const plan = isPlanId(row?.plan) ? PLANS[row.plan] : PLANS.trial;
  const expiresRaw = row?.current_period_end ?? row?.trial_ends_at ?? null;
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

  const notExpired = !expiresAt || expiresAt.getTime() > now.getTime();
  const statusOk = row?.status === 'active';
  const active = Boolean(row) && statusOk && notExpired;

  const effective = active ? plan : PLANS.trial;

  return {
    plan,
    effectivePlan: effective,
    active,
    projectLimit: effective.projectLimit,
    canRemoveBranding: active && effective.canRemoveBranding,
    expiresAt: expiresRaw,
    daysLeft: expiresAt
      ? Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : null,
  };
}
