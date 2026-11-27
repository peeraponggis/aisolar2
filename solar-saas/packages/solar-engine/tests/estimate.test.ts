import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBill } from '../src/billing/calc-bill.ts';
import {
  DEFAULT_FT,
  DEFAULT_VAT_PERCENT,
  estimateFromBill,
  estimateUnitsFromBill,
  monthlyBillAtUnits,
  savingFromUnitReduction,
} from '../src/billing/estimate.ts';
import { DEFAULT_PEA_RATES as R } from '../src/rates/pea-rates.ts';

const OPTS = { ft: DEFAULT_FT, vatPercent: DEFAULT_VAT_PERCENT, loadFactor: 0.4 };

test('estimateUnitsFromBill — บ้าน (1.1) ย้อนกลับได้ตรงกับ calculateBill', () => {
  for (const bill of [500, 1500, 4500, 12000]) {
    const units = estimateUnitsFromBill(bill, { ...OPTS, userType: 'home' }, R);
    const back = calculateBill(
      { type: 1, mode: 'normal', units, ft: DEFAULT_FT, vatPercent: DEFAULT_VAT_PERCENT },
      R,
    );
    assert.ok(Math.abs(back.grandTotal - bill) < 0.5, `bill ${bill} → ${back.grandTotal}`);
  }
});

test('estimateUnitsFromBill — กิจการขนาดเล็ก (2.1) ย้อนกลับได้ตรง', () => {
  const units = estimateUnitsFromBill(25000, { ...OPTS, userType: 'small' }, R);
  const back = calculateBill(
    {
      type: 2,
      mode: 'normal',
      voltage: 'low',
      units,
      ft: DEFAULT_FT,
      vatPercent: DEFAULT_VAT_PERCENT,
    },
    R,
  );
  assert.ok(Math.abs(back.grandTotal - 25000) < 0.5);
});

test('estimateUnitsFromBill — กิจการขนาดกลาง (3.1) คิด Demand จาก Load Factor', () => {
  const units = estimateUnitsFromBill(180000, { ...OPTS, userType: 'medium' }, R);
  const demandKw = units / (720 * 0.4);
  const back = calculateBill(
    {
      type: 3,
      mode: 'normal',
      voltage: 'low',
      demandKw,
      units,
      ft: DEFAULT_FT,
      vatPercent: DEFAULT_VAT_PERCENT,
    },
    R,
  );
  assert.ok(Math.abs(back.grandTotal - 180000) < 0.5);
});

test('บิลต่ำกว่าค่าบริการขั้นต่ำ → 0 หน่วย', () => {
  assert.equal(estimateUnitsFromBill(5, { ...OPTS, userType: 'home' }, R), 0);
});

test('estimateFromBill — อัตราส่วนเพิ่มของบ้านต้องอยู่ในขั้นสุดท้าย และสูงกว่าอัตราเฉลี่ย', () => {
  const e = estimateFromBill({ monthlyBill: 4500, userType: 'home' }, R);
  // ขั้นสุดท้ายประเภท 1.1 = 4.4217 + Ft 0.1623 แล้วบวก VAT 7%
  const expected = (4.4217 + DEFAULT_FT) * 1.07;
  assert.ok(Math.abs(e.marginalTariff - expected) < 0.01, `marginal ${e.marginalTariff}`);
  assert.ok(e.marginalTariff > e.averageTariff);
  assert.equal(e.peaType, 1);
});

test('estimateFromBill — ประเภท 3 ประหยัดเฉพาะค่าพลังงาน ไม่รวม Demand', () => {
  const e = estimateFromBill({ monthlyBill: 180000, userType: 'medium' }, R);
  const expected = (R.t3.normal.low.e + DEFAULT_FT) * 1.07;
  assert.ok(Math.abs(e.marginalTariff - expected) < 0.01, `marginal ${e.marginalTariff}`);
  assert.ok(e.demandKw > 0);
  assert.equal(e.peaType, 3);
});

