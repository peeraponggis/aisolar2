/**
 * สมมติฐานมาตรฐานของหน้าคำนวณ — แยกไฟล์เพื่อให้ quote.ts และ advanced.ts
 * ใช้ร่วมกันได้โดยไม่ import วนกัน
 */
import { DEFAULT_FT, DEFAULT_PEA_RATES, type SolarRegion } from '@proinventive/solar-engine';

export const CALC_DEFAULTS = {
  ft: DEFAULT_FT,
  /** Load Factor สำหรับประมาณ Demand ของประเภท 3 */
  loadFactor: 0.4,
  psh: DEFAULT_PEA_RATES.pv.psh,
  pr: DEFAULT_PEA_RATES.pv.pr,
  panelWatt: 670,
  inverterSizeKw: 5,
  costPerWatt: { panel: 5, inverter: 3, bos: 8, labor: 5, manage: 2 },
  margin: 0.2,
  wacc: 0.05,
  degradation: 0.01,
  omCostPerWatt: 0.6,
  years: 15,
  battery: { unitSizeKwh: 5, costPerKwh: 8000, usableRatio: 0.9 },
  region: 'central' as SolarRegion,
} as const;
