'use client';

import { REGION_LABEL } from '@proinventive/solar-engine';
import type { Quote } from '@/lib/quote';
import { baht, fmt } from '@/lib/format';
import DailyProfileChart from './charts/DailyProfileChart';
import MonthlyYieldChart from './charts/MonthlyYieldChart';
import CashFlowChart from './charts/CashFlowChart';

/** สรุปสถานะแบตเตอรี่เป็นภาษาที่ลูกค้าเข้าใจ */
function batteryNote(quote: Quote): string {
  if (!quote.input.hasBattery) {
    return 'ระบบ On-grid — กลางคืนใช้ไฟจากการไฟฟ้าตามปกติ ไฟที่ผลิตเกินตอนกลางวันจะถูกทิ้ง';
  }
  const depleted = quote.daily.batteryDepletedHour;
  if (depleted === null) {
    return `แบตเตอรี่ ${fmt(quote.sizing.batteryCapacityKwh)} kWh จ่ายไฟได้ตลอดช่วงกลางคืนที่ตั้งไว้`;
  }
  return `แบตเตอรี่ ${fmt(quote.sizing.batteryCapacityKwh)} kWh จ่ายไฟได้ถึงประมาณ ${String(depleted).padStart(2, '0')}:00 น. หลังจากนั้นใช้ไฟจากการไฟฟ้า`;
}

export default function ChartsSection({ quote }: { quote: Quote }) {
  const { monthly, sizing, finance, assumptions } = quote;

  return (
    <section className="charts">
      <div className="card">
        <h2>
          <span className="num">3</span> กำลังผลิตและการทำงานของแบตเตอรี่ (24 ชั่วโมง)
        </h2>
        <DailyProfileChart
          daily={quote.daily}
          hasBattery={quote.input.hasBattery}
          existingSolarKw={quote.existingSolarKw}
        />
        <div className="chart-note">
          <b>กำลังผลิตสูงสุด {fmt(quote.daily.peakSolarKw, 2)} kW</b> · ผลิตได้เฉลี่ย{' '}
          {fmt(sizing.avgDailyProductionYear1, 1)} kWh/วัน
          {quote.existingPv && (
            <>
              {' '}
              · ระบบเดิมอีก {fmt(quote.existingPv.avgDailyKwh, 1)} kWh/วัน รวมเป็น{' '}
              <b>{fmt(sizing.avgDailyProductionYear1 + quote.existingPv.avgDailyKwh, 1)} kWh/วัน</b>
            </>
          )}
          <br />
          {batteryNote(quote)}
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="num">4</span> ผลผลิตพลังงานรายเดือน ปีแรก (Yields)
        </h2>
        <MonthlyYieldChart monthly={monthly} existingMonthlyKwh={quote.existingPv?.monthlyKwh} />
        <div className="chart-note">
          รวมทั้งปี <b>{fmt(monthly.totalKwh)} kWh</b> · เฉลี่ยเดือนละ {fmt(monthly.avgMonthlyKwh)}{' '}
          kWh · <b>{fmt(monthly.specificYield)} kWh/kWp/ปี</b>
          <br />
          ดีที่สุด {monthly.bestMonth.label} ({fmt(monthly.bestMonth.productionKwh)} kWh) · ต่ำสุด{' '}
          {monthly.worstMonth.label} ({fmt(monthly.worstMonth.productionKwh)} kWh) — รูปทรงฤดูกาลของ
          {REGION_LABEL[quote.input.region]}
          {quote.existingPv && (
            <>
              <br />
              รวมระบบเดิม {fmt(quote.existingPv.annualKwh)} kWh/ปี เป็น{' '}
              <b>{fmt(quote.totalAnnualKwh)} kWh/ปี</b> — ตัวเลขในกราฟเงินสดคิดจาก
              <b>ระบบใหม่เท่านั้น</b> เพราะระบบเดิมหักค่าไฟให้ไปแล้วในบิลที่กรอกมา
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="num">5</span> กระแสเงินสดสะสม {assumptions.years} ปี (คิดลดด้วย WACC{' '}
          {fmt(assumptions.wacc * 100, 1)}%)
        </h2>
        <CashFlowChart investment={sizing.sellingPriceVat} rows={finance.rows} />
        <div className="chart-note">
          แท่งแรกคือเงินลงทุน จากนั้นคือเงินที่ประหยัดได้สะสมหลังหักค่าดูแลรักษา —
          แท่งแรกที่ขึ้นเหนือศูนย์คือจุดคืนทุน
          {finance.paybackYears !== null && (
            <>
              {' '}
              (<b>ปีที่ {finance.paybackYears.toFixed(1)}</b>)
            </>
          )}
          <br />
          NPV {baht(finance.npv)} · LCOE {fmt(finance.lcoe, 2)} บาท/หน่วย เทียบกับค่าไฟที่ประหยัดได้จริง{' '}
          {fmt(quote.effectiveSavingTariff, 2)} บาท/หน่วย
        </div>
      </div>
    </section>
  );
}
