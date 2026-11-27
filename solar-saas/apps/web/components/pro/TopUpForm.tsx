'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CREDIT_PACKAGES,
  SLIP_MAX_BYTES,
  SLIP_MIME_TYPES,
  pricePerCredit,
  type PayeeInfo,
} from '@/lib/pro';
import type { PaymentResponse } from '@/app/api/pro/payments/route';
import { baht, fmt } from '@/lib/format';

export default function TopUpForm({ payee }: { payee: PayeeInfo }) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(CREDIT_PACKAGES[1].id);
  const [slip, setSlip] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const cheapest = Math.min(...CREDIT_PACKAGES.map(pricePerCredit));

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
    body.set('packageId', packageId);
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
        <p>
          ทีมงานจะตรวจสอบสลิปและเติมเครดิตให้ภายในเวลาทำการ
          สถานะดูได้จากตารางประวัติด้านล่าง
        </p>
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
        {CREDIT_PACKAGES.map((pkg) => {
          const unit = pricePerCredit(pkg);
          return (
            <label key={pkg.id} className={`package${packageId === pkg.id ? ' selected' : ''}`}>
              <input
                type="radio"
                name="packageId"
                value={pkg.id}
                checked={packageId === pkg.id}
                onChange={() => setPackageId(pkg.id)}
              />
              <div className="pkg-label">{pkg.label}</div>
              <div className="pkg-credits">{fmt(pkg.credits)} เครดิต</div>
              <div className="pkg-price">{baht(pkg.priceThb)}</div>
              <div className="pkg-unit">
                {fmt(unit)} บาท/เครดิต
                {unit === cheapest && <span className="pkg-best">คุ้มที่สุด</span>}
              </div>
            </label>
          );
        })}
      </div>

      <h2 style={{ marginTop: 26 }}>
        <span className="num">2</span> โอนเงินแล้วแนบสลิป
      </h2>

      {payee.configured ? (
        <table className="kv payee">
          <tbody>
            {payee.bank && (
              <tr>
                <th>ธนาคาร</th>
                <td>{payee.bank}</td>
              </tr>
            )}
            {payee.accountName && (
              <tr>
                <th>ชื่อบัญชี</th>
                <td>{payee.accountName}</td>
              </tr>
            )}
            {payee.accountNumber && (
              <tr>
                <th>เลขที่บัญชี</th>
                <td>{payee.accountNumber}</td>
              </tr>
            )}
            {payee.promptPay && (
              <tr>
                <th>พร้อมเพย์</th>
                <td>{payee.promptPay}</td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <div className="notice warn">
          ยังไม่ได้ตั้งค่าบัญชีรับโอน — ผู้ดูแลระบบต้องกำหนด <code>NEXT_PUBLIC_PAYEE_*</code>{' '}
          ใน <code>.env.local</code> ก่อนเปิดรับชำระเงิน
        </div>
      )}

      <div className="field">
        <label htmlFor="slip">
          สลิปการโอน <span className="hint">(JPG, PNG, WEBP หรือ PDF ไม่เกิน 5 MB)</span>
        </label>
        <input
          id="slip"
          type="file"
          accept={SLIP_MIME_TYPES.join(',')}
          required
          onChange={(e) => {
            setSlip(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        {slip && (
          <div className="hint" style={{ marginTop: 6 }}>
            {slip.name} · {fmt(slip.size / 1024)} KB
          </div>
        )}
      </div>

      <button className="cta" type="submit" disabled={sending || !payee.configured}>
        {sending ? 'กำลังส่ง…' : 'แจ้งโอนเงิน'}
      </button>
      {error && (
        <div className="form-status err" role="alert">
          {error}
        </div>
      )}
      <div className="cta-note">
        เครดิตจะเข้าหลังทีมงานตรวจสอบสลิปแล้ว ไม่ได้เข้าอัตโนมัติทันที
      </div>
    </form>
  );
}
