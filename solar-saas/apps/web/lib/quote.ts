/**
 * Glue ระหว่างฟอร์มหน้าเว็บกับ @proinventive/solar-engine
 * ที่นี่มีแค่การประกอบ input/output — สูตรคำนวณทั้งหมดอยู่ในเอนจิน ห้ามคำนวณซ้ำในคอมโพเนนต์
 */
import {
  DEFAULT_PEA_RATES,
  DEFAULT_VAT_PERCENT,
  REGION_LABEL,
  analyzeFinance,
  combineAcCapacity,
  estimateFromBill,
  evaluateExistingPv,
  marketPriceRange,
  mergeRates,
  monthlyYield,
  savingFromUnitReduction,
  simulateDailyProfile,
  sizePvSystem,
  type BillEstimate,
  type CombinedAcResult,
  type DailyProfileResult,
  type ExistingPvInput,
  type ExistingPvResult,
  type FinanceResult,
  type MonthlyYieldResult,
  type PriceRange,
  type PvSizingResult,
  type SimpleUserType,
  type SolarRegion,
} from '@proinventive/solar-engine';
import { CALC_DEFAULTS } from './calc-defaults';
import { onlyChanged, resolveAdvanced, sanitizeAdvanced, type AdvancedOverrides } from './advanced';
import { onlyChangedRates, toPeaOverride, type RateOverrideValues } from './rate-override';

export { CALC_DEFAULTS };

/** รุ่นแผงที่มีขายจริงในตลาด — ค่าเริ่มต้น 670W ตามที่ผู้ผลิตส่งมอบทั่วไปตอนนี้ */
export const PANEL_OPTIONS = [
  { watt: 620, label: '620 W (รุ่นเดิม)' },
  { watt: 670, label: '670 W (มาตรฐานปัจจุบัน)' },
  { watt: 700, label: '700 W' },
  { watt: 725, label: '725 W (รุ่นใหญ่สุด)' },
];

export const REGION_OPTIONS: { value: SolarRegion; label: string }[] = (
  ['central', 'north', 'northeast', 'south'] as SolarRegion[]
).map((value) => ({ value, label: REGION_LABEL[value] }));

export const USER_TYPE_OPTIONS: { value: SimpleUserType; label: string }[] = [
  { value: 'home', label: 'บ้านอยู่อาศัย (ประเภท 1)' },
  { value: 'small', label: 'กิจการขนาดเล็ก (ประเภท 2)' },
  { value: 'medium', label: 'กิจการขนาดกลาง (ประเภท 3)' },
];

/** ยอดบิลต่ำสุดที่ยังให้ผลลัพธ์มีความหมาย */
export const MIN_BILL = 300;

export interface QuoteInput {
  /** ค่าไฟเฉลี่ยต่อเดือน (บาท รวม VAT) */
  monthlyBill: number;
  userType: SimpleUserType;
  /** สัดส่วนใช้ไฟกลางวัน 0–1 */
  daylightRatio: number;
  hasBattery: boolean;
  /** ภาคที่ติดตั้ง — กำหนดรูปทรงฤดูกาลของกราฟผลผลิตรายเดือน */
  region: SolarRegion;
  /** ขนาดแผงต่อแผ่น (วัตต์) */
  panelWatt: number;
  /**
   * ระบบออนกริดเดิมที่จะต่อร่วมแบบ AC Coupling — ไม่ใส่ = ไม่มีระบบเดิม
   *
   * ⚠️ ไม่หักผลผลิตของระบบเดิมออกจากโหลดก่อนคิดขนาดระบบใหม่
   *    เพราะบิลที่ผู้ใช้กรอกคือบิล "ปัจจุบัน" ซึ่งระบบเดิมหักให้ไปแล้วในตัว
   *    หักซ้ำอีกรอบจะได้ระบบใหม่เล็กเกินจริงจนไม่พอใช้
   */
  existing?: ExistingPvInput;
  /** ยอมให้แบตจ่ายไฟช่วงดึก–เช้า (ไม่ระบุ = จ่ายได้) */
  allowDischargeBeforePsh?: boolean;
  /** ยอมให้แบตจ่ายไฟช่วงเย็น–ค่ำ (ไม่ระบุ = จ่ายได้) */
  allowDischargeAfterPsh?: boolean;
  /** สมมติฐานที่ผู้ใช้ปรับเองในโหมดละเอียด — ไม่ใส่ = ใช้ค่ามาตรฐานทั้งหมด */
  advanced?: AdvancedOverrides;
  /**
   * อัตราค่าไฟที่ช่างแก้เองรายโครงการ — ใช้เฉพาะฝั่งช่าง ฟอร์มสาธารณะห้ามส่งมา
   * ไม่ใส่ = ใช้อัตรามาตรฐานของ กฟภ. ที่เอนจินถืออยู่
   */
  rateOverride?: RateOverrideValues;
}

