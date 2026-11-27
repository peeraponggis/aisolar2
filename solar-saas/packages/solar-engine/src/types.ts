/**
 * @proinventive/solar-engine — shared types
 * แหล่งความจริงเดียว (single source of truth) ของโครงสร้างข้อมูลทั้งระบบ
 */

/** ระดับแรงดันตามประกาศ กฟภ. */
export type VoltageLevel = 'low' | 'med' | 'high';

/** ขั้นบันได: [จำนวนหน่วยในขั้น, อัตราบาท/หน่วย] — ขั้นสุดท้าย span = null (ส่วนเกินทั้งหมด) */
export type Tier = [span: number | null, rate: number];

export interface TouRate {
  /** ค่าความต้องการพลังไฟฟ้า บาท/kW (ช่วง Peak) */
  d: number;
  /** ค่าพลังงานช่วง Peak บาท/หน่วย */
  p: number;
  /** ค่าพลังงานช่วง Off-Peak บาท/หน่วย */
  op: number;
  /** ค่าบริการรายเดือน บาท */
  s: number;
}

export interface PeaRates {
  /** TOU กลาง — ใช้ร่วมกันโดยประเภท 3.2 / 4.2 / 5.1 / 6.2 / 7.2 */
  touShared: Record<VoltageLevel, TouRate>;
  t1: {
    normal: {
      under150: { s: number; tiers: Tier[] };
      over150: { s: number; tiers: Tier[] };
    };
    /** ประเภท 1.2 ไม่มี Demand — เฉพาะอัตราพลังงาน */
    tou: Partial<Record<VoltageLevel, { p: number; op: number; s: number }>>;
  };
  t2: {
    normal: Partial<Record<VoltageLevel, { s: number; tiers?: Tier[]; flat?: number }>>;
    tou: Partial<Record<VoltageLevel, { p: number; op: number; s: number }>>;
  };
  t3: { normal: Record<VoltageLevel, { d: number; e: number; s: number }> };
  t4: { tod: Record<VoltageLevel, { dP: number; dPart: number; e: number; s: number }> };
  t5: { normal: Record<VoltageLevel, { d: number; e: number; s: number }> };
  t6: { normal: Record<VoltageLevel, { s: number; tiers?: Tier[]; flat?: number }> };
  t7: { normal: { s: number; tiers: Tier[] }; touService: number };
  t8: { flat: number; s: number };
  amr: { peak: number; offPeak: number; s: number };
  pv: {
    psh: number;
    pr: number;
    cRate: number;
    inverterEff: number;
    dayStart: number;
    dayEnd: number;
    eveStart: number;
    eveEnd: number;
  };
}

/* ============ Billing input (discriminated union) ============ */

interface BillBase {
  /** ค่า Ft บาท/หน่วย */
  ft: number;
  /** VAT เป็นเปอร์เซ็นต์ เช่น 7 */
  vatPercent: number;
}

export type BillInput =
  | (BillBase & { type: 1; mode: 'normal'; units: number })
  | (BillBase & { type: 1; mode: 'tou'; voltage: VoltageLevel; peakUnits: number; offPeakUnits: number })
  | (BillBase & { type: 2; mode: 'normal'; voltage: VoltageLevel; units: number })
  | (BillBase & { type: 2; mode: 'tou'; voltage: VoltageLevel; peakUnits: number; offPeakUnits: number })
  | (BillBase & { type: 3 | 5; mode: 'normal'; voltage: VoltageLevel; demandKw: number; units: number })
  | (BillBase & {
      type: 3 | 5 | 6 | 7;
      mode: 'tou';
      voltage: VoltageLevel;
      demandKw: number;
      peakUnits: number;
      offPeakUnits: number;
    })
  | (BillBase & {
      type: 4;
      mode: 'tod';
      voltage: VoltageLevel;
      demandPeakKw: number;
      demandPartialKw: number;
      units: number;
    })
  | (BillBase & {
      type: 4;
      mode: 'tou';
      voltage: VoltageLevel;
      demandKw: number;
      peakUnits: number;
      offPeakUnits: number;
    })
  | (BillBase & { type: 6; mode: 'normal'; voltage: VoltageLevel; units: number })
  | (BillBase & { type: 7; mode: 'normal'; units: number })
  | (BillBase & { type: 8; units: number });

export interface BillResult {
  units: number;
  /** ค่าความต้องการพลังไฟฟ้า (บาท) — 0 ถ้าประเภทนั้นไม่คิด */
  demandCost: number;
  /** ค่าพลังงาน (บาท) */
  energyCost: number;
  /** ค่าบริการรายเดือน (บาท) */
  serviceFee: number;
  /** ค่า Ft รวม (บาท) */
  ftTotal: number;
  totalBeforeVat: number;
  vatAmount: number;
  grandTotal: number;
  /** คำอธิบายอัตราที่ใช้ (ข้อความล้วน สำหรับแสดงผล/รายงาน) */
  rateDescription: string;
  /** หมายเหตุพิเศษ เช่น กฎ TOD Partial */
  note?: string;
}

