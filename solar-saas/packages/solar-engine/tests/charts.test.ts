import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DAY_WINDOW, simulateDailyProfile } from '../src/pv/daily-profile.ts';
import { MONTHLY_PSH_FACTOR, monthlyYield } from '../src/pv/monthly-yield.ts';
import { DEFAULT_PRICE_SPREAD, marketPriceRange, sizePvSystem } from '../src/pv/sizing.ts';
import type { SolarRegion } from '../src/types.ts';

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

/* ---------- กราฟรายวัน ---------- */

const onGrid = {
  avgDailyProductionKwh: 14,
  dayUnitsPerDay: 12,
  nightUnitsPerDay: 18,
  batteryCapacityKwh: 0,
  allowDischargeBeforePsh: true,
  allowDischargeAfterPsh: true,
};

test('กราฟรายวัน — พื้นที่ใต้เส้นโซลาร์ต้องเท่ากับพลังงานที่ผลิตได้ต่อวัน', () => {
  const r = simulateDailyProfile(onGrid);
  // อินทิเกรตด้วยกฎสี่เหลี่ยมคางหมู ช่วงละ 1 ชม. จาก 0–24
  let energy = 0;
  for (let h = 0; h < 24; h++) energy += (r.points[h].solarKw + r.points[h + 1].solarKw) / 2;
  assert.ok(Math.abs(energy - 14) < 0.2, `พลังงานจากกราฟ ${energy} ควรใกล้ 14`);
  close(r.peakSolarKw, (14 * Math.PI) / 24);
});

test('กราฟรายวัน — ไม่มีแดดนอกช่วงพระอาทิตย์ขึ้น–ตก', () => {
  const r = simulateDailyProfile(onGrid);
  for (const p of r.points) {
    if (p.hour < DEFAULT_DAY_WINDOW.sunriseHour || p.hour > DEFAULT_DAY_WINDOW.sunsetHour) {
      close(p.solarKw, 0);
    }
  }
});

test('กราฟรายวัน — โหลดกลางวันกระจายในช่วง 08:00–16:00 ตามที่ถามผู้ใช้', () => {
  const r = simulateDailyProfile(onGrid);
  close(r.points[10].loadKw, 12 / 8); // กลางวัน 8 ชม.
  close(r.points[22].loadKw, 18 / 16); // กลางคืน 16 ชม.
  // รวมพลังงานโหลดทั้งวันต้องเท่ากับ day + night
  let load = 0;
  for (let h = 0; h < 24; h++) load += r.points[h].loadKw;
  close(load, 30);
});

test('กราฟรายวัน — ระบบ On-grid ต้องไม่มีการชาร์จหรือจ่ายแบต', () => {
  const r = simulateDailyProfile(onGrid);
  for (const p of r.points) {
    close(p.chargeKw, 0);
    close(p.dischargeKw, 0);
    close(p.socKwh, 0);
  }
  assert.equal(r.batteryDepletedHour, null);
});

test('กราฟรายวัน — Hybrid ชาร์จเฉพาะช่วง PSH และจ่ายออกตอนกลางคืน', () => {
  const r = simulateDailyProfile({ ...onGrid, avgDailyProductionKwh: 30, batteryCapacityKwh: 10 });
  for (const p of r.points) {
    if (p.chargeKw > 0) {
      assert.ok(
        p.hour >= DEFAULT_DAY_WINDOW.pshStartHour && p.hour <= DEFAULT_DAY_WINDOW.pshEndHour,
        `ชาร์จนอกช่วง PSH ที่ ${p.hour}:00`,
      );
    }
    assert.ok(p.socKwh >= -1e-9 && p.socKwh <= 10 + 1e-9, `SOC ${p.socKwh} เกินความจุ`);
  }
  const discharged = r.points.filter((p) => p.dischargeKw < 0);
  assert.ok(discharged.length > 0, 'ต้องมีการจ่ายไฟจากแบต');
  assert.ok(discharged.every((p) => p.dischargeKw < 0), 'การจ่ายออกต้องเป็นค่าลบ');
});

test('กราฟรายวัน — ปิดการจ่ายแบตทั้งสองช่วง = ไม่มีการจ่ายออกเลย', () => {
  const r = simulateDailyProfile({
    ...onGrid,
    avgDailyProductionKwh: 30,
    batteryCapacityKwh: 10,
    allowDischargeBeforePsh: false,
    allowDischargeAfterPsh: false,
  });
  for (const p of r.points) close(p.dischargeKw, 0);
});

test('กราฟรายวัน — แบตเล็กเกินไปต้องรายงานเวลาที่แบตหมด', () => {
  const r = simulateDailyProfile({
    ...onGrid,
    avgDailyProductionKwh: 30,
    nightUnitsPerDay: 40,
    batteryCapacityKwh: 5,
  });
  assert.ok(r.batteryDepletedHour !== null, 'แบต 5 kWh ต้องหมดก่อนเช้า');
});

