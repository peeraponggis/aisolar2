import type { BillInput, PeaRates, SimpleUserType, BillEstimateInput, BillEstimate } from '../types.ts';
import { calculateBill } from './calc-bill.ts';

/** ชั่วโมงต่อเดือนที่ใช้แปลงหน่วยเป็นค่าความต้องการพลังไฟฟ้า (30 วัน x 24 ชม.) */
const HOURS_PER_MONTH = 720;
/** Load Factor เริ่มต้นของกิจการขนาดกลาง — ใช้ประมาณ Demand จากหน่วยเมื่อผู้ใช้ไม่ได้กรอก */
const DEFAULT_LOAD_FACTOR = 0.4;
/** ค่า Ft ประกาศล่าสุด (บาท/หน่วย) */
export const DEFAULT_FT = 0.1623;
export const DEFAULT_VAT_PERCENT = 7;

/** ประเภทผู้ใช้ไฟ กฟภ. ที่รองรับในหน้าคำนวณฟรี (ย่อจาก 8 ประเภทให้เหลือ 3 ตัวเลือก) */
const PEA_TYPE_OF: Record<SimpleUserType, 1 | 2 | 3> = { home: 1, small: 2, medium: 3 };

function buildBillInput(
  units: number,
  input: { userType: SimpleUserType; ft: number; vatPercent: number },
  demandKw: number,
): BillInput {
  const base = { ft: input.ft, vatPercent: input.vatPercent };
  switch (input.userType) {
    case 'home':
      return { ...base, type: 1, mode: 'normal', units };
    case 'small':
      return { ...base, type: 2, mode: 'normal', voltage: 'low', units };
    case 'medium':
      return { ...base, type: 3, mode: 'normal', voltage: 'low', demandKw, units };
  }
}

/** Demand (kW) ที่ประมาณจากหน่วยใช้ไฟ — ใช้เฉพาะประเภทที่คิดค่าความต้องการพลังไฟฟ้า */
function estimateDemandKw(units: number, userType: SimpleUserType, loadFactor: number): number {
  if (userType !== 'medium') return 0;
  return units / (HOURS_PER_MONTH * loadFactor);
}

export interface BillAtUnitsOptions {
  userType: SimpleUserType;
  ft: number;
  vatPercent: number;
  /** ตรึงค่าความต้องการพลังไฟฟ้าไว้เท่าเดิม — โซลาร์ลดหน่วย ไม่ลด Peak Demand */
  demandKw: number;
}

/** ยอดบิลรวม VAT ณ จำนวนหน่วยที่กำหนด โดยตรึง Demand ไว้ */
export function monthlyBillAtUnits(
  units: number,
  options: BillAtUnitsOptions,
  rates: PeaRates,
): number {
  return calculateBill(buildBillInput(Math.max(0, units), options, options.demandKw), rates).grandTotal;
}

/**
 * มูลค่าเงินที่ประหยัดได้จริงเมื่อลดหน่วยลง — คิดจากส่วนต่างของบิลสองใบ
 *
 * ห้ามใช้ "หน่วยที่ลดได้ × อัตราส่วนเพิ่ม" เพราะอัตราส่วนเพิ่มเป็นราคาของขั้นบนสุดเท่านั้น
 * พอลดหน่วยลงมาก ๆ จะไหลลงขั้นที่ถูกกว่า การคูณตรง ๆ จึงให้เงินประหยัดเกินค่าไฟทั้งบิล
 */
export function savingFromUnitReduction(
  monthlyUnits: number,
  monthlyUnitsSaved: number,
  options: BillAtUnitsOptions,
  rates: PeaRates,
): number {
  const before = monthlyBillAtUnits(monthlyUnits, options, rates);
  const after = monthlyBillAtUnits(monthlyUnits - monthlyUnitsSaved, options, rates);
  return Math.max(0, before - after);
}

/**
 * ประมาณหน่วยใช้ไฟ/เดือน จากยอดบิล (รวม VAT) — อินเวอร์สของ calculateBill()
 *
 * ใช้ bisection เพราะบิลเป็นฟังก์ชันเพิ่มตามหน่วย ยกเว้นรอยต่อ 150 หน่วยของประเภท 1
 * ที่อัตราสลับจาก under150 เป็น over150 แล้วบิลลดลงราว 15 บาท — ในช่วงแคบนั้น
 * ผลลัพธ์อาจคลาดเคลื่อนไม่กี่หน่วย ซึ่งยอมรับได้สำหรับหน้าประมาณการเบื้องต้น
 */
export function estimateUnitsFromBill(
  monthlyBill: number,
  input: Required<Pick<BillEstimateInput, 'userType' | 'ft' | 'vatPercent' | 'loadFactor'>>,
  rates: PeaRates,
): number {
  const billAt = (units: number): number => {
    const demandKw = estimateDemandKw(units, input.userType, input.loadFactor);
    return calculateBill(buildBillInput(units, input, demandKw), rates).grandTotal;
  };

  if (monthlyBill <= billAt(0)) return 0;

  let lo = 0;
  let hi = 1000;
  while (billAt(hi) < monthlyBill && hi < 1e7) hi *= 2;

  for (let i = 0; i < 100 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    if (billAt(mid) < monthlyBill) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * ประมาณโปรไฟล์การใช้ไฟจากยอดบิลเดือนละ X บาท
 * คืนทั้งหน่วย/เดือน, Demand ที่ใช้คิด และอัตราค่าไฟสองแบบ:
 *  - marginalTariff: บาท/หน่วยที่ "ประหยัดได้จริง" เมื่อลดหน่วยลง (โซลาร์ลดเฉพาะค่าพลังงาน
 *    ไม่ลดค่า Demand และค่าบริการ) — ใช้ตัวนี้คิดเงินประหยัด
 *  - averageTariff: บาท/หน่วยเฉลี่ยทั้งบิล — ใช้แสดงผลให้ผู้ใช้เทียบกับบิลของตัวเอง
 */
export function estimateFromBill(input: BillEstimateInput, rates: PeaRates): BillEstimate {
  const opts = {
    userType: input.userType,
    ft: input.ft ?? DEFAULT_FT,
    vatPercent: input.vatPercent ?? DEFAULT_VAT_PERCENT,
    loadFactor: input.loadFactor ?? DEFAULT_LOAD_FACTOR,
  };

  const monthlyUnits = estimateUnitsFromBill(input.monthlyBill, opts, rates);
  const demandKw = estimateDemandKw(monthlyUnits, opts.userType, opts.loadFactor);
  const bill = calculateBill(buildBillInput(monthlyUnits, opts, demandKw), rates);

  // อัตราส่วนเพิ่ม: ลดหน่วยลง delta โดยตรึง Demand ไว้เท่าเดิม (โซลาร์ไม่ลด Peak Demand)
  const delta = Math.max(1, Math.min(50, monthlyUnits * 0.05));
  const lower = calculateBill(
    buildBillInput(Math.max(0, monthlyUnits - delta), opts, demandKw),
    rates,
  );
  const marginalTariff = monthlyUnits > 0 ? (bill.grandTotal - lower.grandTotal) / delta : 0;

  return {
    monthlyUnits,
    demandKw,
    marginalTariff,
    averageTariff: monthlyUnits > 0 ? bill.grandTotal / monthlyUnits : 0,
    peaType: PEA_TYPE_OF[opts.userType],
    rateDescription: bill.rateDescription,
    bill,
  };
}
