import type { CashFlowRow, FinanceInput, FinanceResult } from '../types.ts';

const BATTERY_ROUND_TRIP = 0.9;
const BATTERY_USABLE = 0.9;

/**
 * คำนวณ IRR ด้วยวิธี Newton-Raphson — สูตรเดียวกับ computeIRR() ใน V4.1
 * @param cf กระแสเงินสด index 0 = เงินลงทุน (ติดลบ)
 * @returns IRR เป็นสัดส่วน (0.12 = 12%)
 */
export function computeIRR(cf: number[]): number {
  let guess = 0.1;
  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let dNpv = 0;
    for (let j = 0; j < cf.length; j++) {
      npv += cf[j] / Math.pow(1 + guess, j);
      if (j > 0) dNpv -= (j * cf[j]) / Math.pow(1 + guess, j + 1);
    }
    if (Math.abs(dNpv) < 1e-6) break;
    const next = guess - npv / dNpv;
    if (Math.abs(next - guess) < 1e-6) return next;
    guess = next;
  }
  return guess;
}

/**
 * วิเคราะห์การเงินโครงการ 15 ปี (ค่าเริ่มต้น) — refactor ตรงจากลูป cash flow ใน V4.1
 * รวม Payback (แบบ interpolate), NPV, IRR, LCOE และเกณฑ์คุ้มทุนตามประเภทโครงการ
 */
export function analyzeFinance(input: FinanceInput): FinanceResult {
  const years = input.years ?? 15;
  const s = input.sizing;
  const investment = s.sellingPriceVat;
  const annualOmCost = s.actualWatt * input.omCostPerWatt;
  const requiredChargeEnergy = input.hasBattery
    ? (s.batteryCapacityKwh * BATTERY_USABLE) / BATTERY_ROUND_TRIP
    : 0;

  const rows: CashFlowRow[] = [];
  const cashFlows: number[] = [-investment];
  let cumulativeDcf = -investment;
  let paybackYears: number | null = null;
  let totalDiscountedCost = investment;
  let totalDiscountedEnergy = 0;

  for (let t = 1; t <= years; t++) {
    const degradationFactor = Math.pow(1 - input.degradation, t - 1);
    const dailyProduction = s.avgDailyProductionYear1 * degradationFactor;

    const dailyDaySaving = Math.min(dailyProduction, s.dayUnitsPerDay);
    const surplus = Math.max(0, dailyProduction - dailyDaySaving);
    const dailyBessCharged = input.hasBattery ? Math.min(surplus, requiredChargeEnergy) : 0;
    const dailyNightSaving = input.hasBattery
      ? Math.min(dailyBessCharged * BATTERY_ROUND_TRIP, s.nightUnitsPerDay)
      : 0;

    const annualUnitsSaved = (dailyDaySaving + dailyNightSaving) * 365;
    const annualSaving = input.valueOfSavedUnits
      ? input.valueOfSavedUnits(annualUnitsSaved)
      : annualUnitsSaved * input.tariff;
    const netCashFlow = annualSaving - annualOmCost;
    const dcf = netCashFlow / Math.pow(1 + input.wacc, t);

    const previousCumulative = cumulativeDcf;
    cumulativeDcf += dcf;
    cashFlows.push(netCashFlow);
    totalDiscountedCost += annualOmCost / Math.pow(1 + input.wacc, t);
    totalDiscountedEnergy += (dailyProduction * 365) / Math.pow(1 + input.wacc, t);

    if (previousCumulative < 0 && cumulativeDcf >= 0 && paybackYears === null) {
      paybackYears = t - 1 + Math.abs(previousCumulative) / dcf;
    }

    rows.push({
      year: t,
      annualProductionKwh: dailyProduction * 365,
      annualUnitsSaved,
      annualSaving,
      omCost: annualOmCost,
      netCashFlow,
      discountedCashFlow: dcf,
      cumulativeDcf,
    });
  }

  // เกณฑ์คุ้มทุนตามประเภทโครงการ (ตรรกะเดียวกับ V4.1)
  let paybackThreshold = 7;
  let projectCategory = 'ภาคครัวเรือน (Residential < 30 kWp)';
  if (input.hasBattery) {
    paybackThreshold = 12;
    projectCategory = 'Solar + BESS (แบตเตอรี่)';
  } else if (s.actualKwp >= 30) {
    projectCategory = 'ธุรกิจและอุตสาหกรรม (C&I >= 30 kWp)';
  }

  const isFeasible = paybackYears !== null && paybackYears <= paybackThreshold;

  return {
    rows,
    paybackYears,
    npv: cumulativeDcf,
    irr: computeIRR(cashFlows),
    lcoe: totalDiscountedEnergy > 0 ? totalDiscountedCost / totalDiscountedEnergy : Number.NaN,
    paybackThreshold,
    projectCategory,
    isFeasible,
  };
}
