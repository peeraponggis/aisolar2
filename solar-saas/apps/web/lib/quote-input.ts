/**
 * ตรวจอินพุตของเครื่องคำนวณ — ใช้ร่วมกันทั้งฟอร์มเก็บ lead และโปรเจกต์ของช่าง
 * แยกออกมาไว้ที่เดียวเพื่อไม่ให้กฎการตรวจสองที่หลุดจากกัน
 */
import type { ExistingPvInput, ExistingYieldBasis, SimpleUserType, SolarRegion } from '@proinventive/solar-engine';
import { MIN_BILL, type QuoteInput } from './quote';
import { sanitizeAdvanced } from './advanced';

const USER_TYPES: SimpleUserType[] = ['home', 'small', 'medium'];
const REGIONS: SolarRegion[] = ['central', 'north', 'northeast', 'south'];
const PANEL_WATTS = [620, 670, 700, 725];
const YIELD_BASES: ExistingYieldBasis[] = ['estimate', 'monthly', 'hourly'];

/** ตัวเลขบวกที่รับได้ — ค่าติดลบหรือค่าประหลาดถูกตัดเป็น undefined ไม่ใช่ 0 */
const positive = (v: unknown, max: number): number | undefined => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 && x <= max ? x : undefined;
};

const series = (v: unknown, length: number): number[] | undefined => {
  if (!Array.isArray(v) || v.length !== length) return undefined;
  const out = v.map((x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0));
  return out.some((x) => x > 0) ? out : undefined;
};

/**
 * ตรวจข้อมูลระบบเดิม — คืน undefined เมื่อไม่มีหรือกรอกไม่พอใช้
 * ไม่คืน error เพราะระบบเดิมเป็นของเสริม ฟอร์มที่ไม่ได้กรอกต้องผ่านได้ตามปกติ
 */
function cleanExisting(raw: unknown): ExistingPvInput | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const e = raw as Partial<ExistingPvInput>;
  const acKw = positive(e.acKw, 10000);
  if (acKw === undefined) return undefined;
  return {
    acKw,
    inverterModel: typeof e.inverterModel === 'string' ? e.inverterModel.slice(0, 120) : undefined,
    panelWatt: positive(e.panelWatt, 2000),
    panelCount: positive(e.panelCount, 100000),
    installYear: positive(e.installYear, 3000),
    degradationPercent: positive(e.degradationPercent, 10),
    specificYield: positive(e.specificYield, 3000),
    transformerKva: positive(e.transformerKva, 100000),
    hasAntiBackflow: Boolean(e.hasAntiBackflow),
    basis: YIELD_BASES.includes(e.basis as ExistingYieldBasis)
      ? (e.basis as ExistingYieldBasis)
      : 'estimate',
    monthlyKwh: series(e.monthlyKwh, 12),
    hourlyKwh: series(e.hourlyKwh, 24),
  };
}

export function validateQuoteInput(raw: unknown): { value: QuoteInput } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'รูปแบบข้อมูลไม่ถูกต้อง' };
  const i = raw as Partial<QuoteInput>;

  const monthlyBill = Number(i.monthlyBill);
  if (!Number.isFinite(monthlyBill) || monthlyBill < MIN_BILL) {
    return { error: `ค่าไฟต้องไม่ต่ำกว่า ${MIN_BILL} บาท` };
  }
  if (!USER_TYPES.includes(i.userType as SimpleUserType)) return { error: 'ประเภทผู้ใช้ไฟไม่ถูกต้อง' };

  const daylightRatio = Number(i.daylightRatio);
  if (!Number.isFinite(daylightRatio) || daylightRatio < 0.05 || daylightRatio > 0.95) {
    return { error: 'สัดส่วนใช้ไฟกลางวันไม่ถูกต้อง' };
  }
  if (!REGIONS.includes(i.region as SolarRegion)) return { error: 'พื้นที่ติดตั้งไม่ถูกต้อง' };
  if (!PANEL_WATTS.includes(Number(i.panelWatt))) return { error: 'ขนาดแผงไม่ถูกต้อง' };

  return {
    value: {
      monthlyBill,
      userType: i.userType as SimpleUserType,
      daylightRatio,
      hasBattery: Boolean(i.hasBattery),
      region: i.region as SolarRegion,
      panelWatt: Number(i.panelWatt),
      ...(i.allowDischargeBeforePsh !== undefined
        ? { allowDischargeBeforePsh: Boolean(i.allowDischargeBeforePsh) }
        : {}),
      ...(i.allowDischargeAfterPsh !== undefined
        ? { allowDischargeAfterPsh: Boolean(i.allowDischargeAfterPsh) }
        : {}),
      advanced: sanitizeAdvanced(i.advanced ?? {}),
      ...(cleanExisting(i.existing) ? { existing: cleanExisting(i.existing) } : {}),
    },
  };
}
