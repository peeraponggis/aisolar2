'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreateProjectResponse } from '@/app/api/pro/projects/route';

/** สร้างโปรเจกต์ใหม่ — จาก lead ที่ซื้อไว้ หรือกรอกชื่อลูกค้าเองแล้วเริ่มจากศูนย์ */
export default function NewProjectButton({
  leadId,
  label = 'สร้างโปรเจกต์ใหม่',
  defaultName = '',
  className = 'cta',
}: {
  leadId?: string;
  label?: string;
  defaultName?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const customerName = leadId ? defaultName : (prompt('ชื่อลูกค้า') ?? '').trim();
    if (!leadId && customerName.length < 2) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pro/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(leadId ? { leadId } : {}), customerName }),
      });
      const data = (await res.json()) as CreateProjectResponse;
      if (!data.ok) {
        setError(data.error);
        return;
      }
      router.push(`/pro/projects/${data.id}`);
    } catch {
      setError('เชื่อมต่อไม่ได้');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={create}>
        {busy ? 'กำลังสร้าง…' : label}
      </button>
      {error && <div className="form-status err">{error}</div>}
    </>
  );
}
