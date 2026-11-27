'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLANS, PLAN_IDS, type PlanId } from '@/lib/plans';
import { SLIP_MAX_BYTES, SLIP_MIME_TYPES, type PayeeInfo } from '@/lib/pro';
import type { PaymentResponse } from '@/app/api/pro/payments/route';
import { baht, fmt } from '@/lib/format';

/** เลือกแพ็กเกจ โอนเงิน แล้วแนบสลิป — โครงเดียวกับหน้าเติมเครดิต */
export default function PlanPicker({
  currentPlan,
  payee,
}: {
  currentPlan: PlanId;
  payee: PayeeInfo;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState<PlanId>(currentPlan === 'trial' ? 'starter' : currentPlan);
  const [months, setMonths] = useState(1);
  const [slip, setSlip] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const paidPlans = PLAN_IDS.filter((id) => PLANS[id].priceThb > 0);
  const total = PLANS[planId].priceThb * months;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slip) {
      setError('กรุณาแนบสลิปการโอน');
      return;
    }
    if (slip.size > SLIP_MAX_BYTES) {
      setError('ไฟล์ใหญ่เกิน 5 MB');
      return;
    }

    setSending(true);
    setError(null);

    const body = new FormData();
    body.set('purpose', 'subscription');
    body.set('planId', planId);
    body.set('months', String(months));
    body.set('slip', slip);

    try {
      const res = await fetch('/api/pro/payments', { method: 'POST', body });
      const data = (await res.json()) as PaymentResponse;
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setDone(true);
      setSlip(null);
      router.refresh();
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="card thanks">
        <div className="tick">✓</div>
        <h3>ได้รับแจ้งโอนแล้ว</h3>
        <p>ทีมงานจะตรวจสอบสลิปและเปิดใช้แพ็กเกจให้ภายในเวลาทำการ</p>
        <button className="cta secondary" type="button" onClick={() => setDone(false)}>
          แจ้งโอนอีกรายการ
        </button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>
        <span className="num">1</span> เลือกแพ็กเกจ
      </h2>

      <div className="package-grid">
        {paidPlans.map((id) => {
          const plan = PLANS[id];
          return (
            <label key={id} className={`package${planId === id ? ' selected' : ''}`}>
              <input
                type="radio"
                name="planId"
                value={id}
                checked={planId === id}
                onChange={() => setPlanId(id)}
              />
              <div className="pkg-label">{plan.name}</div>
              <div className="pkg-price">{baht(plan.priceThb)}</div>
              <div className="pkg-unit">ต่อเดือน</div>
              <ul className="plan-points">
                {plan.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </label>
          );
        })}
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <label htmlFor="months">
          จำนวนเดือน <span className="hint">(จ่ายล่วงหน้าได้สูงสุด 12 เดือน)</span>
        </label>
        <select id="months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => (
            <option key={m} value={m}>
              {m} เดือน — {baht(PLANS[planId].priceThb * m)}
            </option>
          ))}
        </select>
      </div>

      <div className="notice total-line">
        ยอดที่ต้องโอน <b>{baht(total)}</b>
      </div>

      <h2 style={{ marginTop: 20 }}>
        <span className="num">2</span> โอนเงินแล้วแนบสลิป
      </h2>

      {payee.configured ? (
        <table className="kv payee">
          <tbody>
            {payee.bank && (<tr><th>ธนาคาร</th><td>{payee.bank}</td></tr>)}
            {payee.accountName && (<tr><th>ชื่อบัญชี</th><td>{payee.accountName}</td></tr>)}
            {payee.accountNumber && (<tr><th>เลขที่บัญชี</th><td>{payee.accountNumber}</td></tr>)}
            {payee.promptPay && (<tr><th>พร้อมเพย์</th><td>{payee.promptPay}</td></tr>)}
          </tbody>
        </table>
      ) : (
        <div className="notice warn">
          ยังไม่ได้ตั้งค่าบัญชีรับโอน — ผู้ดูแลระบบต้องกำหนด <code>NEXT_PUBLIC_PAYEE_*</code> ก่อน
        </div>
      )}

      <div className="field">
        <label htmlFor="planSlip">
          สลิปการโอน <span className="hint">(JPG, PNG, WEBP หรือ PDF ไม่เกิน 5 MB)</span>
        </label>
        <input
          id="planSlip"
          type="file"
          accept={SLIP_MIME_TYPES.join(',')}
          required
          onChange={(e) => { setSlip(e.target.files?.[0] ?? null); setError(null); }}
        />
        {slip && (
          <div className="hint" style={{ marginTop: 6 }}>
            {slip.name} · {fmt(slip.size / 1024)} KB
          </div>
        )}
      </div>

      <button className="cta" type="submit" disabled={sending || !payee.configured}>
        {sending ? 'กำลังส่ง…' : `แจ้งโอน ${baht(total)}`}
      </button>
      {error && <div className="form-status err" role="alert">{error}</div>}
      <div className="cta-note">แพ็กเกจจะเปิดใช้หลังทีมงานตรวจสอบสลิปแล้ว</div>
    </form>
  );
}
