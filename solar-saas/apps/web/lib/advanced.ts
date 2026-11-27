/**
 * โหมดละเอียด — ให้ผู้ใช้ปรับสมมติฐานเองทีละตัว
 *
 * นิยามช่องกรอกไว้ที่เดียวแล้วใช้ทั้งสามที่: หน้าเว็บวาดฟอร์มจากนี่, ลิงก์รายงานอ่าน/เขียนจากนี่,
 * และ API เก็บ lead ตรวจค่าจากนี่ — เพิ่มช่องใหม่แก้ไฟล์เดียวได้ครบทุกด้าน
 *
 * ทุกค่าถูกบีบให้อยู่ในช่วงที่สมเหตุสมผลเสมอ ไม่ว่าจะมาจากฟอร์มหรือจาก payload ที่ปลอมมา
 * ผู้ใช้จึงสร้างรายงานที่อ้าง PSH 50 ชม./วัน หรือต้นทุน 0 บาท/วัตต์ ไม่ได้
 */
import { CALC_DEFAULTS } from './calc-defaults';

export type AdvancedKey =
  | 'ft'
  | 'loadFactor'
  | 'psh'
  | 'pr'
  | 'inverterSizeKw'
  | 'costPanel'
  | 'costInverter'
  | 'costBos'
  | 'costLabor'
  | 'costManage'
  | 'margin'
  | 'batteryUnitSizeKwh'
  | 'batteryUnits'
  | 'batteryCostPerKwh'
  | 'wacc'
  | 'degradation'
  | 'omCostPerWatt'
  | 'years';

export type AdvancedOverrides = Partial<Record<AdvancedKey, number>>;

export interface AdvancedField {
  key: AdvancedKey;
  label: string;
  hint?: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  /** ค่ามาตรฐานที่ใช้เมื่อผู้ใช้ไม่ได้แก้ */
  fallback: number;
}

export interface AdvancedGroup {
  id: string;
  title: string;
  note?: string;
  fields: AdvancedField[];
}

const C = CALC_DEFAULTS;

export const ADVANCED_GROUPS: AdvancedGroup[] = [
  {
    id: 'tariff',
    title: 'อัตราค่าไฟ',
    note: 'ค่า Ft ประกาศใหม่ทุก 4 เดือน · Load Factor ใช้เฉพาะกิจการขนาดกลางที่คิดค่า Demand',
    fields: [
      { key: 'ft', label: 'ค่า Ft', unit: 'บาท/หน่วย', min: -1, max: 2, step: 0.0001, decimals: 4, fallback: C.ft },
      { key: 'loadFactor', label: 'Load Factor', hint: 'ใช้ประมาณ Demand จากหน่วยใช้ไฟ', unit: '', min: 0.1, max: 1, step: 0.05, decimals: 2, fallback: C.loadFactor },
    ],
  },
  {
    id: 'technical',
    title: 'สมมติฐานทางเทคนิค',
    note: 'PSH คือชั่วโมงแดดเต็มกำลังต่อวัน · PR คือประสิทธิภาพรวมของระบบหลังหักการสูญเสีย',
    fields: [
      { key: 'psh', label: 'Peak Sun Hours', unit: 'ชม./วัน', min: 3, max: 6.5, step: 0.1, decimals: 1, fallback: C.psh },
      { key: 'pr', label: 'Performance Ratio', unit: '', min: 0.5, max: 0.95, step: 0.01, decimals: 2, fallback: C.pr },
      { key: 'inverterSizeKw', label: 'ขนาดอินเวอร์เตอร์ต่อตัว', unit: 'kW', min: 1, max: 250, step: 1, decimals: 0, fallback: C.inverterSizeKw },
    ],
  },
  {
    id: 'cost',
    title: 'ต้นทุนและกำไร',
    note: 'ต้นทุนคิดเป็นบาทต่อวัตต์ · กำไรคิดจากต้นทุนก่อน VAT แล้วบวก VAT ชั้นเดียว',
    fields: [
      { key: 'costPanel', label: 'แผงโซลาร์', unit: 'บาท/วัตต์', min: 0, max: 50, step: 0.1, decimals: 2, fallback: C.costPerWatt.panel },
      { key: 'costInverter', label: 'อินเวอร์เตอร์', unit: 'บาท/วัตต์', min: 0, max: 50, step: 0.1, decimals: 2, fallback: C.costPerWatt.inverter },
      { key: 'costBos', label: 'อุปกรณ์ประกอบ (BOS)', unit: 'บาท/วัตต์', min: 0, max: 50, step: 0.1, decimals: 2, fallback: C.costPerWatt.bos },
      { key: 'costLabor', label: 'ค่าแรงติดตั้ง', unit: 'บาท/วัตต์', min: 0, max: 50, step: 0.1, decimals: 2, fallback: C.costPerWatt.labor },
      { key: 'costManage', label: 'ค่าบริหารโครงการ', unit: 'บาท/วัตต์', min: 0, max: 50, step: 0.1, decimals: 2, fallback: C.costPerWatt.manage },
      { key: 'margin', label: 'กำไรส่วนเพิ่ม', unit: '%', min: 0, max: 100, step: 1, decimals: 0, fallback: C.margin * 100 },
    ],
  },
  {
    id: 'battery',
    title: 'แบตเตอรี่',
    note: 'ใช้เมื่อเปิดระบบ Hybrid · จำนวนก้อน 0 = ให้ระบบคำนวณให้พอดีกับโหลดกลางคืน',
    fields: [
      { key: 'batteryUnitSizeKwh', label: 'ความจุต่อก้อน', unit: 'kWh', min: 1, max: 200, step: 1, decimals: 0, fallback: C.battery.unitSizeKwh },
      { key: 'batteryUnits', label: 'จำนวนก้อน', hint: '0 = คำนวณอัตโนมัติ', unit: 'ก้อน', min: 0, max: 500, step: 1, decimals: 0, fallback: 0 },
      { key: 'batteryCostPerKwh', label: 'ราคาแบตเตอรี่', unit: 'บาท/kWh', min: 1000, max: 40000, step: 100, decimals: 0, fallback: C.battery.costPerKwh },
    ],
  },
  {
    id: 'finance',
    title: 'การเงิน',
    note: 'WACC คืออัตราคิดลดกระแสเงินสด · อัตราเสื่อมคือกำลังผลิตที่ลดลงต่อปี',
    fields: [
      { key: 'wacc', label: 'อัตราคิดลด (WACC)', unit: '%', min: 0, max: 30, step: 0.5, decimals: 1, fallback: C.wacc * 100 },
      { key: 'degradation', label: 'อัตราเสื่อมของแผง', unit: '%/ปี', min: 0, max: 5, step: 0.1, decimals: 1, fallback: C.degradation * 100 },
      { key: 'omCostPerWatt', label: 'ค่าดูแลรักษา (O&M)', unit: 'บาท/วัตต์/ปี', min: 0, max: 10, step: 0.1, decimals: 2, fallback: C.omCostPerWatt },
      { key: 'years', label: 'อายุการวิเคราะห์', unit: 'ปี', min: 5, max: 30, step: 1, decimals: 0, fallback: C.years },
    ],
  },
];

