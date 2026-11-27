'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReviewResponse } from '@/app/api/pro/admin/leads/[id]/route';
import { SEGMENT_LABEL } from '@/lib/pro';
import { baht, fmt } from '@/lib/format';

export interface PendingLead {
  id: string;
  contactName: string;
  contactPhone: string;
  province: string;
  segment: keyof typeof SEGMENT_LABEL;
  peaType: number;
  monthlyBill: number;
  monthlyUnits: number;
  suggestedKwp: number;
  priceCredits: number;
  createdAt: string;
  /** จำนวน lead อื่นที่ใช้เบอร์เดียวกัน — สูงผิดปกติ = น่าสงสัย */
  samePhoneCount: number;
}

export default function ReviewLeadCard({ lead }: { lead: PendingLead }) {
  const router = useRouter();
  const [price, setPrice] = useState(lead.priceCredits);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(action: 'approve' | 'reject') {
    if (action === 'reject' && !confirm('ตีตก lead นี้? จะไม่ขึ้นตลาดและกู้คืนไม่ได้จากหน้านี้')) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/pro/admin/leads/${lead.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, priceCredits: price }),
      });
      const data = (await res.json()) as ReviewResponse;
      if (!data.ok) {
        setError(data.error);
        return;
      }
      router.refresh();
    } catch {
      setError('เชื่อมต่อไม่ได้');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card lead-card">
      <div className="lead-top">
        <div>
          <div className="lead-seg">{SEGMENT_LABEL[lead.segment]}</div>
          <div className="lead-province">{lead.province}</div>
        </div>
        <div className="lead-price">
          {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(lead.createdAt),
          )}
        </div>
      </div>

      {lead.samePhoneCount > 0 && (
        <div className="notice warn">
          เบอร์นี้เคยส่งเข้ามาแล้ว {lead.samePhoneCount} ครั้ง — ตรวจว่าเป็นการส่งซ้ำหรือ bot
        </div>
      )}

      <table className="kv contact">
        <tbody>
          <tr>
            <th>ลูกค้า</th>
            <td>{lead.contactName}</td>
          </tr>
          <tr>
            <th>เบอร์ติดต่อ</th>
            <td>{lead.contactPhone}</td>
          </tr>
          <tr>
            <th>ค่าไฟ/เดือน</th>
            <td>
              {baht(lead.monthlyBill)} · {fmt(lead.monthlyUnits)} หน่วย · ประเภท {lead.peaType}
            </td>
          </tr>
          <tr>
            <th>ขนาดที่เหมาะสม</th>
            <td>{fmt(lead.suggestedKwp, 2)} kWp</td>
          </tr>
        </tbody>
      </table>

      <div className="field">
        <label htmlFor={`price-${lead.id}`}>
          ราคาขาย <span className="hint">(เครดิต — ปรับได้ก่อนอนุมัติ)</span>
        </label>
        <input
          id={`price-${lead.id}`}
          type="number"
          min={1}
          max={100}
          step={1}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </div>

      <Link className="cta secondary" href={`/report/${lead.id}`} target="_blank">
        เปิดรายงานเพื่อตรวจตัวเลข
      </Link>

      <div className="settle" style={{ marginTop: 10 }}>
        <button type="button" className="btn-ok" disabled={busy !== null} onClick={() => review('approve')}>
          {busy === 'approve' ? 'กำลังอนุมัติ…' : `อนุมัติขึ้นตลาด (${price} เครดิต)`}
        </button>
        <button type="button" className="btn-no" disabled={busy !== null} onClick={() => review('reject')}>
          ตีตก
        </button>
      </div>
      {error && (
        <div className="form-status err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
