'use client';

import { useMemo, useState } from 'react';
import type { ExistingPvInput, SimpleUserType, SolarRegion } from '@proinventive/solar-engine';
import {
  CALC_DEFAULTS,
  MIN_BILL,
  PANEL_OPTIONS,
  REGION_OPTIONS,
  USER_TYPE_OPTIONS,
  computeQuote,
} from '@/lib/quote';
import { fmt } from '@/lib/format';
import type { AdvancedOverrides } from '@/lib/advanced';
import AdvancedSettings from './AdvancedSettings';
import ExistingSystemFields from './ExistingSystemFields';
import ResultPanel from './ResultPanel';
import ChartsSection from './ChartsSection';
import LeadModal from './LeadModal';

export default function Calculator() {
  const [billText, setBillText] = useState('4500');
  const [userType, setUserType] = useState<SimpleUserType>('home');
  const [dayPercent, setDayPercent] = useState(40);
  const [hasBattery, setHasBattery] = useState(false);
  const [region, setRegion] = useState<SolarRegion>(CALC_DEFAULTS.region);
  const [panelWatt, setPanelWatt] = useState<number>(CALC_DEFAULTS.panelWatt);
  const [advanced, setAdvanced] = useState<AdvancedOverrides>({});
  const [hasExisting, setHasExisting] = useState(false);
  // เก็บค่าที่กรอกไว้แม้ปิดเช็คบ็อกซ์ — ปิดแล้วเปิดใหม่ต้องไม่ต้องกรอกซ้ำทั้งชุด
  const [existing, setExisting] = useState<ExistingPvInput>({
    acKw: 0,
    basis: 'estimate',
    hasAntiBackflow: false,
    degradationPercent: 0.5,
  });
  const [modalOpen, setModalOpen] = useState(false);

  const bill = Number.parseFloat(billText);
  const billValid = Number.isFinite(bill) && bill >= MIN_BILL;

  const quote = useMemo(() => {
    if (!billValid) return null;
    return computeQuote({
      monthlyBill: bill,
      userType,
      daylightRatio: dayPercent / 100,
      hasBattery,
      region,
      panelWatt,
      advanced,
      ...(hasExisting ? { existing } : {}),
    });
  }, [billValid, bill, userType, dayPercent, hasBattery, region, panelWatt, advanced, hasExisting, existing]);

  return (
    <>
      <div className="grid">
        {/* ===== 1. Input ===== */}
        <div className="card">
          <h2>
            <span className="num">1</span> ข้อมูลการใช้ไฟของคุณ
          </h2>

          <div className="field">
            <label htmlFor="bill">ค่าไฟเฉลี่ยต่อเดือน (บาท)</label>
            <input
              type="number"
              id="bill"
              min={MIN_BILL}
              step={100}
              value={billText}
              aria-invalid={!billValid}
              aria-describedby={billValid ? undefined : 'bill-error'}
              onChange={(e) => setBillText(e.target.value)}
            />
            {!billValid && (
              <div className="field-error" id="bill-error" role="alert">
                กรอกค่าไฟตั้งแต่ {fmt(MIN_BILL)} บาทขึ้นไป
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="userType">
              ประเภทผู้ใช้ไฟ <span className="hint">(ดูจากบิลค่าไฟ)</span>
            </label>
            <select
              id="userType"
              value={userType}
              onChange={(e) => setUserType(e.target.value as SimpleUserType)}
            >
              {USER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="region">
              พื้นที่ติดตั้ง <span className="hint">(กำหนดฤดูกาลของผลผลิต)</span>
            </label>
            <select
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value as SolarRegion)}
            >
              {REGION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="dayRatio">
              สัดส่วนใช้ไฟช่วงกลางวัน <span className="hint">(08:00–16:00)</span>
            </label>
            <div className="slider-row">
              <input
                type="range"
                id="dayRatio"
                min={10}
                max={90}
                step={5}
                value={dayPercent}
                onChange={(e) => setDayPercent(Number(e.target.value))}
              />
              <span className="slider-val" aria-live="polite">
                {dayPercent}%
              </span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="panelWatt">
              ขนาดแผงที่ใช้ <span className="hint">(กำหนดจำนวนแผงและพื้นที่หลังคา)</span>
            </label>
            <select
              id="panelWatt"
              value={panelWatt}
              onChange={(e) => setPanelWatt(Number(e.target.value))}
            >
              {PANEL_OPTIONS.map((o) => (
                <option key={o.watt} value={o.watt}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field toggle-row">
            <label htmlFor="hasBatt">
              ติดแบตเตอรี่ด้วย (ระบบ Hybrid)
              <br />
              <span className="hint">ใช้ไฟที่ผลิตได้ตอนกลางคืน</span>
            </label>
            <span className="switch">
              <input
                type="checkbox"
                id="hasBatt"
                checked={hasBattery}
                onChange={(e) => setHasBattery(e.target.checked)}
              />
              <span className="track" />
              <span className="knob" />
            </span>
          </div>

          {quote && (
            <div className="assumption">
              จากบิลนี้ประมาณการใช้ไฟ <b>{fmt(quote.estimate.monthlyUnits)} หน่วย/เดือน</b>
              {quote.estimate.demandKw > 0 && (
                <>
                  {' '}
                  · Demand <b>{fmt(quote.estimate.demandKw, 1)} kW</b> (Load Factor 0.4)
                </>
              )}
              <br />
              {quote.estimate.rateDescription}
              <br />
              ค่าไฟที่ประหยัดได้จริง <b>{fmt(quote.effectiveSavingTariff, 2)} บาท/หน่วย</b>
              {quote.tariff - quote.effectiveSavingTariff > 0.01 && (
                <span className="hint">
                  {' '}
                  (หน่วยแรก ๆ ลดได้ {fmt(quote.tariff, 2)} บาท แล้วไหลลงขั้นที่ถูกกว่า)
                </span>
              )}
            </div>
          )}
          <div className="field toggle-row">
            <label htmlFor="hasExisting">
              ระบบออนกริดเดิม (AC Coupling)
              <br />
              <span className="hint">มีระบบโซลาร์อยู่แล้ว กำลังจะเติมแบตเตอรี่เข้าไป</span>
            </label>
            <span className="switch">
              <input
                type="checkbox"
                id="hasExisting"
                checked={hasExisting}
                onChange={(e) => setHasExisting(e.target.checked)}
              />
              <span className="track" />
              <span className="knob" />
            </span>
          </div>

          {hasExisting && (
            <ExistingSystemFields value={existing} onChange={setExisting} quote={quote} />
          )}

          <AdvancedSettings
            values={advanced}
            onChange={setAdvanced}
            hasBattery={hasBattery}
            showLoadFactor={userType === 'medium'}
          />
        </div>

        {/* ===== 2. Results ===== */}
        <div className="card">
          <h2>
            <span className="num">2</span> ผลการวิเคราะห์เบื้องต้น
          </h2>
          <ResultPanel quote={quote} onRequestReport={() => setModalOpen(true)} />
        </div>
      </div>

      {quote && <ChartsSection quote={quote} />}

      {modalOpen && quote && <LeadModal quote={quote} onClose={() => setModalOpen(false)} />}
    </>
  );
}
