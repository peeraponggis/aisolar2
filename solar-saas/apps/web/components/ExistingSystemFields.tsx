'use client';

import { useId } from 'react';
import type { ExistingPvInput, ExistingYieldBasis } from '@proinventive/solar-engine';
import { fmt } from '@/lib/format';
import type { Quote } from '@/lib/quote';

export const YIELD_BASIS_OPTIONS: { value: ExistingYieldBasis; label: string }[] = [
  { value: 'estimate', label: 'รู้แค่ขนาด — ให้ระบบประมาณให้' },
  { value: 'monthly', label: 'มีผลผลิตรายเดือน' },
  { value: 'hourly', label: 'มีผลผลิตรายชั่วโมง' },
];

const MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * ฟอร์มระบบออนกริดเดิมที่จะต่อร่วมแบบ AC Coupling
 *
 * เรียงช่องตามลำดับที่ช่างถามหน้างานจริง — ขนาดก่อน แล้วค่อยลงรายละเอียด
 * ทุกช่องนอกจากขนาด AC เว้นว่างได้ ระบบจะประมาณให้แล้วบอกว่าประมาณจากอะไร
 * บังคับกรอกครบเมื่อไหร่ก็ไม่มีใครกรอก แล้วฟีเจอร์นี้ก็ไม่ถูกใช้
 */
