'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MarketLead } from '@/lib/marketplace';
import type { PurchaseResponse } from '@/app/api/pro/leads/[id]/purchase/route';
import { SEGMENT_LABEL } from '@/lib/pro';
import NewProjectButton from './NewProjectButton';
import { baht, fmt } from '@/lib/format';

export default function LeadCard({ lead, credits }: { lead: MarketLead; credits: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affordable = credits >= lead.priceCredits;

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pro/leads/${lead.id}/purchase`, { method: 'POST' });
      const data = (await res.json()) as PurchaseResponse;
      if (!data.ok) {
        setError(data.error);
        return;
      }
      router.refresh();
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card lead-card${lead.purchased ? ' owned' : ''}`}>
      <div className="lead-top">
        <div>
          <div className="lead-seg">{SEGMENT_LABEL[lead.segment]}</div>
          <div className="lead-province">{lead.province}</div>
        </div>
        <div className="lead-price">
          {lead.purchased ? <span className="owned-tag">ซื้อแล้ว</span> : `${lead.priceCredits} เครดิต`}
        </div>
      </div>

      <div className="metrics compact">
        <div className="metric">
          <div className="k">ค่าไฟ/เดือน</div>
          <div className="v">{baht(lead.monthlyBill)}</div>
        </div>
        <div className="metric">
          <div className="k">ขนาดที่เหมาะสม</div>
          <div className="v">
            {fmt(lead.suggestedKwp, 2)} <small>kWp</small>
          </div>
        </div>
        <div className="metric">
          <div className="k">ประเภทผู้ใช้ไฟ</div>
          <div className="v">
            {lead.peaType} <small>(กฟภ.)</small>
          </div>
        </div>
      </div>

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
        </tbody>
      </table>

      {lead.purchased ? (
        <>
          <Link className="cta secondary" href={`/report/${lead.id}`} target="_blank">
            เปิดรายงานของลูกค้ารายนี้
          </Link>
          <a className="cta secondary" href={`/api/pro/leads/${lead.id}/pdf`}>
            ดาวน์โหลด PDF
          </a>
          <NewProjectButton
            leadId={lead.id}
            defaultName={lead.contactName}
            label="สร้างโปรเจกต์จาก lead นี้"
            className="cta secondary"
          />
        </>
      ) : (
        <button className="cta" type="button" onClick={buy} disabled={busy || !affordable}>
          {busy ? 'กำลังซื้อ…' : affordable ? `ซื้อ lead นี้ (${lead.priceCredits} เครดิต)` : 'เครดิตไม่พอ'}
        </button>
      )}
      {error && <div className="form-status err" role="alert">{error}</div>}
    </div>
  );
}
