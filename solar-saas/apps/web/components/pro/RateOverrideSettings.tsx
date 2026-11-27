'use client';

import { useId, useState } from 'react';
import type { SimpleUserType } from '@proinventive/solar-engine';
import { rateGroupsFor, type RateOverrideValues } from '@/lib/rate-override';

/**
 * แก้อัตราค่าไฟ กฟภ. รายโครงการ
 *
 * โผล่เฉพาะฝั่งช่าง และแสดงเฉพาะอัตราของประเภทผู้ใช้ไฟที่โครงการนั้นเลือก
 * ช่องที่ถูกแก้จะไฮไลต์ไว้ เพราะการแก้อัตราค่าไฟกระทบตัวเลขทั้งรายงาน
 * ต้องเห็นชัดว่าตัวไหนไม่ใช่อัตราประกาศ
 */
export default function RateOverrideSettings({
  userType,
  values,
  onChange,
}: {
  userType: SimpleUserType;
  values: RateOverrideValues;
  onChange: (next: RateOverrideValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const groups = rateGroupsFor(userType);

  const changed = groups
    .flatMap((g) => g.fields)
    .filter((f) => values[f.key] !== undefined && Math.abs(values[f.key] - f.fallback) > 1e-9);

  const set = (key: string, raw: string) => {
    const next = { ...values };
    if (raw === '') delete next[key];
    else next[key] = Number(raw);
    onChange(next);
  };

  return (
    <div className="advanced">
      <button
        type="button"
        className="advanced-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        แก้อัตราค่าไฟ กฟภ. ของโครงการนี้
        {changed.length > 0 && <span className="changed-badge">แก้แล้ว {changed.length} ค่า</span>}
      </button>

      <div id={panelId} hidden={!open}>
        <p className="advanced-intro">
          ใช้เมื่อ กฟภ. ประกาศอัตราใหม่ก่อนที่ระบบจะอัปเดต — อัตราที่แก้มีผลเฉพาะโครงการนี้
          ไม่กระทบโครงการอื่นหรือของช่างคนอื่น ช่วงหน่วยของแต่ละขั้นคงเดิม แก้ได้เฉพาะอัตรา
        </p>

        {groups.map((group) => (
          <fieldset className="advanced-group" key={group.id}>
            <legend>{group.title}</legend>
            {group.note && <p className="group-note">{group.note}</p>}
            <div className="advanced-grid">
              {group.fields.map((f) => {
                const current = values[f.key];
                const isChanged = current !== undefined && Math.abs(current - f.fallback) > 1e-9;
                return (
                  <div className={`field${isChanged ? ' changed' : ''}`} key={f.key}>
                    <label htmlFor={`rate-${f.key}`}>
                      {f.label} <span className="hint">({f.unit})</span>
                    </label>
                    <input
                      id={`rate-${f.key}`}
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={current ?? f.fallback}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                    {isChanged && (
                      <button type="button" className="reset-one" onClick={() => set(f.key, '')}>
                        คืนค่าประกาศ {f.fallback}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        {changed.length > 0 && (
          <button type="button" className="cta secondary" onClick={() => onChange({})}>
            คืนอัตราประกาศทั้งหมด
          </button>
        )}
      </div>
    </div>
  );
}