/* ============ PV sizing ============ */

export interface PvSizingInput {
  /** หน่วยใช้ไฟต่อเดือน (kWh) */
  monthlyUnits: number;
  /** สัดส่วนใช้ไฟกลางวัน 0–1 */
  daylightRatio: number;
  /** Peak Sun Hours ชม./วัน */
  psh: number;
  /** Performance Ratio 0–1 */
  pr: number;
  /** ขนาดแผงต่อแผ่น (วัตต์) */
  panelWatt: number;
  /** ขนาด inverter ต่อตัว (kW) */
  inverterSizeKw: number;
  /** โครงสร้างต้นทุน EPC บาท/วัตต์ */
  costPerWatt: { panel: number; inverter: number; bos: number; labor: number; manage: number };
  /** แบตเตอรี่ (ไม่ใส่ = ระบบ On-grid) */
  battery?: { unitSizeKwh: number; units: number; costPerKwh: number };
  /** กำไรส่วนเพิ่ม 0–1 (เช่น 0.2 = 20%) */
  margin: number;
}

export interface PvSizingResult {
  /** ขนาดที่คำนวณได้ตามทฤษฎี */
  calcKwp: number;
  panelsNeeded: number;
  /** ขนาดจริงหลังปัดจำนวนแผง */
  actualKwp: number;
  actualWatt: number;
  invertersNeeded: number;
  batteryCapacityKwh: number;
  /** พลังงานผลิตเฉลี่ยวันแรก (ปีที่ 1) kWh/วัน */
  avgDailyProductionYear1: number;
  dayUnitsPerDay: number;
  nightUnitsPerDay: number;
  epcCost: number;
  epcCostVat: number;
  sellingPrice: number;
  sellingPriceVat: number;
}

/* ============ Financial analysis ============ */

export interface FinanceInput {
  sizing: PvSizingResult;
  /** ค่าไฟเฉลี่ย บาท/หน่วย ที่ใช้คิดเงินประหยัด (ใช้เมื่อไม่ได้ส่ง valueOfSavedUnits) */
  tariff: number;
  /**
   * ตีมูลค่าหน่วยที่ลดได้ต่อปีเป็นเงิน — ส่งมาเมื่อต้องการความแม่นระดับบิลจริง
   * (คิดส่วนต่างบิลสองใบ จึงไหลลงขั้นบันไดถูกต้องและไม่มีวันประหยัดเกินค่าไฟทั้งบิล)
   */
  valueOfSavedUnits?: (unitsPerYear: number) => number;
  /** อัตราคิดลด (WACC) 0–1 */
  wacc: number;
  /** อัตราเสื่อมของแผงต่อปี 0–1 */
  degradation: number;
  /** ค่า O&M บาท/วัตต์/ปี */
  omCostPerWatt: number;
  /** จำนวนปีวิเคราะห์ (ค่าเริ่มต้น 15) */
  years?: number;
  hasBattery: boolean;
}

export interface CashFlowRow {
  year: number;
  annualProductionKwh: number;
  /** หน่วยที่ลดได้จริงในปีนั้น (kWh) */
  annualUnitsSaved: number;
  annualSaving: number;
  omCost: number;
  netCashFlow: number;
  discountedCashFlow: number;
  cumulativeDcf: number;
}

export interface FinanceResult {
  rows: CashFlowRow[];
  /** ปีคืนทุน (null = ไม่คืนทุนในช่วงวิเคราะห์) */
  paybackYears: number | null;
  npv: number;
  /** IRR เป็นสัดส่วน เช่น 0.12 = 12% */
  irr: number;
  /** ต้นทุนไฟฟ้าเฉลี่ยตลอดอายุ บาท/หน่วย */
  lcoe: number;
  /** เกณฑ์คืนทุนตามประเภทโครงการ (ปี) */
  paybackThreshold: number;
  projectCategory: string;
  isFeasible: boolean;
}

/* ============ Bill estimate (อินเวอร์ส: บิล → หน่วย) ============ */

/** ตัวเลือกประเภทผู้ใช้ไฟแบบย่อสำหรับหน้าคำนวณฟรี */
export type SimpleUserType = 'home' | 'small' | 'medium';

