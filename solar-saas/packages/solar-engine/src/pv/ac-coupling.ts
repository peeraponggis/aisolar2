import type {
  CombinedAcInput,
  CombinedAcResult,
  ExistingPvInput,
  ExistingPvResult,
  SolarRegion,
} from '../types.ts';
import { MONTHLY_PSH_FACTOR } from './monthly-yield.ts';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DAYS_PER_YEAR = 365;

/** สัดส่วนกำลังติดตั้งต่อหม้อแปลงที่ควรให้การไฟฟ้าตรวจก่อน */
export const TRANSFORMER_WARN_RATIO = 0.8;

/**
 * แปลงปีที่กรอกให้เป็น ค.ศ. เสมอ
 *
 * ฟอร์มไทยกรอกปีมาได้ทั้งสองแบบ และ 2567 กับ 2024 ต่างกัน 543 ปี
 * ถ้าไม่แปลง อายุระบบจะกลายเป็นติดลบหลายร้อยปี แล้วตัวคูณเสื่อมจะระเบิด
 */
export function toGregorianYear(year: number): number {
  return year > 2400 ? year - 543 : year;
}

/**
 * ผลผลิตจำเพาะที่คาดของระบบที่ไม่มีข้อมูลวัดจริง
 *
 * PSH ชม./วัน × 365 วัน × PR — ตัวเลขเดียวกับที่หน้าเว็บโชว์ให้ผู้ใช้เห็น
 * เพื่อให้ตรวจสอบที่มาได้เอง ไม่ใช่ตัวเลขที่โผล่มาลอย ๆ
 */
export function expectedSpecificYield(psh: number, pr: number): number {
  return psh * DAYS_PER_YEAR * pr;
}

/** กระจายพลังงานทั้งปีลง 12 เดือนตามรูปทรงฤดูกาลของภาคนั้น */
function spreadBySeason(annualKwh: number, region: SolarRegion): number[] {
  const factors = MONTHLY_PSH_FACTOR[region] ?? MONTHLY_PSH_FACTOR.central;
  const weights = factors.map((f, i) => f * DAYS_IN_MONTH[i]);
  const total = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => (annualKwh * w) / total);
}

/**
 * ประเมินระบบออนกริดเดิมที่จะนำมาต่อร่วมแบบ AC Coupling
 *
 * ทำไมต้องแยกสามกรณีตามข้อมูลที่ผู้ใช้มี
 *   ผู้ใช้ส่วนใหญ่รู้แค่ "กี่กิโลวัตต์" เท่านั้น ถ้าบังคับให้กรอกผลผลิตจริงจะไม่มีใครกรอก
 *   แต่คนที่มีข้อมูลจากแอปอินเวอร์เตอร์อยู่แล้ว ตัวเลขนั้นแม่นกว่าการประมาณมาก
 *   จึงรับทั้งสามแบบแล้วบอกให้ชัดว่าเลขที่ได้มาจากทางไหน
 *
 * ⚠ อัตราเสื่อมใช้เฉพาะกรณีประมาณเท่านั้น
 *   ข้อมูลที่วัดมาจริงสะท้อนการเสื่อมไปแล้วในตัว หักซ้ำอีกครั้งคือนับสองรอบ
 *   ทำให้ประเมินระบบเดิมต่ำกว่าความจริง แล้วออกแบบระบบใหม่ใหญ่เกินจำเป็น
 */