export interface Quote {
  input: QuoteInput;
  estimate: BillEstimate;
  sizing: PvSizingResult;
  finance: FinanceResult;
  /** โปรไฟล์ 24 ชม. สำหรับกราฟกำลังผลิตและการทำงานของแบตเตอรี่ */
  daily: DailyProfileResult;
  /** ผลผลิตรายเดือนปีแรก สำหรับกราฟ Yields */
  monthly: MonthlyYieldResult;
  /** ช่วงราคาตลาดที่แสดงแทนตัวเลขเป๊ะตัวเดียว */
  priceRange: PriceRange;
  /** ผลประเมินระบบออนกริดเดิม — null = ไม่มีระบบเดิม */
  existingPv: ExistingPvResult | null;
  /** กำลัง AC รวมสายเมื่อรวมระบบใหม่กับระบบเดิม — null = ไม่มีระบบเดิม */
  combinedAc: CombinedAcResult | null;
  /** กำลังผลิตรายชั่วโมงของระบบเดิม 25 จุด (0–24 ชม.) สำหรับซ้อนบนกราฟรายวัน */
  existingSolarKw: number[] | null;
  /** ผลผลิตรวมทั้งปีของทั้งสองระบบ (kWh) */
  totalAnnualKwh: number;
  /** จำนวนก้อนแบตเตอรี่ที่แนะนำ (0 = ระบบ On-grid) */
  batteryUnits: number;
  firstYearSaving: number;
  totalSaving: number;
  /** อัตราส่วนเพิ่มของขั้นบนสุด (บาท/หน่วย) — ราคาของหน่วยแรก ๆ ที่ลดได้ */
  tariff: number;
  /** อัตราประหยัดเฉลี่ยจริงปีแรก (บาท/หน่วย) — ต่ำกว่า tariff เพราะไหลลงขั้นที่ถูกกว่า */
  effectiveSavingTariff: number;
  /** สมมติฐานที่ถูกปรับจากค่ามาตรฐาน — ว่าง = ใช้ค่ามาตรฐานล้วน */
  changedAssumptions: AdvancedOverrides;
  /** อัตราค่าไฟที่ถูกแก้จากประกาศมาตรฐาน — ว่าง = ใช้อัตรามาตรฐาน */
  changedRates: RateOverrideValues;
  /**
   * ค่าที่ใช้คำนวณจริงหลังรวม override แล้ว
   * ทุกหน้าต้องอ่านจากตรงนี้ ห้ามอ่าน CALC_DEFAULTS ตรง ๆ ไม่งั้นรายงานที่ปรับสมมติฐาน
   * จะโชว์ตัวเลขคนละชุดกับที่ใช้คำนวณ
   */
  assumptions: ReturnType<typeof resolveAdvanced>;
}

/** จำนวนก้อนแบตที่พอดีกับโหลดกลางคืน — ใช้เมื่อผู้ใช้ไม่ได้ระบุจำนวนเอง */
function suggestBatteryUnits(
  monthlyUnits: number,
  daylightRatio: number,
  unitSizeKwh: number,
): number {
  const nightUnitsPerDay = (monthlyUnits * (1 - daylightRatio)) / 30;
  return Math.max(1, Math.round(nightUnitsPerDay / (unitSizeKwh * CALC_DEFAULTS.battery.usableRatio)));
}

