/**
 * แก้อัตราค่าไฟ กฟภ. รายโครงการ
 *
 * ทำไมต้องมี: ประกาศอัตราใหม่ออกมาก่อนที่เราจะอัปเดตค่ากลางเสมอ ช่างที่กำลังเสนอราคา
 * ต้องใช้อัตราที่บังคับใช้จริงวันนั้น ไม่ใช่รอเรา deploy — ตรงกับหลักที่ล็อกไว้ตั้งแต่เฟส 0
 * ว่า "อัตราค่าไฟแก้ที่ pea-rates.ts ที่เดียว override รายผู้ใช้ผ่าน mergeRates()"
 *
 * เปิดให้แก้เฉพาะอัตราของประเภทผู้ใช้ไฟที่โครงการนั้นเลือก — ประเภทอื่นไม่เกี่ยวและ
 * การโชว์ทั้ง 8 ประเภทจะกลายเป็นฟอร์มร้อยช่อง
 *
 * ⚠ ใช้เฉพาะฝั่งช่าง (โปรเจกต์) เท่านั้น ฟอร์มสาธารณะห้ามแก้อัตรา — ไม่งั้นใครก็สร้าง
 * รายงานที่อ้างอัตราค่าไฟมั่ว ๆ ไปหลอกคนอื่นได้
 */
import { DEFAULT_PEA_RATES, type SimpleUserType } from '@proinventive/solar-engine';

/** ค่าที่แก้ได้ เก็บเป็น map แบน ๆ เพื่อให้ส่งผ่าน jsonb และฟอร์มได้ง่าย */
export type RateOverrideValues = Record<string, number>;

export interface RateField {
  key: string;
  label: string;
  unit: string;
  fallback: number;
  /** ช่วงที่ยอมรับ กันค่าพิมพ์ผิดจนรายงานเพี้ยน */
  min: number;
  max: number;
  step: number;
  decimals: number;
}

const R = DEFAULT_PEA_RATES;

const money = { min: 0, max: 100, step: 0.0001, decimals: 4 } as const;
const service = { min: 0, max: 5000, step: 0.01, decimals: 2 } as const;

/** ชื่อขั้นบันไดให้อ่านรู้เรื่องว่าเป็นช่วงหน่วยไหน */
function tierLabels(tiers: readonly (readonly [number | null, number])[]): string[] {
  const labels: string[] = [];
  let from = 1;
  for (const [span] of tiers) {
    if (span == null) labels.push(`หน่วยที่ ${from} ขึ้นไป`);
    else {
      labels.push(`หน่วยที่ ${from}–${from + span - 1}`);
      from += span;
    }
  }
  return labels;
}

function tierFields(prefix: string, tiers: readonly (readonly [number | null, number])[]): RateField[] {
  const labels = tierLabels(tiers);
  return tiers.map((t, i) => ({
    key: `${prefix}.${i}`,
    label: labels[i],
    unit: 'บาท/หน่วย',
    fallback: t[1],
    ...money,
  }));
}

export interface RateGroup {
  id: string;
  title: string;
  note?: string;
  fields: RateField[];
}

/** กลุ่มอัตราที่แก้ได้ ขึ้นกับประเภทผู้ใช้ไฟของโครงการ */
export function rateGroupsFor(userType: SimpleUserType): RateGroup[] {
  if (userType === 'medium') {
    return [
      {
        id: 't3',
        title: 'ประเภท 3.1 กิจการขนาดกลาง (แรงดันต่ำกว่า 22 kV)',
        note: 'โซลาร์ลดเฉพาะค่าพลังงาน ไม่ลดค่าความต้องการพลังไฟฟ้าและค่าบริการ',
        fields: [
          { key: 't3.d', label: 'ค่าความต้องการพลังไฟฟ้า', unit: 'บาท/kW', fallback: R.t3.normal.low.d, min: 0, max: 2000, step: 0.01, decimals: 2 },
          { key: 't3.e', label: 'ค่าพลังงาน', unit: 'บาท/หน่วย', fallback: R.t3.normal.low.e, ...money },
          { key: 't3.s', label: 'ค่าบริการรายเดือน', unit: 'บาท', fallback: R.t3.normal.low.s, ...service },
        ],
      },
    ];
  }

  if (userType === 'small') {
    return [
      {
        id: 't2',
        title: 'ประเภท 2.1 กิจการขนาดเล็ก (แรงดันต่ำ)',
        fields: [
          ...tierFields('t2.tiers', R.t2.normal.low!.tiers!),
          { key: 't2.s', label: 'ค่าบริการรายเดือน', unit: 'บาท', fallback: R.t2.normal.low!.s, ...service },
        ],
      },
    ];
  }

  return [
    {
      id: 't1u',
      title: 'ประเภท 1.1 บ้านอยู่อาศัย — ใช้ไม่เกิน 150 หน่วย/เดือน',
      fields: [
        ...tierFields('t1u.tiers', R.t1.normal.under150.tiers),
        { key: 't1u.s', label: 'ค่าบริการรายเดือน', unit: 'บาท', fallback: R.t1.normal.under150.s, ...service },
      ],
    },
    {
      id: 't1o',
      title: 'ประเภท 1.1 บ้านอยู่อาศัย — ใช้เกิน 150 หน่วย/เดือน',
      note: 'ระบบเลือกชุดอัตราให้เองตามหน่วยที่ประมาณได้จากบิล',
      fields: [
        ...tierFields('t1o.tiers', R.t1.normal.over150.tiers),
        { key: 't1o.s', label: 'ค่าบริการรายเดือน', unit: 'บาท', fallback: R.t1.normal.over150.s, ...service },
      ],
    },
  ];
}

