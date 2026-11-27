/**
 * แปลงข้อมูลระบบออนกริดเดิมเป็นพารามิเตอร์ในลิงก์รายงาน และแปลงกลับ
 *
 * บีบเป็นสตริงคั่นจุลภาคแทนที่จะแยกเป็นสิบพารามิเตอร์ เพราะลิงก์นี้ถูกส่งทาง LINE
 * ซึ่งตัดลิงก์ยาวแล้วผู้ใช้เปิดไม่ได้ · ลำดับฟิลด์ห้ามสลับ ไม่งั้นลิงก์เก่าจะอ่านผิดตำแหน่ง
 */
import type { ExistingPvInput, ExistingYieldBasis } from '@proinventive/solar-engine';

const BASES: ExistingYieldBasis[] = ['estimate', 'monthly', 'hourly'];

const n = (v: number | undefined): string => (v === undefined || v === null ? '' : String(v));
const toNum = (v: string): number | undefined => {
  if (v === '') return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
};

/** ลำดับฟิลด์ของสตริง ex — เพิ่มได้ที่ท้ายเท่านั้น */
export function encodeExisting(e: ExistingPvInput): string {
  return [
    n(e.acKw),
    n(e.panelWatt),
    n(e.panelCount),
    n(e.installYear),
    n(e.degradationPercent),
    n(e.specificYield),
    n(e.transformerKva),
    e.hasAntiBackflow ? '1' : '0',
    e.basis,
  ].join(',');
}

export function decodeExisting(raw: string): ExistingPvInput | undefined {
  if (!raw) return undefined;
  const p = raw.split(',');
  const acKw = toNum(p[0] ?? '');
  if (acKw === undefined || acKw <= 0) return undefined;
  const basis = (BASES as string[]).includes(p[8] ?? '')
    ? (p[8] as ExistingYieldBasis)
    : 'estimate';
  return {
    acKw,
    panelWatt: toNum(p[1] ?? ''),
    panelCount: toNum(p[2] ?? ''),
    installYear: toNum(p[3] ?? ''),
    degradationPercent: toNum(p[4] ?? ''),
    specificYield: toNum(p[5] ?? ''),
    transformerKva: toNum(p[6] ?? ''),
    hasAntiBackflow: p[7] === '1',
    basis,
  };
}

/** ชุดตัวเลขรายเดือน/รายชั่วโมง — เก็บแยกเพราะยาวและมีเฉพาะบางกรณี */
export function encodeSeries(values: number[] | undefined): string {
  if (!values?.some((v) => v > 0)) return '';
  return values.map((v) => (v ? String(Math.round(v * 100) / 100) : '0')).join(',');
}

export function decodeSeries(raw: string, length: number): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',');
  if (parts.length !== length) return undefined;
  const out = parts.map((v) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
  });
  return out.some((v) => v > 0) ? out : undefined;
}
