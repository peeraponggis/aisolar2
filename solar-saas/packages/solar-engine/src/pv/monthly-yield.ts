import type { MonthlyYieldInput, MonthlyYieldResult, MonthlyYieldRow, SolarRegion } from '../types.ts';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const MONTH_LABEL_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const REGION_LABEL: Record<SolarRegion, string> = {
  central: 'ภาคกลาง / ตะวันออก / ตะวันตก',
  north: 'ภาคเหนือ',
  northeast: 'ภาคตะวันออกเฉียงเหนือ',
  south: 'ภาคใต้',
};

/**
 * ตัวคูณความเข้มแสงรายเดือน (สัดส่วนเทียบค่าเฉลี่ยทั้งปี — รวม 12 เดือน = 12.00 พอดี)
 *
 * ค่านี้กำหนด "รูปทรงฤดูกาล" ของกราฟผลผลิต ส่วน "ระดับ" มาจาก PSH ที่ผู้ใช้กรอก
 * จึงปรับ PSH รายพื้นที่ได้โดยไม่กระทบรูปทรง
 *
 * ที่มา: รูปแบบค่าเฉลี่ยความเข้มรังสีรวมรายเดือนของไทย — ฤดูร้อน (ก.พ.–เม.ย.) สูงสุด
 * ฤดูฝน/มรสุม (ก.ค.–ต.ค.) ต่ำสุด ภาคเหนือมีหมอกควันช่วง มี.ค. ภาคใต้แกว่งน้อยกว่าเพราะมี 2 มรสุม
 *
 * ⚠ เป็นค่าประมาณระดับภาค ไม่ใช่ข้อมูลรายจังหวัด — เฟสถัดไปควรแทนด้วยชุดข้อมูลจริง
 * (DEDE solar map หรือ NASA POWER รายพิกัด) โดยแก้เฉพาะไฟล์นี้ที่เดียว
 */
export const MONTHLY_PSH_FACTOR: Record<SolarRegion, number[]> = {
  central:   [1.02, 1.08, 1.10, 1.10, 1.00, 0.96, 0.95, 0.94, 0.92, 0.94, 0.99, 1.00],
  north:     [1.05, 1.12, 1.10, 1.08, 0.99, 0.95, 0.92, 0.90, 0.92, 0.96, 1.00, 1.01],
  northeast: [1.03, 1.09, 1.12, 1.11, 1.00, 0.95, 0.94, 0.92, 0.91, 0.95, 0.99, 0.99],
  south:     [1.02, 1.06, 1.09, 1.07, 1.02, 1.00, 0.99, 0.98, 0.96, 0.94, 0.92, 0.95],
};

/**
 * ผลผลิตพลังงานรายเดือนตลอด 1 ปี
 *
 * ต่างจาก V4.1 ที่คิด "ผลผลิตเฉลี่ยต่อวัน × จำนวนวันในเดือน" ทำให้กราฟแบนราบ
 * ต่างกันแค่ 28/30/31 วัน — ที่นี่คูณตัวคูณฤดูกาลด้วย กราฟจึงมีรูปทรงจริง
 * และเทียบกับตัวเลขของผู้ติดตั้ง (PVsyst) ได้โดยไม่ขัดสายตา
 */
export function monthlyYield(input: MonthlyYieldInput): MonthlyYieldResult {
  // fallback กันหน้าเว็บล่มถ้า region มาผิด (เช่นจาก payload เก่าที่ยังไม่มีฟิลด์นี้)
  const factors = MONTHLY_PSH_FACTOR[input.region] ?? MONTHLY_PSH_FACTOR.central;
  const degradationFactor = Math.pow(1 - (input.degradation ?? 0), (input.year ?? 1) - 1);

  const rows: MonthlyYieldRow[] = factors.map((factor, i) => {
    const days = DAYS_IN_MONTH[i];
    return {
      month: i + 1,
      label: MONTH_LABEL_TH[i],
      days,
      factor,
      productionKwh: input.avgDailyProductionKwh * degradationFactor * factor * days,
    };
  });

  const totalKwh = rows.reduce((sum, r) => sum + r.productionKwh, 0);
  let best = rows[0];
  let worst = rows[0];
  for (const r of rows) {
    if (r.productionKwh > best.productionKwh) best = r;
    if (r.productionKwh < worst.productionKwh) worst = r;
  }

  return {
    rows,
    totalKwh,
    avgMonthlyKwh: totalKwh / 12,
    bestMonth: best,
    worstMonth: worst,
    /** kWh ที่ผลิตได้ต่อ kWp ต่อปี — ตัวเลขที่ใช้เทียบกับใบเสนอราคาของผู้ติดตั้ง */
    specificYield: input.installedKwp > 0 ? totalKwh / input.installedKwp : Number.NaN,
  };
}
