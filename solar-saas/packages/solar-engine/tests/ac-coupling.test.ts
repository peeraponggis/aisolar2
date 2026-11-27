import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  combineAcCapacity,
  evaluateExistingPv,
  expectedSpecificYield,
  toGregorianYear,
  type ExistingPvInput,
} from '../src/index.ts';

const OPTS = { psh: 4.3, pr: 0.75, region: 'central' as const, currentYear: 2026 };

/** อินพุตขั้นต่ำ — เทสต์แต่ละข้อค่อยเขียนทับเฉพาะช่องที่สนใจ */
const base: ExistingPvInput = { acKw: 5, basis: 'estimate', hasAntiBackflow: false };

describe('ผลผลิตจำเพาะที่คาด', () => {
  it('ตรงกับตัวเลขที่หน้าเว็บโชว์ให้ผู้ใช้ตรวจเอง (PSH × 365 × PR)', () => {
    // 4.3 × 365 × 0.75 = 1,177.125 — หน้าจอปัดเป็น 1,177
    assert.equal(Math.round(expectedSpecificYield(4.3, 0.75)), 1177);
  });
});

describe('ปีที่ติดตั้ง', () => {
  it('รับได้ทั้ง พ.ศ. และ ค.ศ.', () => {
    assert.equal(toGregorianYear(2567), 2024);
    assert.equal(toGregorianYear(2024), 2024);
  });

  it('กรอกเป็น พ.ศ. แล้วอายุระบบต้องไม่กลายเป็นหลายร้อยปี', () => {
    const r = evaluateExistingPv({ ...base, installYear: 2566, degradationPercent: 0.5 }, OPTS);
    assert.equal(r.ageYears, 3);
    assert.ok(r.remainingFactor > 0.98 && r.remainingFactor < 1);
  });
});

describe('ตัวตั้งของการประมาณ', () => {
  it('ไม่กรอกแผงเดิม ใช้ขนาด AC แทน และบอกไว้ในหมายเหตุ', () => {
    const r = evaluateExistingPv({ ...base, acKw: 10 }, OPTS);
    assert.equal(r.sizeBasis, 'ac');
    assert.equal(r.sizeKw, 10);
    assert.match(r.note, /ขนาด AC/);
    // 10 kW × 1,177.125 = 11,771.25
    assert.ok(Math.abs(r.annualKwh - 11771.25) < 0.01);
  });

  it('กรอกแผงเดิมแล้วใช้ขนาด DC ซึ่งใหญ่กว่า AC ตามจริง', () => {
    const r = evaluateExistingPv({ ...base, acKw: 10, panelWatt: 550, panelCount: 24 }, OPTS);
    assert.equal(r.sizeBasis, 'dc');
    assert.ok(Math.abs(r.sizeKw - 13.2) < 1e-9);
    assert.ok(r.annualKwh > 15000);
    assert.match(r.note, /ขนาดแผงเดิม/);
  });
});

describe('ข้อมูลที่วัดมาจริง', () => {
  it('รายเดือน — ใช้ผลรวมตรง ๆ ไม่หักเสื่อมซ้ำ', () => {
    const monthly = Array.from({ length: 12 }, () => 500);
    const r = evaluateExistingPv(
      { ...base, basis: 'monthly', monthlyKwh: monthly, installYear: 2016, degradationPercent: 1 },
      OPTS,
    );
    // ข้อมูลวัดจริงสะท้อนการเสื่อมไปแล้ว หักซ้ำจะได้ราว 5,400 ซึ่งต่ำกว่าความจริง
    assert.equal(r.annualKwh, 6000);
    assert.deepEqual(r.monthlyKwh, monthly);
    assert.match(r.note, /ไม่หักเสื่อมซ้ำ/);
  });

  it('รายชั่วโมง — คูณ 365 แล้วกระจายลงเดือนตามฤดูกาล', () => {
    const hourly = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 18 ? 2 : 0));
    const r = evaluateExistingPv({ ...base, basis: 'hourly', hourlyKwh: hourly }, OPTS);
    assert.equal(r.annualKwh, 24 * 365);
    assert.equal(r.hourlyKwh?.length, 24);
    const sum = r.monthlyKwh.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(sum - r.annualKwh) < 0.01, 'รายเดือนรวมต้องเท่ากับทั้งปี');
    // เดือนที่แดดดีต้องมากกว่าเดือนฝน ไม่ใช่แบนราบตามจำนวนวัน
    assert.ok(r.monthlyKwh[2] > r.monthlyKwh[8]);
  });

  it('เลือกว่ามีข้อมูลแต่กรอกไม่ครบ ต้องถอยไปใช้การประมาณ ไม่ใช่ได้ศูนย์', () => {
    const r = evaluateExistingPv({ ...base, basis: 'monthly', monthlyKwh: [] }, OPTS);
    assert.ok(r.annualKwh > 0);
    assert.match(r.note, /ประมาณจาก/);
  });
});

describe('รายเดือนต้องรวมได้เท่ากับทั้งปีเสมอ', () => {
  it('กรณีประมาณ', () => {
    const r = evaluateExistingPv({ ...base, acKw: 7.7 }, OPTS);
    const sum = r.monthlyKwh.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(sum - r.annualKwh) < 0.01);
    assert.equal(r.monthlyKwh.length, 12);
  });
});

describe('กำลัง AC รวมสาย', () => {
  it('บวกระบบใหม่กับระบบเดิม และคิดสัดส่วนต่อหม้อแปลง', () => {
    const r = combineAcCapacity({ newAcKw: 20, existingAcKw: 10, transformerKva: 250 });
    assert.equal(r.totalAcKw, 30);
    assert.equal(r.transformerLoadPercent, 12);
    assert.equal(r.overThreshold, false);
  });

  it('เกิน 80% ของหม้อแปลงต้องยกธงให้ไปคุยกับการไฟฟ้าก่อน', () => {
    const r = combineAcCapacity({ newAcKw: 150, existingAcKw: 60, transformerKva: 250 });
    assert.ok(r.transformerLoadPercent !== null && r.transformerLoadPercent > 80);
    assert.equal(r.overThreshold, true);
  });

  it('ไม่ระบุหม้อแปลง = ไม่เดาสัดส่วน คืน null ไม่ใช่ 0', () => {
    // 0 กับ null ต่างกัน — 0 แปลว่า "ตรวจแล้วไม่มีปัญหา" ซึ่งเราไม่ได้ตรวจ
    const r = combineAcCapacity({ newAcKw: 10, existingAcKw: 5 });
    assert.equal(r.transformerLoadPercent, null);
    assert.equal(r.overThreshold, false);
  });
});
