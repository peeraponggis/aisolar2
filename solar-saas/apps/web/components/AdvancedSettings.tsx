'use client';

import { useId, useState } from 'react';
import {
  ADVANCED_FIELDS,
  ADVANCED_GROUPS,
  advancedDefaults,
  type AdvancedKey,
  type AdvancedOverrides,
} from '@/lib/advanced';

/**
 * โหมดละเอียด — กางกลุ่มสมมติฐานบนหน้าเดิม ไม่ใช่หน้าแยก
 *
 * ทุกช่องเติมค่ามาตรฐานไว้ให้แล้ว ผู้ใช้แก้เฉพาะที่ตัวเองรู้ ที่เหลือปล่อยไว้ได้
 * เปิด/ปิดโหมดนี้ไม่ล้างค่าที่กรอกไว้ และไม่ล้างอินพุตของโหมดเร็ว
 */
export default function AdvancedSettings({
  values,
  onChange,
  hasBattery,
  showLoadFactor,
}: {
  values: AdvancedOverrides;
  onChange: (next: AdvancedOverrides) => void;
  hasBattery: boolean;
  /** Load Factor ใช้เฉพาะประเภท 3 — ประเภทอื่นไม่คิดค่า Demand */
  showLoadFactor: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const defaults = advancedDefaults();

  const changedCount = ADVANCED_FIELDS.filter(
    (f) => values[f.key] !== undefined && Math.abs((values[f.key] as number) - f.fallback) > 1e-9,
  ).length;

  const set = (key: AdvancedKey, raw: string) => {
    const next = { ...values };
    if (raw === '') delete next[key];
    else next[key] = Number(raw);
    onChange(next);
  };

  const visible = (key: AdvancedKey, groupId: string) => {
    if (key === 'loadFactor') return showLoadFactor;
    if (groupId === 'battery') return hasBattery;
    return true;
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
        <span className="chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        ปรับสมมติฐานเอง
        {changedCount > 0 && <span className="changed-badge">แก้แล้ว {changedCount} ค่า</span>}
      </button>

      <div id={panelId} hidden={!open}>
        <p className="advanced-intro">
          ทุกช่องเติมค่ามาตรฐานไว้แล้ว แก้เฉพาะที่คุณรู้ตัวเลขจริง ที่เหลือปล่อยไว้ได้
          ผลวิเคราะห์และกราฟด้านบนจะอัปเดตทันที
        </p>

        {ADVANCED_GROUPS.map((group) => {
          const fields = group.fields.filter((f) => visible(f.key, group.id));
          if (fields.length === 0) return null;
          return (
            <fieldset className="advanced-group" key={group.id}>
              <legend>{group.title}</legend>
              {group.note && <p className="group-note">{group.note}</p>}
              <div className="advanced-grid">
                {fields.map((f) => {
                  const current = values[f.key];
                  const isChanged =
                    current !== undefined && Math.abs(current - f.fallback) > 1e-9;
                  return (
                    <div className={`field${isChanged ? ' changed' : ''}`} key={f.key}>
                      <label htmlFor={`adv-${f.key}`}>
                        {f.label}
                        {f.unit && <span className="hint"> ({f.unit})</span>}
                        {f.hint && (
                          <>
                            <br />
                            <span className="hint">{f.hint}</span>
                          </>
                        )}
                      </label>
                      <input
                        id={`adv-${f.key}`}
                        type="number"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={current ?? defaults[f.key]}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                      {isChanged && (
                        <button
                          type="button"
                          className="reset-one"
                          onClick={() => set(f.key, '')}
                          title={`กลับเป็นค่ามาตรฐาน ${f.fallback}`}
                        >
                          คืนค่า {f.fallback}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {changedCount > 0 && (
          <button type="button" className="cta secondary" onClick={() => onChange({})}>
            รีเซ็ตทุกค่ากลับเป็นมาตรฐาน
          </button>
        )}
      </div>
    </div>
  );
}
