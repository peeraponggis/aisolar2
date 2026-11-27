'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SettleResponse } from '@/app/api/pro/payments/[id]/route';

export default function SettleButtons({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function settle(action: 'confirm' | 'reject') {
    if (action === 'reject' && !confirm('ปฏิเสธใบแจ้งโอนนี้? ช่างจะไม่ได้รับเครดิต')) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/pro/payments/${paymentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as SettleResponse;
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
    <div className="settle">
      <button type="button" className="btn-ok" disabled={busy !== null} onClick={() => settle('confirm')}>
        {busy === 'confirm' ? 'กำลังเติม…' : 'ยืนยัน เติมเครดิต'}
      </button>
      <button type="button" className="btn-no" disabled={busy !== null} onClick={() => settle('reject')}>
        ปฏิเสธ
      </button>
      {error && <div className="form-status err">{error}</div>}
    </div>
  );
}
