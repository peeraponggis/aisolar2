'use client';

import { REGION_LABEL } from '@proinventive/solar-engine';
import type { Quote } from '@/lib/quote';
import { fieldDecimals, fieldLabel, fieldUnit, type AdvancedKey } from '@/lib/advanced';
import { HOUSE_BRANDING, type ReportBranding } from '@/lib/branding';
import { rateFieldLabel, rateFieldUnit } from '@/lib/rate-override';
import { baht, fmt, pct } from '@/lib/format';
import DailyProfileChart from '@/components/charts/DailyProfileChart';
import MonthlyYieldChart from '@/components/charts/MonthlyYieldChart';
import CashFlowChart from '@/components/charts/CashFlowChart';
import PrintButton from './PrintButton';
import ReportReady from './ReportReady';

/**
 * รายงานวิเคราะห์ฉบับเต็ม — หน้าเดียวใช้ได้ทั้งดูบนจอและสั่งพิมพ์เป็น PDF
 * เฟส 2 ขั้นถัดไปจะให้ headless browser เปิดหน้านี้แล้ว render เป็นไฟล์ PDF ส่งให้ลูกค้า
 * จึงต้องไม่มีอะไรที่ขึ้นกับการโต้ตอบของผู้ใช้
 */
export default function ReportDocument({
  quote,
  meta,
  branding = HOUSE_BRANDING,
}: {
  quote: Quote;
  meta: { customerName?: string; issuedAt: string; source: 'preview' | 'snapshot' };
  /** ตราของผู้ออกรายงาน — ไม่ส่งมา = ใช้ตราของเรา */
  branding?: ReportBranding;
}) {
  const { sizing, finance, monthly, estimate, priceRange } = quote;
  // แสดงค่าที่ใช้คำนวณจริง ไม่ใช่ค่ามาตรฐาน — รายงานที่ปรับสมมติฐานแล้วต้องบอกให้ตรง
  const used = quote.assumptions;
  const cpw = Object.values(used.costPerWatt).reduce((a, b) => a + b, 0);
  const changed = Object.entries(quote.changedAssumptions) as [AdvancedKey, number][];
  const changedRates = Object.entries(quote.changedRates ?? {});

  return (
    <div className="report">
      <ReportReady />
      <header className="report-head">
        <div className="brand">
          {/* ใช้ logo-doc (360px) ไม่ใช่ logo-header เพราะรายงานถูกพิมพ์ลงกระดาษที่ความละเอียดสูงกว่าจอ */}
          {/* ใช้ <img> ไม่ใช่ next/image เพราะโลโก้ของช่างมาจากโดเมน Supabase
              ที่ไม่ได้อยู่ใน remotePatterns และเป็นภาพขนาดเล็กที่ไม่ต้องปรับขนาด */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark doc" src={branding.logoUrl} alt={branding.name} />
          <div>
            {branding.name}
            <small>{branding.tagline}</small>
            {branding.contactLine && <small>{branding.contactLine}</small>}
          </div>
        </div>
        <div className="report-meta">
          {meta.customerName && (
            <div>
              <span>ลูกค้า</span> {meta.customerName}
            </div>
          )}
          <div>
            <span>วันที่ออกรายงาน</span> {meta.issuedAt}
          </div>
          <div>
            <span>พื้นที่</span> {REGION_LABEL[quote.input.region]}
          </div>
        </div>
        <PrintButton />
      </header>

      {/* ---------- 1. สรุปผู้บริหาร ---------- */}
      <section className="report-section">
        <h2>1. สรุปผลการวิเคราะห์</h2>
        <div className={`verdict ${finance.isFeasible ? 'good' : 'bad'}`}>
          <div>
            <div className="big">
              {finance.paybackYears === null
                ? `ไม่คืนทุนภายใน ${used.years} ปี`
                : `คืนทุน ${finance.paybackYears.toFixed(1)} ปี`}
            </div>
            <div className="sub">
              เกณฑ์ {finance.projectCategory} — คุ้มค่าเมื่อคืนทุนไม่เกิน {finance.paybackThreshold} ปี
            </div>
          </div>
        </div>

        <table className="kv">
          <tbody>
            <tr>
              <th>ขนาดระบบที่แนะนำ</th>
              <td>
                {sizing.actualKwp.toFixed(2)} kWp ({fmt(sizing.panelsNeeded)} แผง ×{' '}
                {quote.input.panelWatt} W)
              </td>
              <th>อินเวอร์เตอร์</th>
              <td>
                {fmt(sizing.invertersNeeded)} ตัว × {used.inverterSizeKw} kW
              </td>
            </tr>
            <tr>
              <th>ระบบแบตเตอรี่</th>
              <td>
                {quote.input.hasBattery
                  ? `${fmt(sizing.batteryCapacityKwh)} kWh (${fmt(quote.batteryUnits)} ก้อน)`
                  : 'ไม่มี — ระบบ On-grid'}
              </td>
              <th>ผลผลิตปีแรก</th>
              <td>
                {fmt(monthly.totalKwh)} kWh ({fmt(monthly.specificYield)} kWh/kWp/ปี)
              </td>
            </tr>
            {quote.existingPv && quote.combinedAc && (
              <tr>
                <th>ระบบออนกริดเดิม (AC Coupling)</th>
                <td>
                  {fmt(quote.existingPv.acKw, 2)} kW · {fmt(quote.existingPv.annualKwh)} kWh/ปี
                </td>
                <th>กำลัง AC รวมสาย</th>
                <td>
                  {fmt(quote.combinedAc.totalAcKw, 2)} kW
                  {quote.combinedAc.transformerLoadPercent !== null &&
                    ` (${fmt(quote.combinedAc.transformerLoadPercent, 1)}% ของหม้อแปลง ${fmt(quote.combinedAc.transformerKva, 0)} kVA)`}
                </td>
              </tr>
            )}
            <tr>
              <th>ช่วงราคาตลาด (รวม VAT)</th>
              <td>
                {baht(priceRange.low)} – {baht(priceRange.high)}
              </td>
              <th>ประหยัดปีแรก</th>
              <td>{baht(quote.firstYearSaving)} / ปี</td>
            </tr>
            <tr>
              <th>NPV @ WACC {fmt(used.wacc * 100, 1)}%</th>
              <td>{baht(finance.npv)}</td>
              <th>IRR</th>
              <td>{pct(finance.irr)}</td>
            </tr>
            <tr>
              <th>LCOE</th>
              <td>{fmt(finance.lcoe, 2)} บาท/หน่วย</td>
              <th>ค่าไฟที่ประหยัดได้จริง</th>
              <td>{fmt(quote.effectiveSavingTariff, 2)} บาท/หน่วย</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---------- 2. ข้อมูลการใช้ไฟ ---------- */}
      <section className="report-section">
        <h2>2. ข้อมูลการใช้ไฟฟ้าที่ใช้คำนวณ</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>ค่าไฟเฉลี่ยต่อเดือน</th>
              <td>{baht(quote.input.monthlyBill)}</td>
              <th>หน่วยที่ประมาณได้</th>
              <td>{fmt(estimate.monthlyUnits)} หน่วย/เดือน</td>
            </tr>
            <tr>
              <th>อัตราค่าไฟที่ใช้</th>
              <td colSpan={3}>{estimate.rateDescription}</td>
            </tr>
            <tr>
              <th>สัดส่วนใช้ไฟกลางวัน</th>
              <td>{Math.round(quote.input.daylightRatio * 100)}% (08:00–16:00)</td>
              <th>ค่าความต้องการพลังไฟฟ้า</th>
              <td>
                {estimate.demandKw > 0
                  ? `${fmt(estimate.demandKw, 1)} kW (ประมาณจาก Load Factor 0.4)`
                  : 'ไม่คิดในประเภทนี้'}
              </td>
            </tr>
            <tr>
              <th>อัตราส่วนเพิ่ม (ขั้นบนสุด)</th>
              <td>{fmt(estimate.marginalTariff, 4)} บาท/หน่วย</td>
              <th>อัตราเฉลี่ยทั้งบิล</th>
              <td>{fmt(estimate.averageTariff, 4)} บาท/หน่วย</td>
            </tr>
            <tr>
              <th>อัตราประหยัดได้จริง ปีแรก</th>
              <td colSpan={3}>
                {fmt(quote.effectiveSavingTariff, 4)} บาท/หน่วย —
                ลดได้ {fmt(finance.rows[0]?.annualUnitsSaved ?? 0)} หน่วย/ปี คิดเป็น{' '}
                {baht(quote.firstYearSaving)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="foot">
          โซลาร์เซลล์ลดเฉพาะค่าพลังงาน ไม่ลดค่าความต้องการพลังไฟฟ้าและค่าบริการรายเดือน
          เงินประหยัดคิดจากส่วนต่างของบิลจริงสองใบ (ก่อนติดตั้ง − หลังติดตั้ง)
          หน่วยแรก ๆ ที่ลดได้จึงมีค่าเท่าอัตราขั้นบนสุด แล้วไหลลงขั้นที่ถูกกว่าเรื่อย ๆ
          เงินประหยัดจึงไม่มีทางเกินค่าไฟทั้งบิล
        </p>
      </section>

      {/* ---------- 3–5. กราฟ ---------- */}
      <section className="report-section break-before">
        <h2>3. กำลังผลิตและการทำงานของแบตเตอรี่ (24 ชั่วโมง)</h2>
        <DailyProfileChart
          daily={quote.daily}
          hasBattery={quote.input.hasBattery}
          existingSolarKw={quote.existingSolarKw}
        />
        <p className="foot">
          กำลังผลิตสูงสุด {fmt(quote.daily.peakSolarKw, 2)} kW · ผลิตได้เฉลี่ย{' '}
          {fmt(sizing.avgDailyProductionYear1, 1)} kWh/วัน
          {quote.input.hasBattery &&
            (quote.daily.batteryDepletedHour === null
              ? ' · แบตเตอรี่จ่ายไฟได้ตลอดช่วงกลางคืนที่กำหนด'
              : ` · แบตเตอรี่จ่ายไฟได้ถึงประมาณ ${String(quote.daily.batteryDepletedHour).padStart(2, '0')}:00 น.`)}
        </p>
      </section>

      <section className="report-section">
        <h2>4. ผลผลิตพลังงานรายเดือน ปีแรก</h2>
        <MonthlyYieldChart monthly={monthly} existingMonthlyKwh={quote.existingPv?.monthlyKwh} />
        <p className="foot">
          รวมทั้งปี {fmt(monthly.totalKwh)} kWh · เดือนที่ดีที่สุด {monthly.bestMonth.label} (
          {fmt(monthly.bestMonth.productionKwh)} kWh) · ต่ำสุด {monthly.worstMonth.label} (
          {fmt(monthly.worstMonth.productionKwh)} kWh)
          {quote.existingPv && (
            <>
              {' '}
              · รวมระบบเดิม {fmt(quote.existingPv.annualKwh)} kWh เป็น{' '}
              {fmt(quote.totalAnnualKwh)} kWh/ปี
            </>
          )}
        </p>
      </section>

      <section className="report-section break-before">
        <h2>5. กระแสเงินสดสะสม {used.years} ปี</h2>
        <CashFlowChart investment={sizing.sellingPriceVat} rows={finance.rows} />
      </section>

      {/* ---------- 6. ตาราง Cash Flow ---------- */}
      <section className="report-section">
        <h2>6. ตารางกระแสเงินสดรายปี</h2>
        <div className="table-scroll">
          <table className="cashflow">
            <thead>
              <tr>
                <th>ปี</th>
                <th>ผลผลิต (kWh)</th>
                <th>เงินประหยัด (บาท)</th>
                <th>ค่า O&amp;M (บาท)</th>
                <th>กระแสเงินสดสุทธิ</th>
                <th>คิดลดแล้ว</th>
                <th>สะสม</th>
              </tr>
            </thead>
            <tbody>
              <tr className="year-zero">
                <td>0</td>
                <td>–</td>
                <td>–</td>
                <td>–</td>
                <td>{fmt(-sizing.sellingPriceVat)}</td>
                <td>{fmt(-sizing.sellingPriceVat)}</td>
                <td className="neg">{fmt(-sizing.sellingPriceVat)}</td>
              </tr>
              {finance.rows.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td>{fmt(r.annualProductionKwh)}</td>
                  <td>{fmt(r.annualSaving)}</td>
                  <td>{fmt(r.omCost)}</td>
                  <td>{fmt(r.netCashFlow)}</td>
                  <td>{fmt(r.discountedCashFlow)}</td>
                  <td className={r.cumulativeDcf < 0 ? 'neg' : 'pos'}>{fmt(r.cumulativeDcf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- 7. สมมติฐาน ---------- */}
      <section className="report-section">
        <h2>7. สมมติฐานที่ใช้</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>Peak Sun Hours</th>
              <td>{used.psh} ชม./วัน</td>
              <th>Performance Ratio</th>
              <td>{used.pr}</td>
            </tr>
            <tr>
              <th>ต้นทุน EPC</th>
              <td>{fmt(cpw, 2)} บาท/วัตต์</td>
              <th>กำไรส่วนเพิ่ม</th>
              <td>{fmt(used.margin * 100)}%</td>
            </tr>
            <tr>
              <th>ค่าดูแลรักษา (O&amp;M)</th>
              <td>{used.omCostPerWatt} บาท/วัตต์/ปี</td>
              <th>อัตราเสื่อมของแผง</th>
              <td>{fmt(used.degradation * 100, 1)}% ต่อปี</td>
            </tr>
            <tr>
              <th>อัตราคิดลด (WACC)</th>
              <td>{fmt(used.wacc * 100, 1)}%</td>
              <th>อายุการวิเคราะห์</th>
              <td>{used.years} ปี</td>
            </tr>
            <tr>
              <th>ค่า Ft</th>
              <td>{used.ft} บาท/หน่วย</td>
              <th>อินเวอร์เตอร์ต่อตัว</th>
              <td>{used.inverterSizeKw} kW</td>
            </tr>
          </tbody>
        </table>

        {changedRates.length > 0 && (
          <>
            <p className="foot" style={{ marginTop: 14, marginBottom: 6 }}>
              <b>อัตราค่าไฟที่แก้จากประกาศมาตรฐาน {changedRates.length} รายการ</b> —
              ผู้จัดทำรายงานระบุอัตราเอง ไม่ใช่อัตราที่ระบบถืออยู่
            </p>
            <table className="kv">
              <tbody>
                {changedRates.map(([key, value]) => (
                  <tr key={key}>
                    <th>{rateFieldLabel(key)}</th>
                    <td colSpan={3}>
                      {fmt(value, 4)} {rateFieldUnit(key)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {changed.length > 0 && (
          <>
            <p className="foot" style={{ marginTop: 14, marginBottom: 6 }}>
              <b>สมมติฐานที่ปรับจากค่ามาตรฐาน {changed.length} รายการ</b> —
              ตัวเลขในรายงานนี้คำนวณจากค่าที่ปรับแล้ว ไม่ใช่ค่ามาตรฐานของระบบ
            </p>
            <table className="kv">
              <tbody>
                {changed.map(([key, value]) => (
                  <tr key={key}>
                    <th>{fieldLabel(key)}</th>
                    <td colSpan={3}>
                      {fmt(value, fieldDecimals(key))} {fieldUnit(key)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="foot">
          รายงานนี้เป็นการประมาณการเบื้องต้นเพื่อใช้เปรียบเทียบข้อเสนอ ไม่ใช่ใบเสนอราคา
          ตัวเลขจริงขึ้นกับการสำรวจหน้างาน โครงสร้างหลังคา ระยะเดินสาย เงื่อนไขการเชื่อมต่อกับการไฟฟ้า
          และอัตราค่าไฟที่บังคับใช้ ณ เวลาติดตั้ง · รูปทรงผลผลิตรายเดือนเป็นค่าเฉลี่ยระดับภาค
          ไม่ใช่ข้อมูลรายจังหวัด
          {meta.source === 'preview' && ' · รายงานพรีวิว คำนวณจากอินพุตในลิงก์'}
          {branding.showPoweredBy && ' · คำนวณด้วยระบบ PROINVENTIVE Solar'}
        </p>
      </section>
    </div>
  );
}
