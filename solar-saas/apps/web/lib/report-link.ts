/**
 * แปลงอินพุตของหน้าคำนวณเป็น query string ของรายงาน และแปลงกลับ
 *
 * รายงานแบบพรีวิว (ยังไม่มี lead) คำนวณใหม่จากอินพุตในลิงก์ — ทำได้เพราะยังไม่มี snapshot
 * ส่วนรายงานของ lead ที่บันทึกแล้วต้องอ่านจาก calc_snapshot เท่านั้น ห้ามคำนวณใหม่
 * (อัตราค่าไฟเปลี่ยนภายหลังต้องไม่ทำให้ตัวเลขในรายงานที่ส่งไปแล้วเปลี่ยนตาม)
 */
import type { SimpleUserType, SolarRegion } from '@proinventive/solar-engine';
import { CALC_DEFAULTS, MIN_BILL, type QuoteInput } from './quote';
import { ADVANCED_FIELDS, onlyChanged, sanitizeAdvanced, type AdvancedOverrides } from './advanced';
import { decodeExisting, decodeSeries, encodeExisting, encodeSeries } from './existing-param';

const USER_TYPES: SimpleUserType[] = ['home', 'small', 'medium'];
const REGIONS: SolarRegion[] = ['central', 'north', 'northeast', 'south'];
const PANEL_WATTS = [620, 670, 700, 725];

export function reportHref(input: QuoteInput): string {
  const params = new URLSearchParams({
    bill: String(Math.round(input.monthlyBill)),
    type: input.userType,
    day: String(Math.round(input.daylightRatio * 100)),
    batt: input.hasBattery ? '1' : '0',
    region: input.region,
    panel: String(input.panelWatt),
  });
  // ส่งเฉพาะค่าที่ต่างจากมาตรฐาน ลิงก์จะได้ไม่ยาวเกินจำเป็น
  for (const [key, value] of Object.entries(onlyChanged(input.advanced ?? {}))) {
    params.set(key, String(value));
  }
  if (input.existing && input.existing.acKw > 0) {
    params.set('ex', encodeExisting(input.existing));
    const m = encodeSeries(input.existing.monthlyKwh);
    if (m) params.set('exm', m);
    const h = encodeSeries(input.existing.hourlyKwh);
    if (h) params.set('exh', h);
  }
  return `/report?${params}`;
}

type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/** อ่านพารามิเตอร์จากลิงก์ — ค่าที่ผิดหรือหายจะถูกแทนด้วยค่าเริ่มต้น ไม่โยน error */
export function parseReportParams(params: RawParams): QuoteInput {
  const bill = Number(one(params.bill));
  const userType = one(params.type) as SimpleUserType;
  const dayPercent = Number(one(params.day));
  const region = one(params.region) as SolarRegion;
  const panelWatt = Number(one(params.panel));

  const advanced: AdvancedOverrides = {};
  for (const f of ADVANCED_FIELDS) {
    const raw = one(params[f.key]);
    if (raw !== '') advanced[f.key] = Number(raw);
  }

  const existing = decodeExisting(one(params.ex));
  if (existing) {
    existing.monthlyKwh = decodeSeries(one(params.exm), 12);
    existing.hourlyKwh = decodeSeries(one(params.exh), 24);
  }

  return {
    ...(existing ? { existing } : {}),
    advanced: sanitizeAdvanced(advanced),
    monthlyBill: Number.isFinite(bill) && bill >= MIN_BILL ? bill : 4500,
    userType: USER_TYPES.includes(userType) ? userType : 'home',
    daylightRatio:
      Number.isFinite(dayPercent) && dayPercent >= 10 && dayPercent <= 90 ? dayPercent / 100 : 0.4,
    hasBattery: one(params.batt) === '1',
    region: REGIONS.includes(region) ? region : CALC_DEFAULTS.region,
    panelWatt: PANEL_WATTS.includes(panelWatt) ? panelWatt : CALC_DEFAULTS.panelWatt,
  };
}