test('estimateFromBill — บิลยิ่งสูง หน่วยยิ่งมาก (monotonic)', () => {
  let prev = -1;
  for (const bill of [1000, 2000, 5000, 10000, 50000]) {
    const e = estimateFromBill({ monthlyBill: bill, userType: 'home' }, R);
    assert.ok(e.monthlyUnits > prev, `${bill} → ${e.monthlyUnits}`);
    prev = e.monthlyUnits;
  }
});

test('เงินประหยัดต้องไม่เกินค่าไฟทั้งบิล แม้ลดหน่วยได้เกือบหมด', () => {
  const bill = 4500;
  const e = estimateFromBill({ monthlyBill: bill, userType: 'home' }, R);
  const opts = {
    userType: 'home' as const,
    ft: DEFAULT_FT,
    vatPercent: DEFAULT_VAT_PERCENT,
    demandKw: 0,
  };

  // คูณอัตราส่วนเพิ่มตรง ๆ (วิธีเดิม) ให้เงินประหยัดเกินค่าไฟจริง — นี่คือบั๊กที่กันไว้
  const naive = e.monthlyUnits * 0.97 * e.marginalTariff;
  assert.ok(naive > bill, `วิธีคูณตรงให้ ${naive} ซึ่งเกินบิล ${bill}`);

  // วิธีคิดส่วนต่างบิลต้องไม่เกินบิล ไม่ว่าจะลดหน่วยไปเท่าไร
  for (const ratio of [0.25, 0.5, 0.9, 0.97, 1]) {
    const saving = savingFromUnitReduction(e.monthlyUnits, e.monthlyUnits * ratio, opts, R);
    assert.ok(saving <= bill + 1e-6, `ลด ${ratio * 100}% ประหยัด ${saving} เกินบิล ${bill}`);
    assert.ok(saving >= 0);
  }
});

test('ลดหน่วยมากขึ้น ต้องประหยัดมากขึ้นเสมอ (monotonic) และอัตราเฉลี่ยต่ำกว่าอัตราส่วนเพิ่ม', () => {
  const e = estimateFromBill({ monthlyBill: 12000, userType: 'small' }, R);
  const opts = {
    userType: 'small' as const,
    ft: DEFAULT_FT,
    vatPercent: DEFAULT_VAT_PERCENT,
    demandKw: 0,
  };
  let prev = -1;
  for (const ratio of [0.1, 0.3, 0.6, 0.9]) {
    const saving = savingFromUnitReduction(e.monthlyUnits, e.monthlyUnits * ratio, opts, R);
    assert.ok(saving > prev);
    prev = saving;
  }
  const deep = savingFromUnitReduction(e.monthlyUnits, e.monthlyUnits * 0.9, opts, R);
  const effective = deep / (e.monthlyUnits * 0.9);
  assert.ok(effective < e.marginalTariff, `เฉลี่ย ${effective} ควรต่ำกว่าส่วนเพิ่ม ${e.marginalTariff}`);
});

test('ประเภท 3 — ตรึง Demand ไว้ ทำให้ค่า Demand ยังถูกเรียกเก็บแม้ลดหน่วยจนเหลือศูนย์', () => {
  const e = estimateFromBill({ monthlyBill: 180000, userType: 'medium' }, R);
  const opts = {
    userType: 'medium' as const,
    ft: DEFAULT_FT,
    vatPercent: DEFAULT_VAT_PERCENT,
    demandKw: e.demandKw,
  };
  const billAtZeroUnits = monthlyBillAtUnits(0, opts, R);
  // เหลือค่า Demand + ค่าบริการ ซึ่งโซลาร์ลดไม่ได้
  const expected = (e.demandKw * R.t3.normal.low.d + R.t3.normal.low.s) * 1.07;
  assert.ok(Math.abs(billAtZeroUnits - expected) < 0.01, `${billAtZeroUnits} vs ${expected}`);
  const maxSaving = savingFromUnitReduction(e.monthlyUnits, e.monthlyUnits, opts, R);
  assert.ok(maxSaving < 180000 - billAtZeroUnits + 0.01);
});