function allFields(): Map<string, RateField> {
  const map = new Map<string, RateField>();
  for (const t of ['home', 'small', 'medium'] as SimpleUserType[]) {
    for (const g of rateGroupsFor(t)) for (const f of g.fields) map.set(f.key, f);
  }
  return map;
}

const FIELDS = allFields();

/**
 * บีบค่าให้อยู่ในช่วง และทิ้งคีย์ที่ไม่รู้จัก — ใช้ทั้งฝั่ง client และ server
 * ส่ง userType มาด้วยจะเก็บเฉพาะอัตราของประเภทนั้น ไม่งั้นรายงานบ้านอยู่อาศัยจะขึ้นว่า
 * แก้อัตราประเภท 3 ซึ่งการคำนวณไม่ได้ใช้เลย
 */
export function sanitizeRateOverride(raw: unknown, userType?: SimpleUserType): RateOverrideValues {
  if (typeof raw !== 'object' || raw === null) return {};
  const allowed = userType
    ? new Set(rateGroupsFor(userType).flatMap((g) => g.fields.map((f) => f.key)))
    : null;
  const out: RateOverrideValues = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = FIELDS.get(key);
    if (!field) continue;
    if (allowed && !allowed.has(key)) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.min(field.max, Math.max(field.min, n));
  }
  return out;
}

/** เหลือเฉพาะค่าที่ต่างจากอัตรามาตรฐานจริง ๆ */
export function onlyChangedRates(values: RateOverrideValues): RateOverrideValues {
  const out: RateOverrideValues = {};
  for (const [key, value] of Object.entries(sanitizeRateOverride(values))) {
    const field = FIELDS.get(key);
    if (field && Math.abs(value - field.fallback) > 1e-9) out[key] = value;
  }
  return out;
}

export function rateFieldLabel(key: string): string {
  return FIELDS.get(key)?.label ?? key;
}

export function rateFieldUnit(key: string): string {
  return FIELDS.get(key)?.unit ?? '';
}

/** ประกอบขั้นบันไดใหม่ — เก็บช่วงหน่วยเดิมไว้ เปลี่ยนเฉพาะอัตรา */
function buildTiers(
  base: readonly (readonly [number | null, number])[],
  prefix: string,
  values: RateOverrideValues,
): [number | null, number][] | undefined {
  const touched = base.some((_, i) => values[`${prefix}.${i}`] !== undefined);
  if (!touched) return undefined;
  return base.map((t, i) => [t[0], values[`${prefix}.${i}`] ?? t[1]] as [number | null, number]);
}

/**
 * แปลงค่าที่ผู้ใช้กรอกเป็นรูปแบบ override ที่ mergeRates() รับได้
 * คืน undefined ถ้าไม่มีอะไรถูกแก้ เพื่อให้ผู้เรียกใช้อัตรามาตรฐานตรง ๆ
 */
export function toPeaOverride(raw: RateOverrideValues): Record<string, unknown> | undefined {
  const v = onlyChangedRates(raw);
  if (Object.keys(v).length === 0) return undefined;

  const t1Under = buildTiers(R.t1.normal.under150.tiers, 't1u.tiers', v);
  const t1Over = buildTiers(R.t1.normal.over150.tiers, 't1o.tiers', v);
  const t2Tiers = buildTiers(R.t2.normal.low!.tiers!, 't2.tiers', v);

  const t1: Record<string, unknown> = {};
  if (t1Under || v['t1u.s'] !== undefined) {
    t1.under150 = { ...(t1Under ? { tiers: t1Under } : {}), ...(v['t1u.s'] !== undefined ? { s: v['t1u.s'] } : {}) };
  }
  if (t1Over || v['t1o.s'] !== undefined) {
    t1.over150 = { ...(t1Over ? { tiers: t1Over } : {}), ...(v['t1o.s'] !== undefined ? { s: v['t1o.s'] } : {}) };
  }

  const out: Record<string, unknown> = {};
  if (Object.keys(t1).length > 0) out.t1 = { normal: t1 };
  if (t2Tiers || v['t2.s'] !== undefined) {
    out.t2 = {
      normal: {
        low: { ...(t2Tiers ? { tiers: t2Tiers } : {}), ...(v['t2.s'] !== undefined ? { s: v['t2.s'] } : {}) },
      },
    };
  }
  const t3: Record<string, number> = {};
  if (v['t3.d'] !== undefined) t3.d = v['t3.d'];
  if (v['t3.e'] !== undefined) t3.e = v['t3.e'];
  if (v['t3.s'] !== undefined) t3.s = v['t3.s'];
  if (Object.keys(t3).length > 0) out.t3 = { normal: { low: t3 } };

  return out;
}
