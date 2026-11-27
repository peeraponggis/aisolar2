import type { PriceRange, PvSizingInput, PvSizingResult } from '../types.ts';

/** ประสิทธิภาพรอบชาร์จ-จ่ายของแบตเตอรี่ และ Depth of Discharge ตามสูตรเดิม V4.1 */
const BATTERY_ROUND_TRIP = 0.9;
const BATTERY_USABLE = 0.9;
/** Inverter oversizing ratio (DC/AC 1.20) ตามสูตรเดิม */
const INVERTER_OVERSIZE = 1.2;
const VAT = 1.07;

/**
 * คำนวณขนาดระบบ PV + ต้นทุน EPC — refactor ตรงจาก calculateSolarSystem()
 * ใน Solar_Feasibility_Calculator_V4_1.html
 */
export function sizePvSystem(input: PvSizingInput): PvSizingResult {
  const nightRatio = 1 - input.daylightRatio;
  const dayUnitsPerDay = (input.monthlyUnits * input.daylightRatio) / 30;
  const nightUnitsPerDay = (input.monthlyUnits * nightRatio) / 30;

  const batteryCapacityKwh = input.battery ? input.battery.unitSizeKwh * input.battery.units : 0;
  const usableBattery = batteryCapacityKwh * BATTERY_USABLE;
  const nightLoadFromBattery = Math.min(nightUnitsPerDay, usableBattery);
  const energyToCharge = input.battery ? nightLoadFromBattery / BATTERY_ROUND_TRIP : 0;

  const totalEnergyNeededPerDay = dayUnitsPerDay + energyToCharge;
  const calcKwp = totalEnergyNeededPerDay / (input.psh * input.pr);

  const panelsNeeded = Math.ceil((calcKwp * 1000) / input.panelWatt);
  const actualKwp = (panelsNeeded * input.panelWatt) / 1000;
  const actualWatt = panelsNeeded * input.panelWatt;

  const invertersNeeded = Math.ceil(actualKwp / (input.inverterSizeKw * INVERTER_OVERSIZE));

  const c = input.costPerWatt;
  const totalSolarCostPerWatt = c.panel + c.inverter + c.bos + c.labor + c.manage;
  const solarComponentCost = actualWatt * totalSolarCostPerWatt;
  const bessComponentCost = input.battery ? batteryCapacityKwh * input.battery.costPerKwh : 0;

  const epcCost = solarComponentCost + bessComponentCost;
  const epcCostVat = epcCost * VAT;
  // คิดกำไรจากต้นทุนที่ยังไม่รวม VAT — ผู้รับเหมาที่จด VAT เครดิตภาษีซื้อคืนได้
  // (V4.1 คิดจาก epcCostVat ทำให้ VAT ถูกบวกซ้อนสองชั้น ราคาสูงเกินจริงราว 7%)
  const sellingPrice = epcCost * (1 + input.margin);
  const sellingPriceVat = sellingPrice * VAT;

  const avgDailyProductionYear1 = actualKwp * input.psh * input.pr;

  return {
    calcKwp,
    panelsNeeded,
    actualKwp,
    actualWatt,
    invertersNeeded,
    batteryCapacityKwh,
    avgDailyProductionYear1,
    dayUnitsPerDay,
    nightUnitsPerDay,
    epcCost,
    epcCostVat,
    sellingPrice,
    sellingPriceVat,
  };
}

/** ความกว้างของช่วงราคาตลาดที่แสดงในหน้าคำนวณฟรี (±12%) */
export const DEFAULT_PRICE_SPREAD = 0.12;

/**
 * แปลงราคาเดียวเป็นช่วงราคาตลาด
 *
 * หน้าเว็บสาธารณะไม่ควรประกาศราคาเป๊ะตัวเดียว เพราะราคาจริงขึ้นกับหน้างาน
 * (ระยะเดินสาย ชนิดหลังคา ระบบกันฟ้าผ่า) และการโชว์ตัวเลขเป๊ะเท่ากับเปิดเผย
 * margin ของผู้ติดตั้งที่เราจะขาย lead ให้
 */
export function marketPriceRange(price: number, spread = DEFAULT_PRICE_SPREAD): PriceRange {
  return { low: price * (1 - spread), mid: price, high: price * (1 + spread) };
}