export interface BillEstimateInput {
  /** ยอดบิลเฉลี่ยต่อเดือน (บาท รวม VAT) */
  monthlyBill: number;
  userType: SimpleUserType;
  /** ค่า Ft บาท/หน่วย (ไม่ใส่ = DEFAULT_FT) */
  ft?: number;
  /** VAT เป็นเปอร์เซ็นต์ (ไม่ใส่ = 7) */
  vatPercent?: number;
  /** Load Factor สำหรับประมาณ Demand ของประเภท 3 (ไม่ใส่ = 0.4) */
  loadFactor?: number;
}

export interface BillEstimate {
  monthlyUnits: number;
  /** ค่าความต้องการพลังไฟฟ้าที่ประมาณได้ (kW) — 0 ถ้าประเภทนั้นไม่คิด */
  demandKw: number;
  /** บาท/หน่วยที่ประหยัดได้จริงเมื่อลดหน่วยลง (รวม Ft และ VAT) */
  marginalTariff: number;
  /** บาท/หน่วยเฉลี่ยทั้งบิล (รวมค่าบริการและ Demand) */
  averageTariff: number;
  peaType: 1 | 2 | 3;
  rateDescription: string;
  /** บิลที่คำนวณกลับได้ ณ หน่วยที่ประมาณ — ใช้ตรวจสอบความสมเหตุสมผล */
  bill: BillResult;
}

/* ============ Daily profile (กราฟรายวัน 24 ชม.) ============ */

export interface DayWindow {
  sunriseHour: number;
  sunsetHour: number;
  loadDayStartHour: number;
  loadDayEndHour: number;
  pshStartHour: number;
  pshEndHour: number;
}

export interface DailyProfileInput {
  /** พลังงานที่ผลิตได้เฉลี่ยต่อวัน (kWh) */
  avgDailyProductionKwh: number;
  dayUnitsPerDay: number;
  nightUnitsPerDay: number;
  /** ความจุแบตเตอรี่ (kWh) — 0 = ระบบ On-grid */
  batteryCapacityKwh: number;
  /** ยอมให้แบตจ่ายไฟก่อนช่วง PSH (ดึก–เช้า) */
  allowDischargeBeforePsh: boolean;
  /** ยอมให้แบตจ่ายไฟหลังช่วง PSH (เย็น–ค่ำ) */
  allowDischargeAfterPsh: boolean;
  /** override หน้าต่างเวลา (ไม่ใส่ = DEFAULT_DAY_WINDOW) */
  window?: Partial<DayWindow>;
}

export interface DailyProfilePoint {
  /** ชั่วโมง 0–24 (24 ซ้ำกับ 0 เพื่อปิดกราฟ) */
  hour: number;
  solarKw: number;
  loadKw: number;
  /** กำลังชาร์จเข้าแบต (ค่าบวก) */
  chargeKw: number;
  /** กำลังจ่ายออกจากแบต (ค่าลบ ตามแบบกราฟเดิม) */
  dischargeKw: number;
  socKwh: number;
}

export interface DailyProfileResult {
  points: DailyProfilePoint[];
  /** กำลังผลิตสูงสุดกลางวัน (kW) */
  peakSolarKw: number;
  /** ชั่วโมงที่แบตหมด (null = จ่ายได้ตลอดช่วงที่อนุญาต หรือไม่มีแบต) */
  batteryDepletedHour: number | null;
  window: DayWindow;
}

/* ============ Monthly yield (กราฟผลผลิตรายเดือน) ============ */

export type SolarRegion = 'central' | 'north' | 'northeast' | 'south';

export interface MonthlyYieldInput {
  avgDailyProductionKwh: number;
  /** ขนาดติดตั้ง (kWp) — ใช้คิด specific yield */
  installedKwp: number;
  region: SolarRegion;
  /** ปีที่ต้องการ (1 = ปีแรก) */
  year?: number;
  /** อัตราเสื่อมต่อปี 0–1 */
  degradation?: number;
}

export interface MonthlyYieldRow {
  month: number;
  label: string;
  days: number;
  /** ตัวคูณฤดูกาลของเดือนนั้น */
  factor: number;
  productionKwh: number;
}

export interface MonthlyYieldResult {
  rows: MonthlyYieldRow[];
  totalKwh: number;
  avgMonthlyKwh: number;
  bestMonth: MonthlyYieldRow;
  worstMonth: MonthlyYieldRow;
  /** kWh/kWp/ปี */
  specificYield: number;
}

/* ============ ช่วงราคาตลาด ============ */

export interface PriceRange {
  low: number;
  mid: number;
  high: number;
}

/* ============ ระบบออนกริดเดิม (AC Coupling) ============ */

