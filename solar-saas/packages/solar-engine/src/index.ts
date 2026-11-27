/**
 * @proinventive/solar-engine
 * เอนจินคำนวณกลาง: บิลค่าไฟ กฟภ. 8 ประเภท · ขนาดระบบ PV/BESS · การเงินโครงการ
 * ใช้ร่วมกันทั้งเว็บคำนวณฟรี, แอปช่าง (Pro) และ PDF service
 */
export * from './types.ts';
export { DEFAULT_PEA_RATES, VOLTAGE_LABEL, mergeRates } from './rates/pea-rates.ts';
export { applyTiers, calculateBill } from './billing/calc-bill.ts';
export {
  DEFAULT_FT,
  DEFAULT_VAT_PERCENT,
  estimateUnitsFromBill,
  estimateFromBill,
  monthlyBillAtUnits,
  savingFromUnitReduction,
} from './billing/estimate.ts';
export { sizePvSystem, marketPriceRange, DEFAULT_PRICE_SPREAD } from './pv/sizing.ts';
export { simulateDailyProfile, DEFAULT_DAY_WINDOW } from './pv/daily-profile.ts';
export {
  monthlyYield,
  MONTHLY_PSH_FACTOR,
  MONTH_LABEL_TH,
  REGION_LABEL,
} from './pv/monthly-yield.ts';
export {
  evaluateExistingPv,
  combineAcCapacity,
  expectedSpecificYield,
  toGregorianYear,
  TRANSFORMER_WARN_RATIO,
} from './pv/ac-coupling.ts';
export { computeIRR, analyzeFinance } from './finance/analysis.ts';
