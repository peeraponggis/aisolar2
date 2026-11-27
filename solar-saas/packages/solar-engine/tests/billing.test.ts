import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTiers, calculateBill } from '../src/billing/calc-bill.ts';
import { DEFAULT_PEA_RATES as R } from '../src/rates/pea-rates.ts';

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test('applyTiers — ขั้นบันไดประเภท 1.1 (100 หน่วย)', () => {
  const tiers = R.t1.normal.under150.tiers;
  // 15×2.3488 + 10×2.9882 + 10×3.2405 + 65×3.6237 = 333.0595
  close(applyTiers(100, tiers), 333.0595);
});

test('applyTiers — หน่วยเกินขั้นสุดท้าย', () => {
  // 700 หน่วย over150: 150×3.2484 + 250×4.2218 + 300×4.4217 = 487.26 + 1055.45 + 1326.51
  close(applyTiers(700, R.t1.normal.over150.tiers), 487.26 + 1055.45 + 1326.51);
});

test('ประเภท 1.1 บ้าน 100 หน่วย + Ft 0.1623 + VAT 7%', () => {
  const b = calculateBill({ type: 1, mode: 'normal', units: 100, ft: 0.1623, vatPercent: 7 }, R);
  close(b.energyCost, 333.0595);
  close(b.serviceFee, 8.19);
  close(b.ftTotal, 16.23);
  close(b.totalBeforeVat, 357.4795);
  close(b.vatAmount, 357.4795 * 0.07);
  close(b.grandTotal, 357.4795 * 1.07);
});

test('ประเภท 1.1 สลับอัตราเมื่อเกิน 150 หน่วย', () => {
  const b = calculateBill({ type: 1, mode: 'normal', units: 200, ft: 0, vatPercent: 0 }, R);
  // over150: 150×3.2484 + 50×4.2218 = 487.26 + 211.09 = 698.35, service 24.62
  close(b.energyCost, 698.35);
  close(b.serviceFee, 24.62);
});

test('ประเภท 1.2 TOU แรงดันต่ำ', () => {
  const b = calculateBill(
    { type: 1, mode: 'tou', voltage: 'low', peakUnits: 100, offPeakUnits: 200, ft: 0, vatPercent: 7 },
    R,
  );
  close(b.energyCost, 100 * 5.7982 + 200 * 2.6369);
  close(b.serviceFee, 24.62);
  assert.equal(b.units, 300);
});

test('ประเภท 3.1 กิจการกลาง — Demand + พลังงาน', () => {
  const b = calculateBill(
    { type: 3, mode: 'normal', voltage: 'med', demandKw: 120, units: 30000, ft: 0.1623, vatPercent: 7 },
    R,
  );
  close(b.demandCost, 120 * 196.26);
  close(b.energyCost, 30000 * 3.1471);
  close(b.serviceFee, 312.24);
});

test('ประเภท 4.1 TOD — กฎ Partial คิดเฉพาะส่วนเกิน Peak', () => {
  const b = calculateBill(
    {
      type: 4, mode: 'tod', voltage: 'low',
      demandPeakKw: 800, demandPartialKw: 1000, units: 400000, ft: 0, vatPercent: 7,
    },
    R,
  );
  // Peak 800×332.71 + Partial ส่วนเกิน 200×68.22
  close(b.demandCost, 800 * 332.71 + 200 * 68.22);
});

test('ประเภท 4.1 TOD — Partial ไม่เกิน Peak ต้องไม่คิด Partial', () => {
  const b = calculateBill(
    {
      type: 4, mode: 'tod', voltage: 'low',
      demandPeakKw: 1000, demandPartialKw: 900, units: 0, ft: 0, vatPercent: 0,
    },
    R,
  );
  close(b.demandCost, 1000 * 332.71);
  assert.match(b.note ?? '', /ไม่คิดค่าความต้องการ/);
});

test('ประเภท 4.2 TOU ใช้อัตรา touShared', () => {
  const b = calculateBill(
    { type: 4, mode: 'tou', voltage: 'high', demandKw: 1500, peakUnits: 100000, offPeakUnits: 250000, ft: 0, vatPercent: 0 },
    R,
  );
  close(b.demandCost, 1500 * 74.14);
  close(b.energyCost, 100000 * 4.1025 + 250000 * 2.5849);
});

test('ประเภท 7.2 TOU ใช้ค่าบริการเฉพาะ 204.07', () => {
  const b = calculateBill(
    { type: 7, mode: 'tou', voltage: 'low', demandKw: 10, peakUnits: 50, offPeakUnits: 300, ft: 0, vatPercent: 0 },
    R,
  );
  close(b.serviceFee, 204.07);
  close(b.demandCost, 10 * 210.0);
});

test('ประเภท 8 ชั่วคราว — อัตราเดียว ไม่มีค่าบริการ', () => {
  const b = calculateBill({ type: 8, units: 500, ft: 0.1623, vatPercent: 7 }, R);
  close(b.energyCost, 500 * 6.8025);
  close(b.serviceFee, 0);
});

test('Demand เป็น 0 สำหรับประเภทที่ไม่คิด (1, 2, 6 ปกติ, 8)', () => {
  for (const b of [
    calculateBill({ type: 1, mode: 'normal', units: 100, ft: 0, vatPercent: 7 }, R),
    calculateBill({ type: 2, mode: 'normal', voltage: 'low', units: 100, ft: 0, vatPercent: 7 }, R),
    calculateBill({ type: 6, mode: 'normal', voltage: 'low', units: 100, ft: 0, vatPercent: 7 }, R),
    calculateBill({ type: 8, units: 100, ft: 0, vatPercent: 7 }, R),
  ]) {
    assert.equal(b.demandCost, 0);
  }
});