export const ADVANCED_FIELDS: AdvancedField[] = ADVANCED_GROUPS.flatMap((g) => g.fields);

const FIELD_BY_KEY = new Map(ADVANCED_FIELDS.map((f) => [f.key, f]));

/** ค่ามาตรฐานทุกช่อง — ใช้เติมฟอร์มตอนกางโหมดละเอียดครั้งแรก */
export function advancedDefaults(): Record<AdvancedKey, number> {
  const out = {} as Record<AdvancedKey, number>;
  for (const f of ADVANCED_FIELDS) out[f.key] = f.fallback;
  return out;
}

/** บีบค่าให้อยู่ในช่วงที่กำหนด — ค่าที่ไม่ใช่ตัวเลขหรือคีย์ที่ไม่รู้จักจะถูกทิ้ง */
export function sanitizeAdvanced(raw: unknown): AdvancedOverrides {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: AdvancedOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = FIELD_BY_KEY.get(key as AdvancedKey);
    if (!field) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    out[field.key] = Math.min(field.max, Math.max(field.min, n));
  }
  return out;
}

/** เหลือเฉพาะช่องที่ต่างจากค่ามาตรฐานจริง ๆ — ลิงก์และ snapshot จะได้ไม่รกด้วยค่าซ้ำ */
export function onlyChanged(values: AdvancedOverrides): AdvancedOverrides {
  const out: AdvancedOverrides = {};
  for (const f of ADVANCED_FIELDS) {
    const v = values[f.key];
    if (v !== undefined && Math.abs(v - f.fallback) > 1e-9) out[f.key] = v;
  }
  return out;
}

export function fieldLabel(key: AdvancedKey): string {
  return FIELD_BY_KEY.get(key)?.label ?? key;
}

export function fieldUnit(key: AdvancedKey): string {
  return FIELD_BY_KEY.get(key)?.unit ?? '';
}

export function fieldDecimals(key: AdvancedKey): number {
  return FIELD_BY_KEY.get(key)?.decimals ?? 2;
}

/** แปลง overrides เป็นค่าที่เอนจินใช้ได้จริง (เปอร์เซ็นต์ถูกแปลงเป็นสัดส่วนแล้ว) */
export function resolveAdvanced(overrides: AdvancedOverrides = {}) {
  const v = { ...advancedDefaults(), ...sanitizeAdvanced(overrides) };
  return {
    ft: v.ft,
    loadFactor: v.loadFactor,
    psh: v.psh,
    pr: v.pr,
    inverterSizeKw: v.inverterSizeKw,
    costPerWatt: {
      panel: v.costPanel,
      inverter: v.costInverter,
      bos: v.costBos,
      labor: v.costLabor,
      manage: v.costManage,
    },
    margin: v.margin / 100,
    battery: {
      unitSizeKwh: v.batteryUnitSizeKwh,
      /** 0 = ให้ระบบคำนวณจำนวนก้อนให้พอดีกับโหลดกลางคืน */
      units: Math.round(v.batteryUnits),
      costPerKwh: v.batteryCostPerKwh,
    },
    wacc: v.wacc / 100,
    degradation: v.degradation / 100,
    omCostPerWatt: v.omCostPerWatt,
    years: Math.round(v.years),
  };
}
