'use client';

import Link from 'next/link';
import { baht, fmt, pct } from '@/lib/format';
import type { Quote } from '@/lib/quote';
import { reportHref } from '@/lib/report-link';

export default function ResultPanel({
  quote,
  onRequestReport,
}: {
  quote: Quote | null;
  onRequestReport: () => void;
}) {
  if (!quote) {
    return (
      <p className="placeholder">กรอกค่าไฟต่อเดือนทางซ้าย แล้วผลวิเคราะห์จะแสดงที่นี่ทันที</p>
    );
  }

  const { sizing, finance, priceRange, assumptions } = quote;
  const feasible = finance.isFeasible;
  const paybackText =
    finance.paybackYears === null
      ? `เกิน ${assumptions.years} ปี`
      : `คืนทุน ${finance.paybackYears.toFixed(1)} ปี`;

  return (
    <>
      <div className={`verdict ${feasible ? 'good' : 'bad'}`} role="status">
        <div>
          <div className="big">{paybackText}</div>
          <div className="sub">
            {feasible
              ? `คุ้มค่าตามเกณฑ์ ${finance.projectCategory} (≤ ${finance.paybackThreshold} ปี)`
              : `เกินเกณฑ์ ${finance.projectCategory} (> ${finance.paybackThreshold} ปี) — ลองปรับสัดส่วนใช้ไฟกลางวัน`}
          </div>
        </div>
      </div>

      <div className="price-band">
        <div className="k">ช่วงราคาตลาดโดยประมาณ (รวม VAT)</div>
        <div className="range">
          {baht(priceRange.low)} – {baht(priceRange.high)}
        </div>
        <div className="sub">
          ราคาจริงขึ้นกับหน้างาน — ระยะเดินสาย ชนิดหลังคา และอุปกรณ์ป้องกัน ใช้ช่วงนี้เป็นฐานเทียบใบเสนอราคา
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="k">ขนาดระบบแนะนำ</div>
          <div className="v">
            {sizing.actualKwp.toFixed(2)} <small>kWp</small>
            {quote.batteryUnits > 0 && (
              <>
                <br />
                <small>+แบต {fmt(sizing.batteryCapacityKwh)} kWh</small>
              </>
            )}
          </div>
        </div>
        <div className="metric">
          <div className="k">จำนวนแผง ({quote.input.panelWatt}W)</div>
          <div className="v">
            {fmt(sizing.panelsNeeded)} <small>แผง</small>
          </div>
        </div>
        <div className="metric">
          <div className="k">ประหยัดปีแรก</div>
          <div className="v">
            {baht(quote.firstYearSaving)}
            <small>/ปี</small>
          </div>
        </div>
        <div className="metric">
          <div className="k">IRR</div>
          <div className="v">{pct(finance.irr)}</div>
        </div>
        <div className="metric">
          <div className="k">ประหยัดรวม {assumptions.years} ปี</div>
          <div className="v">{baht(quote.totalSaving)}</div>
        </div>
        <div className="metric">
          <div className="k">NPV</div>
          <div className="v">{baht(finance.npv)}</div>
        </div>
        <div className="metric">
          <div className="k">LCOE</div>
          <div className="v">
            {fmt(finance.lcoe, 2)} <small>บาท/หน่วย</small>
          </div>
        </div>
        <div className="metric">
          <div className="k">ผลผลิตต่อปี{quote.existingPv ? ' (ระบบใหม่)' : ''}</div>
          <div className="v">
            {fmt(quote.monthly.totalKwh)} <small>kWh</small>
          </div>
        </div>
        {quote.existingPv && (
          <>
            <div className="metric">
              <div className="k">ผลผลิตรวมทั้งสองระบบ</div>
              <div className="v">
                {fmt(quote.totalAnnualKwh)} <small>kWh/ปี</small>
                <br />
                <small>ระบบเดิม {fmt(quote.existingPv.annualKwh)} kWh</small>
              </div>
            </div>
            {quote.combinedAc && (
              <div className="metric">
                <div className="k">กำลัง AC รวมสาย</div>
                <div className="v">
                  {fmt(quote.combinedAc.totalAcKw, 2)} <small>kW</small>
                  {quote.combinedAc.transformerLoadPercent !== null && (
                    <>
                      <br />
                      <small className={quote.combinedAc.overThreshold ? 'warn' : undefined}>
                        {fmt(quote.combinedAc.transformerLoadPercent, 1)}% ของหม้อแปลง
                      </small>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {quote.combinedAc?.overThreshold && (
        <div className="notice warn-box" role="status">
          กำลัง AC รวมสายเกิน 80% ของหม้อแปลง — ควรให้การไฟฟ้าตรวจสอบความสามารถของหม้อแปลง
          และขออนุญาตขนานไฟก่อนติดตั้ง
        </div>
      )}

      <button className="cta" type="button" onClick={onRequestReport}>
        📄 รับรายงานวิเคราะห์ฉบับเต็ม (ฟรี)
      </button>
      <Link className="cta secondary" href={reportHref(quote.input)} target="_blank">
        เปิดรายงานฉบับเต็ม (พิมพ์เป็น PDF ได้)
      </Link>
      <div className="cta-note">
        รายงานมีกราฟทั้งหมด · ตาราง Cash Flow รายปี · NPV · LCOE · สมมติฐานที่ใช้ครบ
      </div>
    </>
  );
}