export function computeQuote(input: QuoteInput): Quote {
  const adv = resolveAdvanced(input.advanced);

  // อัตราที่ใช้จริงทั้งการคำนวณนี้ — mergeRates ทิ้งคีย์ที่ไม่รู้จักและไม่แตะต้นฉบับ
  const peaOverride = toPeaOverride(input.rateOverride ?? {});
  const rates = peaOverride ? mergeRates(DEFAULT_PEA_RATES, peaOverride) : DEFAULT_PEA_RATES;

  const estimate = estimateFromBill(
    {
      monthlyBill: input.monthlyBill,
      userType: input.userType,
      ft: adv.ft,
      vatPercent: DEFAULT_VAT_PERCENT,
      loadFactor: adv.loadFactor,
    },
    rates,
  );

  const batteryUnits = input.hasBattery
    ? adv.battery.units > 0
      ? adv.battery.units
      : suggestBatteryUnits(estimate.monthlyUnits, input.daylightRatio, adv.battery.unitSizeKwh)
    : 0;

  const sizing = sizePvSystem({
    monthlyUnits: estimate.monthlyUnits,
    daylightRatio: input.daylightRatio,
    psh: adv.psh,
    pr: adv.pr,
    panelWatt: input.panelWatt,
    inverterSizeKw: adv.inverterSizeKw,
    costPerWatt: { ...adv.costPerWatt },
    margin: adv.margin,
    battery: input.hasBattery
      ? {
          unitSizeKwh: adv.battery.unitSizeKwh,
          units: batteryUnits,
          costPerKwh: adv.battery.costPerKwh,
        }
      : undefined,
  });

  // ตีมูลค่าเงินประหยัดจากส่วนต่างบิลจริง ไม่ใช่คูณอัตราส่วนเพิ่มตรง ๆ
  // (คูณตรง ๆ จะได้เงินประหยัดเกินค่าไฟทั้งบิลเมื่อระบบใหญ่พอจะลดหน่วยได้เกือบหมด)
  const billOptions = {
    userType: input.userType,
    ft: adv.ft,
    vatPercent: DEFAULT_VAT_PERCENT,
    demandKw: estimate.demandKw,
  };
  const valueOfSavedUnits = (unitsPerYear: number): number =>
    savingFromUnitReduction(
      estimate.monthlyUnits,
      unitsPerYear / 12,
      billOptions,
      rates,
    ) * 12;

  const finance = analyzeFinance({
    sizing,
    tariff: estimate.marginalTariff,
    valueOfSavedUnits,
    wacc: adv.wacc,
    degradation: adv.degradation,
    omCostPerWatt: adv.omCostPerWatt,
    years: adv.years,
    hasBattery: input.hasBattery,
  });

  const daily = simulateDailyProfile({
    avgDailyProductionKwh: sizing.avgDailyProductionYear1,
    dayUnitsPerDay: sizing.dayUnitsPerDay,
    nightUnitsPerDay: sizing.nightUnitsPerDay,
    batteryCapacityKwh: sizing.batteryCapacityKwh,
    allowDischargeBeforePsh: input.allowDischargeBeforePsh ?? true,
    allowDischargeAfterPsh: input.allowDischargeAfterPsh ?? true,
  });

  const monthly = monthlyYield({
    avgDailyProductionKwh: sizing.avgDailyProductionYear1,
    installedKwp: sizing.actualKwp,
    region: input.region,
  });

  // ── ระบบออนกริดเดิม (AC Coupling) ────────────────────────────────────────
  const existingPv = input.existing
    ? evaluateExistingPv(input.existing, { psh: adv.psh, pr: adv.pr, region: input.region })
    : null;

  // กำลัง AC ที่ไหลเข้าสายจริงคือฝั่งอินเวอร์เตอร์ ไม่ใช่ kWp ของแผง
  // ตัวเลขนี้คือสิ่งที่การไฟฟ้าดูตอนขอขนานไฟ จึงต้องคิดจากจำนวนอินเวอร์เตอร์ที่ใช้จริง
  const newAcKw = sizing.invertersNeeded * adv.inverterSizeKw;
  const combinedAc = existingPv
    ? combineAcCapacity({
        newAcKw,
        existingAcKw: existingPv.acKw,
        transformerKva: input.existing?.transformerKva,
      })
    : null;

  // เส้นกำลังผลิตของระบบเดิมสำหรับซ้อนบนกราฟ 24 ชม.
  // มีข้อมูลรายชั่วโมงจริงก็ใช้ของจริง ไม่มีก็ใช้โมเดลครึ่งไซน์ตัวเดียวกับระบบใหม่
  // จะได้ไม่มีสองมาตรฐานอยู่ในกราฟเดียวกัน
  const existingSolarKw = existingPv
    ? existingPv.hourlyKwh
      ? [...existingPv.hourlyKwh, existingPv.hourlyKwh[0] ?? 0]
      : simulateDailyProfile({
          avgDailyProductionKwh: existingPv.avgDailyKwh,
          dayUnitsPerDay: 0,
          nightUnitsPerDay: 0,
          batteryCapacityKwh: 0,
          allowDischargeBeforePsh: false,
          allowDischargeAfterPsh: false,
        }).points.map((pt) => pt.solarKw)
    : null;

  return {
    input,
    estimate,
    sizing,
    finance,
    daily,
    monthly,
    priceRange: marketPriceRange(sizing.sellingPriceVat),
    existingPv,
    combinedAc,
    existingSolarKw,
    totalAnnualKwh: monthly.totalKwh + (existingPv?.annualKwh ?? 0),
    batteryUnits,
    firstYearSaving: finance.rows[0]?.annualSaving ?? 0,
    totalSaving: finance.rows.reduce((sum, r) => sum + r.annualSaving, 0),
    tariff: estimate.marginalTariff,
    effectiveSavingTariff:
      finance.rows[0] && finance.rows[0].annualUnitsSaved > 0
        ? finance.rows[0].annualSaving / finance.rows[0].annualUnitsSaved
        : 0,
    changedAssumptions: onlyChanged(sanitizeAdvanced(input.advanced ?? {})),
    changedRates: onlyChangedRates(input.rateOverride ?? {}),
    assumptions: adv,
  };
}

/** segment สำหรับตาราง leads — บ้าน / SME / C&I */
export function leadSegment(quote: Quote): 'residential' | 'sme' | 'ci' {
  if (quote.input.userType === 'home') return 'residential';
  return quote.sizing.actualKwp >= 30 ? 'ci' : 'sme';
}
