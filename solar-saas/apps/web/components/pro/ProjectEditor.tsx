'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SimpleUserType, SolarRegion } from '@proinventive/solar-engine';
import {
  CALC_DEFAULTS,
  MIN_BILL,
  PANEL_OPTIONS,
  REGION_OPTIONS,
  USER_TYPE_OPTIONS,
  computeQuote,
  type QuoteInput,
} from '@/lib/quote';
import type { AdvancedOverrides } from '@/lib/advanced';
import type { RateOverrideValues } from '@/lib/rate-override';
import { NEXT_STATUS, PROJECT_STATUS_LABEL, type ProjectStatus } from '@/lib/projects';
import { reportHref } from '@/lib/report-link';
import { fmt } from '@/lib/format';
import AdvancedSettings from '@/components/AdvancedSettings';
import RateOverrideSettings from './RateOverrideSettings';
import ResultPanel from '@/components/ResultPanel';
import ChartsSection from '@/components/ChartsSection';

/**
 * หน้าแก้โปรเจกต์ — ใช้ฟอร์มและกราฟชุดเดียวกับหน้าคำนวณฟรี
 *
 * ต่างกันแค่ผลลัพธ์ถูกบันทึกลงตาราง projects และมีสถานะไปป์ไลน์ให้ไล่
 * ตัวเลขที่ช่างเห็นจึงเป็นชุดเดียวกับที่ลูกค้าเห็นเป๊ะ ๆ ไม่มีสองเอนจินให้ดูแลให้ตรงกัน
 */
export default function ProjectEditor({
  projectId,
  initialName,
  initialStatus,
  initialInput,
  leadId,
}: {
  projectId: string;
  initialName: string;
  initialStatus: ProjectStatus;
  initialInput: QuoteInput | null;
  leadId: string | null;
}) {
  const router = useRouter();
  const start = initialInput;

  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<ProjectStatus>(initialStatus);
  const [billText, setBillText] = useState(String(Math.round(start?.monthlyBill ?? 4500)));
  const [userType, setUserType] = useState<SimpleUserType>(start?.userType ?? 'home');
  const [dayPercent, setDayPercent] = useState(Math.round((start?.daylightRatio ?? 0.4) * 100));
  const [hasBattery, setHasBattery] = useState(start?.hasBattery ?? false);
  const [region, setRegion] = useState<SolarRegion>(start?.region ?? CALC_DEFAULTS.region);
  const [panelWatt, setPanelWatt] = useState<number>(start?.panelWatt ?? CALC_DEFAULTS.panelWatt);
  const [advanced, setAdvanced] = useState<AdvancedOverrides>(start?.advanced ?? {});
  const [rateOverride, setRateOverride] = useState<RateOverrideValues>(start?.rateOverride ?? {});

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bill = Number.parseFloat(billText);
  const billValid = Number.isFinite(bill) && bill >= MIN_BILL;

  const input: QuoteInput | null = billValid
    ? {
        monthlyBill: bill,
        userType,
        daylightRatio: dayPercent / 100,
        hasBattery,
        region,
        panelWatt,
        advanced,
        rateOverride,
      }
    : null;

  const quote = useMemo(() => (input ? computeQuote(input) : null), [
    billValid,
    bill,
    userType,
    dayPercent,
    hasBattery,
    region,
    panelWatt,
    advanced,
    rateOverride,
  ]);

  async function patch(payload: Record<string, unknown>, label: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pro/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'บันทึกไม่สำเร็จ');
        return false;
      }
      setSavedAt(label);
      router.refresh();
      return true;
    } catch {
      setError('เชื่อมต่อไม่ได้');
      return false;
    } finally {
      setSaving(false);
    }
  }

  const save = () => patch({ customerName: name, input }, new Date().toLocaleTimeString('th-TH'));

  async function changeStatus(next: ProjectStatus) {
    if (await patch({ status: next }, new Date().toLocaleTimeString('th-TH'))) setStatus(next);
  }

  return (
    <>
      <div className="project-bar">
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label htmlFor="customerName">ชื่อลูกค้า</label>
          <input
            id="customerName"
            type="text"
            value={name}
            minLength={2}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="project-status">
          <span className={`pay-status ${status === 'won' ? 'confirmed' : status === 'lost' ? 'failed' : 'pending'}`}>
            {PROJECT_STATUS_LABEL[status]}
          </span>
          {NEXT_STATUS[status].map((next) => (
            <button key={next} type="button" className="status-btn" disabled={saving} onClick={() => changeStatus(next)}>
              → {PROJECT_STATUS_LABEL[next]}
            </button>
          ))}
        </div>
      </div>

      <div className="project-actions">
        <button className="cta" type="button" disabled={saving || !billValid} onClick={save}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกโปรเจกต์'}
        </button>
        {input && (
          <Link className="cta secondary" href={reportHref(input)} target="_blank">
            เปิดรายงาน
          </Link>
        )}
        <Link className="cta secondary" href={`/api/pro/projects/${projectId}/pdf`}>
          ดาวน์โหลด PDF
        </Link>
        {leadId && (
          <Link className="cta secondary" href={`/report/${leadId}`} target="_blank">
            รายงานต้นฉบับของ lead
          </Link>
        )}
      </div>
      {savedAt && <div className="form-status ok">บันทึกแล้วเมื่อ {savedAt}</div>}
      {error && <div className="form-status err" role="alert">{error}</div>}

      <div className="grid" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>
            <span className="num">1</span> ข้อมูลการใช้ไฟของลูกค้า
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
              onChange={(e) => setBillText(e.target.value)}
            />
            {!billValid && (
              <div className="field-error" role="alert">
                กรอกค่าไฟตั้งแต่ {fmt(MIN_BILL)} บาทขึ้นไป
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="userType">ประเภทผู้ใช้ไฟ</label>
            <select id="userType" value={userType} onChange={(e) => setUserType(e.target.value as SimpleUserType)}>
              {USER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="region">พื้นที่ติดตั้ง</label>
            <select id="region" value={region} onChange={(e) => setRegion(e.target.value as SolarRegion)}>
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
              <span className="slider-val">{dayPercent}%</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="panelWatt">ขนาดแผงที่ใช้</label>
            <select id="panelWatt" value={panelWatt} onChange={(e) => setPanelWatt(Number(e.target.value))}>
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

          <AdvancedSettings
            values={advanced}
            onChange={setAdvanced}
            hasBattery={hasBattery}
            showLoadFactor={userType === 'medium'}
          />

          <RateOverrideSettings
            userType={userType}
            values={rateOverride}
            onChange={setRateOverride}
          />
        </div>

        <div className="card">
          <h2>
            <span className="num">2</span> ผลการวิเคราะห์
          </h2>
          <ResultPanel quote={quote} onRequestReport={save} />
        </div>
      </div>

      {quote && <ChartsSection quote={quote} />}
    </>
  );
}