/** ข้อมูลการผลิตของระบบเดิมที่ผู้ใช้มีอยู่ในมือ */
export type ExistingYieldBasis =
  /** รู้แค่ขนาด — ให้ระบบประมาณให้จาก PSH × 365 × PR */
  | 'estimate'
  /** มีผลผลิตรายเดือน 12 ค่า (kWh) */
  | 'monthly'
  /** มีผลผลิตรายชั่วโมง 24 ค่า เฉลี่ยต่อวัน (kWh) */
  | 'hourly';

export interface ExistingPvInput {
  /** ขนาด AC ของอินเวอร์เตอร์เดิม (kW) */
  acKw: number;
  /** รุ่นอินเวอร์เตอร์เดิม — ข้อความล้วน ใช้ในรายงานเท่านั้น ไม่เข้าสูตร */
  inverterModel?: string;
  /** แผงเดิม วัตต์ต่อแผง (0 หรือไม่ใส่ = ไม่ทราบ) */
  panelWatt?: number;
  /** จำนวนแผงเดิม (0 หรือไม่ใส่ = ไม่ทราบ) */
  panelCount?: number;
  /** ปีที่ติดตั้ง รับได้ทั้ง ค.ศ. และ พ.ศ. */
  installYear?: number;
  /** อัตราเสื่อมต่อปี เป็นเปอร์เซ็นต์ เช่น 0.5 หมายถึง 0.5%/ปี */
  degradationPercent?: number;
  basis: ExistingYieldBasis;
  /** ผลผลิตรายเดือนที่วัดได้จริง 12 ค่า (kWh) — ใช้เมื่อ basis = 'monthly' */
  monthlyKwh?: number[];
  /** ผลผลิตรายชั่วโมงเฉลี่ยต่อวัน 24 ค่า (kWh) — ใช้เมื่อ basis = 'hourly' */
  hourlyKwh?: number[];
  /** ผลผลิตจำเพาะที่คาด (kWh/kW/ปี) — ไม่ใส่ = คำนวณจาก PSH × 365 × PR */
  specificYield?: number;
  /** มีระบบกันไฟไหลย้อน (Gateway / CT) */
  hasAntiBackflow: boolean;
  /** ขนาดหม้อแปลง (kVA) สำหรับตรวจสัดส่วนกำลังติดตั้ง — ไม่ใส่/0 = ไม่ตรวจ */
  transformerKva?: number;
}

export interface ExistingPvResult {
  /** ขนาดที่ใช้เป็นตัวตั้งในการประมาณผลผลิต (kWp หรือ kW แล้วแต่ sizeBasis) */
  sizeKw: number;
  /** 'dc' = คิดจากแผงจริง · 'ac' = ไม่ทราบแผง จึงใช้ขนาด AC แทน */
  sizeBasis: 'dc' | 'ac';
  acKw: number;
  /** อายุระบบ (ปี) — 0 เมื่อไม่ทราบปีติดตั้ง */
  ageYears: number;
  /** ตัวคูณกำลังผลิตที่เหลือหลังเสื่อม 0–1 */
  remainingFactor: number;
  /** ผลผลิตจำเพาะที่ใช้จริง (kWh/kW/ปี) */
  specificYield: number;
  /** ผลผลิตต่อปีของระบบเดิม (kWh) */
  annualKwh: number;
  avgDailyKwh: number;
  /** ผลผลิตรายเดือน 12 ค่า (kWh) — รวมแล้วเท่ากับ annualKwh */
  monthlyKwh: number[];
  /** โปรไฟล์ 24 ชม. (kWh ต่อชั่วโมง) — null เมื่อผู้ใช้ไม่ได้ให้ข้อมูลรายชั่วโมง */
  hourlyKwh: number[] | null;
  basis: ExistingYieldBasis;
  /** ที่มาของตัวเลข เขียนเป็นภาษาคน สำหรับแสดงบนหน้าจอและในรายงาน */
  note: string;
}

export interface CombinedAcInput {
  /** กำลัง AC ของระบบใหม่ (kW) */
  newAcKw: number;
  /** กำลัง AC ของระบบเดิม (kW) */
  existingAcKw: number;
  /** ขนาดหม้อแปลง (kVA) — ไม่ใส่/0 = ไม่ตรวจสัดส่วน */
  transformerKva?: number;
}

export interface CombinedAcResult {
  newAcKw: number;
  existingAcKw: number;
  /** กำลัง AC สูงสุดรวมสาย (kW) */
  totalAcKw: number;
  transformerKva: number;
  /** สัดส่วนต่อขนาดหม้อแปลง (%) — null เมื่อไม่ได้ระบุหม้อแปลง */
  transformerLoadPercent: number | null;
  /** เกินเกณฑ์ที่ควรขอไฟฟ้าตรวจสอบก่อน (ค่าเริ่มต้น 80% ของหม้อแปลง) */
  overThreshold: boolean;
}
