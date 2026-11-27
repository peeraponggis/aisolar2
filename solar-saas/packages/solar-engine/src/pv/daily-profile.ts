import type { DailyProfileInput, DailyProfileResult, DailyProfilePoint } from '../types.ts';

/**
 * ประสิทธิภาพรอบชาร์จ-จ่าย คิดครั้งเดียวตอนชาร์จ (จ่ายออก 1:1)
 * ให้ตรงกับ analyzeFinance() ที่คิด charged x 0.9 ครั้งเดียวเช่นกัน
 */
const BATTERY_ROUND_TRIP = 0.9;
/** Depth of Discharge — พลังงานที่ใช้ได้จริงเทียบความจุป้าย (ตรงกับ sizePvSystem) */
const BATTERY_USABLE = 0.9;

/** ค่าเริ่มต้นของหน้าต่างเวลา — ตรงกับ DEFAULT_PEA_RATES.pv และคำถามในฟอร์ม */
export const DEFAULT_DAY_WINDOW = {
  sunriseHour: 6,
  sunsetHour: 18,
  /** ช่วงที่ถือว่าเป็นโหลดกลางวัน — ต้องตรงกับที่ถามผู้ใช้ว่า "สัดส่วนใช้ไฟช่วงกลางวัน" */
  loadDayStartHour: 8,
  loadDayEndHour: 16,
  /** ช่วง Peak Sun Hours ที่ยอมให้ชาร์จแบตเตอรี่ */
  pshStartHour: 9,
  pshEndHour: 15,
} as const;

/**
 * จำลองการทำงานของระบบ 24 ชั่วโมง — กำลังผลิตโซลาร์ โหลด และการชาร์จ/จ่ายของแบตเตอรี่
 *
 * โมเดลกำลังผลิตเป็นครึ่งไซน์ระหว่างพระอาทิตย์ขึ้น–ตก ปรับสเกลให้พื้นที่ใต้กราฟ
 * เท่ากับพลังงานที่ผลิตได้ต่อวันพอดี (P_peak = E·π / 2D) — สูตรเดียวกับกราฟใน V4.1
 * แต่แยกหน้าต่าง "โหลดกลางวัน" ออกจาก "ช่วงมีแดด" เพื่อให้ตรงกับคำถามในฟอร์ม
 * (V4.1 กระจายโหลดกลางวันทั้ง 06:00–18:00 ทั้งที่ถามผู้ใช้ว่า 08:00–16:00)
 *
 * ลูปเริ่มที่พระอาทิตย์ขึ้นเพื่อให้ SOC เริ่มจากศูนย์ตอนเช้า แล้ววนครบ 24 ชั่วโมง
 */
export function simulateDailyProfile(input: DailyProfileInput): DailyProfileResult {
  const w = { ...DEFAULT_DAY_WINDOW, ...input.window };
  const daylightHours = w.sunsetHour - w.sunriseHour;
  const loadDayHours = w.loadDayEndHour - w.loadDayStartHour;
  const loadNightHours = 24 - loadDayHours;

  const peakSolarKw = (input.avgDailyProductionKwh * Math.PI) / (2 * daylightHours);
  const dayLoadKw = loadDayHours > 0 ? input.dayUnitsPerDay / loadDayHours : 0;
  const nightLoadKw = loadNightHours > 0 ? input.nightUnitsPerDay / loadNightHours : 0;

  const hasBattery = input.batteryCapacityKwh > 0;
  /** พลังงานสูงสุดที่แบตจ่ายออกได้จริง — ชาร์จเต็มต้องป้อนพลังงานเข้า maxStored / 0.9 */
  const maxStoredKwh = input.batteryCapacityKwh * BATTERY_USABLE;
  const points: DailyProfilePoint[] = Array.from({ length: 25 }, (_, hour) => ({
    hour,
    solarKw: 0,
    loadKw: 0,
    chargeKw: 0,
    dischargeKw: 0,
    socKwh: 0,
  }));

  let soc = 0;
  let batteryDepletedHour: number | null = null;

  for (let step = w.sunriseHour; step < w.sunriseHour + 24; step++) {
    const h = step % 24;
    const p = points[h];

    const inDaylight = h >= w.sunriseHour && h <= w.sunsetHour;
    p.solarKw = inDaylight
      ? peakSolarKw * Math.sin((Math.PI * (h - w.sunriseHour)) / daylightHours)
      : 0;

    const inDayLoad = h >= w.loadDayStartHour && h < w.loadDayEndHour;
    p.loadKw = inDayLoad ? dayLoadKw : nightLoadKw;

    const surplus = p.solarKw - p.loadKw;

    if (hasBattery) {
      if (surplus > 0) {
        // ชาร์จได้เฉพาะช่วง PSH ที่แดดนิ่งพอ
        if (h >= w.pshStartHour && h <= w.pshEndHour) {
          const toCharge = Math.min(surplus, (maxStoredKwh - soc) / BATTERY_ROUND_TRIP);
          soc += toCharge * BATTERY_ROUND_TRIP;
          p.chargeKw = toCharge;
        }
      } else {
        const demand = -surplus;
        const beforePsh = h < w.pshStartHour && input.allowDischargeBeforePsh;
        const afterPsh = h > w.pshEndHour && input.allowDischargeAfterPsh;

        if ((beforePsh || afterPsh) && soc > 0) {
          // จ่ายออก 1:1 เพราะหักประสิทธิภาพไปแล้วตอนชาร์จ (V4.1 หักซ้ำอีกครั้งที่นี่)
          const toDischarge = Math.min(demand, soc);
          soc -= toDischarge;
          p.dischargeKw = -toDischarge;
        } else if ((beforePsh || afterPsh) && soc <= 0 && batteryDepletedHour === null) {
          // นับเฉพาะรอบเย็น–กลางคืน (หลัง PSH เป็นต้นไป) ไม่ใช่ตอนเช้าที่แบตยังไม่ได้ชาร์จ
          if (step > w.pshEndHour) batteryDepletedHour = h;
        }
      }
    }

    p.socKwh = soc;
  }

  // ปิดกราฟให้บรรจบที่ 24:00 = 00:00
  points[24] = { ...points[0], hour: 24 };

  return {
    points,
    peakSolarKw,
    batteryDepletedHour,
    window: w,
  };
}