export default function ExistingSystemFields({
  value,
  onChange,
  quote,
}: {
  value: ExistingPvInput;
  onChange: (next: ExistingPvInput) => void;
  quote: Quote | null;
}) {
  const id = useId();
  const set = <K extends keyof ExistingPvInput>(key: K, v: ExistingPvInput[K]) =>
    onChange({ ...value, [key]: v });

  const num = (raw: string) => (raw === '' ? undefined : Number(raw));
  const ex = quote?.existingPv ?? null;
  const ac = quote?.combinedAc ?? null;

  const setMonth = (i: number, raw: string) => {
    const arr = Array.from({ length: 12 }, (_, k) => value.monthlyKwh?.[k] ?? 0);
    arr[i] = raw === '' ? 0 : Number(raw);
    onChange({ ...value, monthlyKwh: arr });
  };
  const setHour = (i: number, raw: string) => {
    const arr = Array.from({ length: 24 }, (_, k) => value.hourlyKwh?.[k] ?? 0);
    arr[i] = raw === '' ? 0 : Number(raw);
    onChange({ ...value, hourlyKwh: arr });
  };

  return (
    <div className="existing-fields">
      <div className="field">
        <label htmlFor={`${id}-ac`}>ขนาด AC ของระบบเดิม</label>
        <div className="unit-row">
          <input
            type="number"
            id={`${id}-ac`}
            min={0}
            step={0.1}
            value={value.acKw || ''}
            onChange={(e) => set('acKw', Number(e.target.value) || 0)}
          />
          <span className="unit">kW</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-inv`}>
          รุ่นอินเวอร์เตอร์เดิม <span className="hint">(ไม่บังคับ)</span>
        </label>
        <input
          type="text"
          id={`${id}-inv`}
          value={value.inverterModel ?? ''}
          onChange={(e) => set('inverterModel', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={`${id}-pw`}>แผงเดิม วัตต์ / จำนวนแผง</label>
        <div className="unit-row">
          <input
            type="number"
            id={`${id}-pw`}
            min={0}
            step={5}
            placeholder="0"
            value={value.panelWatt ?? ''}
            onChange={(e) => set('panelWatt', num(e.target.value))}
          />
          <span className="unit">W/แผง</span>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="0"
            aria-label="จำนวนแผงเดิม"
            value={value.panelCount ?? ''}
            onChange={(e) => set('panelCount', num(e.target.value))}
          />
          <span className="unit">แผง</span>
        </div>
        <div className="hint">
          ยังไม่ได้กรอกแผงเดิม จะใช้ขนาด AC เป็นตัวตั้งในการประมาณแทน
          ซึ่งได้ตัวเลขต่ำกว่าความจริงเล็กน้อย
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-yr`}>ปีที่ติดตั้ง / เสื่อมปีละ</label>
        <div className="unit-row">
          <input
            type="number"
            id={`${id}-yr`}
            min={0}
            step={1}
            placeholder="เช่น 2565"
            value={value.installYear ?? ''}
            onChange={(e) => set('installYear', num(e.target.value))}
          />
          <span className="unit">ปี</span>
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            placeholder="0.5"
            aria-label="อัตราเสื่อมต่อปี"
            value={value.degradationPercent ?? ''}
            onChange={(e) => set('degradationPercent', num(e.target.value))}
          />
          <span className="unit">%</span>
        </div>
        <div className="hint">กรอกได้ทั้ง พ.ศ. และ ค.ศ. — ระบบแปลงให้เอง</div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-basis`}>ข้อมูลการผลิตที่มี</label>
        <select
          id={`${id}-basis`}
          value={value.basis}
          onChange={(e) => set('basis', e.target.value as ExistingYieldBasis)}
        >
          {YIELD_BASIS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {value.basis === 'monthly' && (
        <div className="field">
          <label>ผลผลิตรายเดือน (kWh)</label>
          <div className="grid-mini">
            {MONTH_SHORT.map((m, i) => (
              <label key={m} className="mini">
                <span>{m}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={value.monthlyKwh?.[i] || ''}
                  aria-label={`ผลผลิตเดือน${m}`}
                  onChange={(e) => setMonth(i, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="hint">
            กรอกจากแอปอินเวอร์เตอร์เดิม — ตัวเลขที่วัดจริงแม่นกว่าการประมาณมาก
          </div>
        </div>
      )}

      {value.basis === 'hourly' && (
        <div className="field">
          <label>ผลผลิตรายชั่วโมง เฉลี่ยต่อวัน (kWh)</label>
          <div className="grid-mini">
            {Array.from({ length: 24 }, (_, h) => (
              <label key={h} className="mini">
                <span>{String(h).padStart(2, '0')}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={value.hourlyKwh?.[h] || ''}
                  aria-label={`ผลผลิตเวลา ${h} นาฬิกา`}
                  onChange={(e) => setHour(h, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-sy`}>ผลผลิตจำเพาะคาด</label>
        <div className="unit-row">
          <input
            type="number"
            id={`${id}-sy`}
            min={0}
            step={1}
            placeholder={ex ? String(Math.round(ex.specificYield)) : ''}
            value={value.specificYield ?? ''}
            onChange={(e) => set('specificYield', num(e.target.value))}
          />
          <span className="unit">kWh/kW/ปี</span>
        </div>
        {quote && (
          <div className="hint">
            คำนวณให้ได้ในตัวเป็น PSH {fmt(quote.assumptions.psh, 1)} ชม./วัน × 365 วัน × PR{' '}
            {fmt(quote.assumptions.pr, 2)} = {fmt(quote.assumptions.psh * 365 * quote.assumptions.pr)}{' '}
            kWh/kW/ปี
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${id}-kva`}>
          ขนาดหม้อแปลง <span className="hint">(ไม่ทราบให้เว้นว่าง)</span>
        </label>
        <div className="unit-row">
          <input
            type="number"
            id={`${id}-kva`}
            min={0}
            step={1}
            placeholder="เช่น 250"
            value={value.transformerKva ?? ''}
            onChange={(e) => set('transformerKva', num(e.target.value))}
          />
          <span className="unit">kVA</span>
        </div>
      </div>

      <label className="check-row" htmlFor={`${id}-abf`}>
        <input
          type="checkbox"
          id={`${id}-abf`}
          checked={value.hasAntiBackflow}
          onChange={(e) => set('hasAntiBackflow', e.target.checked)}
        />
        <span>
          มีระบบกันไฟไหลย้อน (Gateway / CT)
          <br />
          <span className="hint">ไฟเหลือจะถูกเก็บเข้าแบตเตอรี่แทนการส่งออก</span>
        </span>
      </label>

      {ex && ac && (
        <div className="assumption">
          <b>กำลัง AC สูงสุดรวมสาย</b> ระบบใหม่ {fmt(ac.newAcKw, 2)} + ระบบเดิม{' '}
          {fmt(ac.existingAcKw, 2)} = <b>{fmt(ac.totalAcKw, 2)} kW</b>
          {ac.transformerLoadPercent !== null && (
            <>
              <br />
              เทียบหม้อแปลง {fmt(ac.transformerKva, 2)} kVA ={' '}
              <b>{fmt(ac.transformerLoadPercent, 2)}%</b>
              {ac.overThreshold && (
                <span className="warn"> — เกิน 80% ควรให้การไฟฟ้าตรวจสอบก่อนติดตั้ง</span>
              )}
            </>
          )}
          <br />
          <b>ผลผลิตระบบเดิม {fmt(ex.annualKwh)} kWh/ปี</b> ({fmt(ex.avgDailyKwh, 1)} kWh/วัน)
          <br />
          <span className="hint">{ex.note}</span>
          {!value.hasAntiBackflow && (
            <>
              <br />
              <span className="hint">
                ยังไม่ได้ติ๊กกันไฟไหลย้อน — ไฟที่ผลิตเกินความต้องการจะไหลออกสาย
                และไม่ถูกนับเป็นเงินประหยัด
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