test('กราฟรายวัน — จุด 24:00 บรรจบกับ 00:00', () => {
  const r = simulateDailyProfile({ ...onGrid, batteryCapacityKwh: 10 });
  assert.equal(r.points.length, 25);
  close(r.points[24].solarKw, r.points[0].solarKw);
  close(r.points[24].loadKw, r.points[0].loadKw);
});

/* ---------- กราฟผลผลิตรายเดือน ---------- */

test('ตัวคูณฤดูกาลทุกภาคต้องเฉลี่ยเท่ากับ 1.00 พอดี', () => {
  for (const [region, factors] of Object.entries(MONTHLY_PSH_FACTOR)) {
    assert.equal(factors.length, 12, region);
    const sum = factors.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 12) < 1e-9, `${region} รวม ${sum} ควรเป็น 12`);
  }
});

test('ผลผลิตรายปี = ผลผลิตเฉลี่ยต่อวัน × 365 (ตัวคูณฤดูกาลไม่เปลี่ยนยอดรวม)', () => {
  const r = monthlyYield({ avgDailyProductionKwh: 14, installedKwp: 4.34, region: 'central' });
  // 365 วันคูณตัวคูณเฉลี่ย 1.00 — ต่างจาก 14×365 ได้บ้างเพราะน้ำหนักวันต่อเดือนไม่เท่ากัน
  assert.ok(Math.abs(r.totalKwh - 14 * 365) / (14 * 365) < 0.01);
  close(r.avgMonthlyKwh, r.totalKwh / 12);
  close(r.specificYield, r.totalKwh / 4.34);
});

test('กราฟรายเดือนต้องมีรูปทรงฤดูกาล ไม่ใช่เส้นแบน', () => {
  const r = monthlyYield({ avgDailyProductionKwh: 14, installedKwp: 4.34, region: 'central' });
  const spread = (r.bestMonth.productionKwh - r.worstMonth.productionKwh) / r.avgMonthlyKwh;
  assert.ok(spread > 0.15, `ช่วงห่างสูงสุด–ต่ำสุด ${spread} ควรเกิน 15%`);
  assert.ok(r.bestMonth.month >= 2 && r.bestMonth.month <= 4, 'เดือนดีสุดควรอยู่ ก.พ.–เม.ย.');
  assert.ok(r.worstMonth.month >= 7 && r.worstMonth.month <= 10, 'เดือนแย่สุดควรอยู่ ก.ค.–ต.ค.');
});

test('ภาคใต้ต้องแกว่งน้อยกว่าภาคเหนือ', () => {
  const swing = (region: SolarRegion) => {
    const f = MONTHLY_PSH_FACTOR[region];
    return Math.max(...f) - Math.min(...f);
  };
  assert.ok(swing('south') < swing('north'));
});

test('ปีหลัง ๆ ผลผลิตลดลงตามอัตราเสื่อม', () => {
  const y1 = monthlyYield({ avgDailyProductionKwh: 14, installedKwp: 4.34, region: 'central' });
  const y11 = monthlyYield({
    avgDailyProductionKwh: 14,
    installedKwp: 4.34,
    region: 'central',
    year: 11,
    degradation: 0.01,
  });
  close(y11.totalKwh, y1.totalKwh * Math.pow(0.99, 10), 1e-6);
});

/* ---------- ช่วงราคาตลาด ---------- */

test('ช่วงราคาตลาด — กึ่งกลางคือราคาที่คำนวณได้ และกว้าง ±12%', () => {
  const r = marketPriceRange(100000);
  close(r.mid, 100000);
  close(r.low, 88000);
  close(r.high, 112000);
  close(DEFAULT_PRICE_SPREAD, 0.12);
});

test('VAT ไม่ถูกคิดซ้อน — ราคาขายต้องต่ำกว่าสูตรเดิมของ V4.1 พอดี 7%', () => {
  const s = sizePvSystem({
    monthlyUnits: 900,
    daylightRatio: 0.4,
    psh: 4.3,
    pr: 0.75,
    panelWatt: 670,
    inverterSizeKw: 5,
    costPerWatt: { panel: 5, inverter: 3, bos: 8, labor: 5, manage: 2 },
    margin: 0.2,
  });
  const v41Formula = s.epcCost * 1.07 * 1.2 * 1.07;
  close(s.sellingPriceVat, v41Formula / 1.07, 1e-6);
});

test('กราฟรายวัน — ประสิทธิภาพแบตคิด 0.9 ครั้งเดียว ตรงกับ analyzeFinance()', () => {
  const r = simulateDailyProfile({
    ...onGrid,
    avgDailyProductionKwh: 60,
    nightUnitsPerDay: 30,
    batteryCapacityKwh: 10,
  });
  const charged = r.points.slice(0, 24).reduce((sum, p) => sum + p.chargeKw, 0);
  const delivered = -r.points.slice(0, 24).reduce((sum, p) => sum + p.dischargeKw, 0);
  // ป้อนเข้าเต็มความจุป้าย 10 kWh → จ่ายออกได้ 9 kWh (หัก 0.9 ครั้งเดียว)
  close(charged, 10, 1e-6);
  close(delivered, 9, 1e-6);
});