export function evaluateExistingPv(
  input: ExistingPvInput,
  opts: { psh: number; pr: number; region: SolarRegion; currentYear?: number },
): ExistingPvResult {
  const acKw = Math.max(0, input.acKw || 0);
  const panelWatt = Math.max(0, input.panelWatt || 0);
  const panelCount = Math.max(0, input.panelCount || 0);

  // รู้แผงจริงให้ใช้ DC เพราะผลผลิตเกิดจากแผง ไม่ใช่จากขนาดอินเวอร์เตอร์
  // ไม่รู้ก็ใช้ AC เป็นตัวตั้ง ซึ่งประเมินต่ำกว่าความจริงเล็กน้อย (DC/AC มักราว 1.1–1.3)
  const dcKwp = (panelWatt * panelCount) / 1000;
  const sizeBasis: 'dc' | 'ac' = dcKwp > 0 ? 'dc' : 'ac';
  const sizeKw = dcKwp > 0 ? dcKwp : acKw;

  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const installYear = input.installYear ? toGregorianYear(input.installYear) : 0;
  const ageYears = installYear > 0 ? Math.max(0, currentYear - installYear) : 0;
  const degRate = Math.max(0, input.degradationPercent || 0) / 100;
  const remainingFactor = Math.pow(1 - degRate, ageYears);

  const specificYield =
    input.specificYield && input.specificYield > 0
      ? input.specificYield
      : expectedSpecificYield(opts.psh, opts.pr);

  let annualKwh = 0;
  let monthlyKwh: number[];
  let hourlyKwh: number[] | null = null;
  let note = '';

  if (input.basis === 'monthly' && input.monthlyKwh?.some((v) => v > 0)) {
    const src = Array.from({ length: 12 }, (_, i) => Math.max(0, input.monthlyKwh?.[i] ?? 0));
    annualKwh = src.reduce((s, v) => s + v, 0);
    monthlyKwh = src;
    note = `ใช้ผลผลิตรายเดือนที่วัดจริง รวม ${Math.round(annualKwh).toLocaleString('th-TH')} kWh/ปี — ไม่หักเสื่อมซ้ำเพราะข้อมูลที่วัดมาสะท้อนการเสื่อมแล้ว`;
  } else if (input.basis === 'hourly' && input.hourlyKwh?.some((v) => v > 0)) {
    const src = Array.from({ length: 24 }, (_, i) => Math.max(0, input.hourlyKwh?.[i] ?? 0));
    const daily = src.reduce((s, v) => s + v, 0);
    annualKwh = daily * DAYS_PER_YEAR;
    monthlyKwh = spreadBySeason(annualKwh, opts.region);
    hourlyKwh = src;
    note = `ใช้ผลผลิตรายชั่วโมงที่วัดจริง เฉลี่ย ${daily.toFixed(1)} kWh/วัน คิดเป็น ${Math.round(annualKwh).toLocaleString('th-TH')} kWh/ปี`;
  } else {
    annualKwh = sizeKw * specificYield * remainingFactor;
    monthlyKwh = spreadBySeason(annualKwh, opts.region);
    const basisText = sizeBasis === 'dc' ? 'ขนาดแผงเดิม' : 'ขนาด AC (ยังไม่ได้กรอกแผงเดิม)';
    const agePart =
      ageYears > 0
        ? ` · หักเสื่อม ${(degRate * 100).toFixed(1)}%/ปี เป็นเวลา ${ageYears} ปี เหลือ ${(remainingFactor * 100).toFixed(0)}%`
        : '';
    note = `ประมาณจาก${basisText} ${sizeKw.toFixed(2)} kW × ผลผลิตจำเพาะ ${Math.round(specificYield).toLocaleString('th-TH')} kWh/kW/ปี${agePart}`;
  }

  return {
    sizeKw,
    sizeBasis,
    acKw,
    ageYears,
    remainingFactor,
    specificYield,
    annualKwh,
    avgDailyKwh: annualKwh / DAYS_PER_YEAR,
    monthlyKwh,
    hourlyKwh,
    basis: input.basis,
    note,
  };
}

/**
 * กำลัง AC สูงสุดรวมสายเมื่อต่อระบบใหม่เข้ากับระบบเดิม
 *
 * ตัวเลขนี้คือสิ่งที่การไฟฟ้าดู ไม่ใช่ขนาด kWp ของแผง — เพราะสิ่งที่ไหลเข้าสายคือฝั่ง AC
 * และเป็นเหตุผลหลักที่ต้องถามข้อมูลระบบเดิม ก่อนจะบอกลูกค้าว่าติดเพิ่มได้เท่าไร
 */
export function combineAcCapacity(input: CombinedAcInput): CombinedAcResult {
  const newAcKw = Math.max(0, input.newAcKw || 0);
  const existingAcKw = Math.max(0, input.existingAcKw || 0);
  const totalAcKw = newAcKw + existingAcKw;
  const transformerKva = Math.max(0, input.transformerKva || 0);
  const transformerLoadPercent = transformerKva > 0 ? (totalAcKw / transformerKva) * 100 : null;

  return {
    newAcKw,
    existingAcKw,
    totalAcKw,
    transformerKva,
    transformerLoadPercent,
    overThreshold:
      transformerLoadPercent !== null && transformerLoadPercent > TRANSFORMER_WARN_RATIO * 100,
  };
}
