import type { PeaRates } from '../types.ts';

/**
 * อัตราค่าไฟฟ้า กฟภ. (PEA) — extract ตรงจาก asc_e_analysis.html (DEFAULT_RATES)
 * ห้ามแก้ตัวเลขในไฟล์นี้โดยไม่อ้างอิงประกาศ กฟภ. ฉบับล่าสุด
 * การ override รายผู้ใช้ทำผ่าน mergeRates() ไม่ใช่แก้ค่า default
 */
export const DEFAULT_PEA_RATES: PeaRates = {
  // TOU กลาง — ใช้ร่วมกันโดยประเภท 3.2 / 4.2 / 5.1 / 6.2 / 7.2
  touShared: {
    low: { d: 210.0, p: 4.3297, op: 2.6369, s: 312.24 },
    med: { d: 132.93, p: 4.1839, op: 2.6037, s: 312.24 },
    high: { d: 74.14, p: 4.1025, op: 2.5849, s: 312.24 },
  },
  t1: {
    normal: {
      under150: {
        s: 8.19,
        tiers: [
          [15, 2.3488],
          [10, 2.9882],
          [10, 3.2405],
          [65, 3.6237],
          [50, 3.7171],
          [250, 4.2218],
          [null, 4.4217],
        ],
      },
      over150: {
        s: 24.62,
        tiers: [
          [150, 3.2484],
          [250, 4.2218],
          [null, 4.4217],
        ],
      },
    },
    // ประเภท 1.2 ไม่มีค่าความต้องการพลังไฟฟ้า (Demand)
    tou: {
      low: { p: 5.7982, op: 2.6369, s: 24.62 },
      med: { p: 4.1839, op: 2.6037, s: 312.24 },
    },
  },
  t2: {
    normal: {
      low: {
        s: 33.29,
        tiers: [
          [150, 3.2484],
          [250, 4.2218],
          [null, 4.4217],
        ],
      },
      med: { s: 312.24, flat: 3.9086 },
    },
    tou: {
      low: { p: 5.7982, op: 2.6369, s: 33.29 },
      med: { p: 4.1839, op: 2.6037, s: 312.24 },
    },
  },
  t3: {
    normal: {
      low: { d: 221.5, e: 3.1751, s: 312.24 },
      med: { d: 196.26, e: 3.1471, s: 312.24 },
      high: { d: 175.7, e: 3.1097, s: 312.24 },
    },
  },
  t4: {
    tod: {
      low: { dP: 332.71, dPart: 68.22, e: 3.1751, s: 312.24 },
      med: { dP: 285.05, dPart: 58.88, e: 3.1471, s: 312.24 },
      high: { dP: 224.3, dPart: 29.91, e: 3.1097, s: 312.24 },
    },
  },
  t5: {
    normal: {
      low: { d: 276.64, e: 3.1751, s: 312.24 },
      med: { d: 256.07, e: 3.1471, s: 312.24 },
      high: { d: 220.56, e: 3.1097, s: 312.24 },
    },
  },
  t6: {
    normal: {
      low: { s: 20.0, tiers: [[10, 2.8013], [null, 3.8919]] },
      med: { s: 312.24, flat: 3.5849 },
      high: { s: 312.24, flat: 3.4149 },
    },
  },
  t7: {
    normal: { s: 115.16, tiers: [[100, 2.0889], [null, 3.2405]] },
    touService: 204.07, // อัตรา Demand/พลังงานใช้ร่วมกับ touShared
  },
  t8: { flat: 6.8025, s: 0 },
  amr: { peak: 4.1839, offPeak: 2.6037, s: 312.24 },
  pv: {
    psh: 4.5,
    pr: 0.75,
    cRate: 0.5,
    inverterEff: 0.95,
    dayStart: 8,
    dayEnd: 16,
    eveStart: 17,
    eveEnd: 21,
  },
};

export const VOLTAGE_LABEL: Record<'low' | 'med' | 'high', string> = {
  low: 'ต่ำกว่า 22 kV',
  med: '22 - 33 kV',
  high: 'ตั้งแต่ 69 kV ขึ้นไป',
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * deep-merge ค่า override ของผู้ใช้ทับค่ามาตรฐาน (ทิ้งคีย์ที่ไม่รู้จัก)
 * พฤติกรรมเดียวกับ deepMerge เดิมใน asc_e_analysis.html แต่ไม่ mutate ต้นฉบับ
 */
export function mergeRates(base: PeaRates, override: unknown): PeaRates {
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  const walk = (b: Record<string, unknown>, o: Record<string, unknown>) => {
    for (const k of Object.keys(o)) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
      const bv = b[k];
      const ov = o[k];
      if (Array.isArray(bv) && Array.isArray(ov)) b[k] = structuredClone(ov);
      else if (isPlainObject(bv) && isPlainObject(ov)) walk(bv, ov);
      else if (typeof ov === typeof bv) b[k] = ov;
    }
  };
  if (isPlainObject(override)) walk(out, override);
  return out as unknown as PeaRates;
}
