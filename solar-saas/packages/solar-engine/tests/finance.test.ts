import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizePvSystem } from '../src/pv/sizing.ts';
import { analyzeFinance, computeIRR } from '../src/finance/analysis.ts';
import type { PvSizingInput } from '../src/types.ts';

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

const baseInput: PvSizingInput = {
  monthlyUnits: 900,
  daylightRatio: 0.4,
  psh: 4.3,
  pr: 0.75,
  panelWatt: 620,
  inverterSizeKw: 50,
  costPerWatt: { panel: 5, inverter: 3, bos: 8, labor: 5, manage: 2 },
  margin: 0.2,
};

test('PV sizing — On-grid 900 หน่วย/เดือน กลางวัน 40%', () => {
  const s = sizePvSystem(baseInput);
  // day units = 900×0.4/30 = 12 kWh/วัน → kWp = 12/(4.3×0.75) = 3.72093
  close(s.dayUnitsPerDay, 12);
  close(s.calcKwp, 12 / (4.3 * 0.75));
  assert.equal(s.panelsNeeded, Math.ceil((s.calcKwp * 1000) / 620)); // 7 แผง
  assert.equal(s.panelsNeeded, 7);
  close(s.actualKwp, 4.34);
  // EPC = 4340W × 23 บาท/W
  close(s.epcCost, 4340 * 23);
  close(s.epcCostVat, 4340 * 23 * 1.07);
  // กำไรคิดจากต้นทุนก่อน VAT แล้วค่อยบวก VAT ชั้นเดียว (ไม่ซ้อนแบบ V4.1)
  close(s.sellingPrice, 4340 * 23 * 1.2);
  close(s.sellingPriceVat, 4340 * 23 * 1.2 * 1.07);
  close(s.avgDailyProductionYear1, 4.34 * 4.3 * 0.75);
});

test('PV sizing — Hybrid มีแบตเตอรี่ ต้องเพิ่มพลังงานชาร์จ', () => {
  const s = sizePvSystem({
    ...baseInput,
    battery: { unitSizeKwh: 5, units: 2, costPerKwh: 8000 },
  });
  assert.equal(s.batteryCapacityKwh, 10);
  // night = 18 kWh, usable = 9 → charge = 9/0.9 = 10 → need = 12+10 = 22 kWh/วัน
  close(s.nightUnitsPerDay, 18);
  const expectedKwp = 22 / (4.3 * 0.75);
  close(s.calcKwp, expectedKwp);
  // ต้นทุนรวมแบต 10×8000
  const panels = Math.ceil((expectedKwp * 1000) / 620);
  close(s.epcCost, panels * 620 * 23 + 80000);
});

test('computeIRR — ค่าที่รู้ผลแน่นอน', () => {
  // -1000 แล้วรับ 1100 ปีเดียว → IRR = 10% พอดี
  close(computeIRR([-1000, 1100]), 0.1, 1e-4);
  // -1000, 500×3 ปี → IRR ≈ 23.375%
  const irr = computeIRR([-1000, 500, 500, 500]);
  assert.ok(irr > 0.233 && irr < 0.234, `irr=${irr}`);
});

test('วิเคราะห์การเงิน 15 ปี — โครงสร้างผลลัพธ์และ payback', () => {
  const sizing = sizePvSystem(baseInput);
  const fin = analyzeFinance({
    sizing,
    tariff: 4.5,
    wacc: 0.05,
    degradation: 0.01,
    omCostPerWatt: 0.6,
    hasBattery: false,
  });
  assert.equal(fin.rows.length, 15);
  // ปีแรก: ผลิต 13.9965 kWh/วัน > ใช้กลางวัน 12 → ประหยัดแค่ 12 หน่วย/วัน
  close(fin.rows[0].annualSaving, 12 * 365 * 4.5);
  close(fin.rows[0].omCost, 4340 * 0.6);
  // cumulative ปีสุดท้าย = NPV
  close(fin.npv, fin.rows[14].cumulativeDcf);
  assert.equal(fin.projectCategory, 'ภาคครัวเรือน (Residential < 30 kWp)');
  assert.equal(fin.paybackThreshold, 7);
  // ระบบเล็กราคา EPC 23 บาท/W ควรคืนทุนในกรอบวิเคราะห์
  assert.ok(fin.paybackYears !== null && fin.paybackYears > 0 && fin.paybackYears < 15);
  assert.ok(Number.isFinite(fin.lcoe) && fin.lcoe > 0);
});

test('เกณฑ์คุ้มทุนเปลี่ยนตามประเภทโครงการ', () => {
  const withBatt = analyzeFinance({
    sizing: sizePvSystem({ ...baseInput, battery: { unitSizeKwh: 5, units: 2, costPerKwh: 8000 } }),
    tariff: 4.5,
    wacc: 0.05,
    degradation: 0.01,
    omCostPerWatt: 0.9,
    hasBattery: true,
  });
  assert.equal(withBatt.paybackThreshold, 12);
  assert.equal(withBatt.projectCategory, 'Solar + BESS (แบตเตอรี่)');

  const ci = analyzeFinance({
    sizing: sizePvSystem({ ...baseInput, monthlyUnits: 30000 }),
    tariff: 4.2,
    wacc: 0.07,
    degradation: 0.01,
    omCostPerWatt: 0.6,
    hasBattery: false,
  });
  assert.equal(ci.projectCategory, 'ธุรกิจและอุตสาหกรรม (C&I >= 30 kWp)');
});

test('ระบบไม่มีแบต — ไม่มีการประหยัดกลางคืน (ผลิตเกินถูกทิ้ง)', () => {
  const sizing = sizePvSystem({ ...baseInput, monthlyUnits: 300 });
  const fin = analyzeFinance({
    sizing, tariff: 4.5, wacc: 0.05, degradation: 0.01, omCostPerWatt: 0.6, hasBattery: false,
  });
  // ประหยัดต่อวันต้องไม่เกิน day load แม้ผลิตได้มากกว่า
  const maxDaily = sizing.dayUnitsPerDay * 365 * 4.5;
  for (const row of fin.rows) assert.ok(row.annualSaving <= maxDaily + 1e-9);
});
