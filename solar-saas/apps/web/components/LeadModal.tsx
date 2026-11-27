'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Quote } from '@/lib/quote';
import { reportHref } from '@/lib/report-link';
import type { LeadRequest, LeadResponse } from '@/lib/lead';
import Turnstile, { type TurnstileHandle } from './Turnstile';
import LineLinkBox from './LineLinkBox';

const LINE_ADD_FRIEND_URL = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ?? '';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export default function LeadModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** ลิงก์รายงานของ lead จริง (ถ้าบันทึกลง Supabase ได้) — ไม่ใช่พรีวิวจาก query string */
  const [savedReportUrl, setSavedReportUrl] = useState<string | null>(null);
  const [lineToken, setLineToken] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const payload: LeadRequest & { captchaToken?: string } = {
      contact: { name, phone, province, ...(email.trim() ? { email: email.trim() } : {}) },
      input: quote.input,
      ...(captchaToken ? { captchaToken } : {}),
    };

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: LeadResponse = await res.json();
      if (!data.ok) {
        setError(data.error);
        // token ใช้ได้ครั้งเดียว ต้องขอใหม่ก่อนกดส่งรอบหน้า
        turnstileRef.current?.reset();
        return;
      }
      setSavedReportUrl(data.reportUrl ?? null);
      setLineToken(data.lineToken ?? null);
      setDone(true);
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lead-title">
        <button className="close-x" type="button" onClick={onClose} aria-label="ปิด">
          ✕
        </button>

        {done ? (
          <div className="thanks">
            <div className="tick">✓</div>
            <h3 id="lead-title">ได้รับข้อมูลแล้ว</h3>
            <p>
              เราจะให้ผู้ติดตั้งในพื้นที่ติดต่อกลับเพื่อเสนอราคาให้เปรียบเทียบ
              ระหว่างนี้เปิดดูรายงานได้เลย
            </p>
            <Link className="cta" href={savedReportUrl ?? reportHref(quote.input)} target="_blank">
              เปิดรายงานฉบับเต็ม
            </Link>
            {lineToken && (
              <LineLinkBox
                token={lineToken}
                addFriendUrl={LINE_ADD_FRIEND_URL}
                title="รับรายงานทาง LINE"
                description="อยากได้ลิงก์รายงานเก็บไว้ในแชต LINE ทำ 2 ขั้นตอนนี้"
              />
            )}
            <button className="cta secondary" type="button" onClick={onClose}>
              ปิดหน้าต่าง
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 id="lead-title">รับรายงานฉบับเต็มฟรี</h3>
            <p>
              ระบบจะส่งรายงาน PDF ของระบบขนาด {quote.sizing.actualKwp.toFixed(2)} kWp
              พร้อมให้ผู้ติดตั้งในพื้นที่เสนอราคาให้เปรียบเทียบ
            </p>

            <div className="field">
              <input
                ref={firstFieldRef}
                type="text"
                placeholder="ชื่อ-นามสกุล"
                aria-label="ชื่อ-นามสกุล"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="field">
              <input
                type="tel"
                placeholder="เบอร์โทรศัพท์"
                aria-label="เบอร์โทรศัพท์"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                inputMode="tel"
              />
            </div>
            <div className="field">
              <input
                type="text"
                placeholder="จังหวัด"
                aria-label="จังหวัด"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <input
                type="email"
                placeholder="อีเมล (ไม่บังคับ)"
                aria-label="อีเมล"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <div className="hint" style={{ marginTop: 4 }}>
                กรอกอีเมลถ้าต้องการรับไฟล์ PDF ของรายงานแนบไปให้
              </div>
            </div>

            {TURNSTILE_SITE_KEY && (
              <Turnstile
                siteKey={TURNSTILE_SITE_KEY}
                onToken={setCaptchaToken}
                handleRef={turnstileRef}
              />
            )}

            <button className="cta" type="submit" disabled={sending}>
              {sending ? 'กำลังส่ง…' : 'ส่งรายงานให้ฉัน'}
            </button>
            {error && (
              <div className="form-status err" role="alert">
                {error}
              </div>
            )}
            <div className="cta-note">
              ข้อมูลของคุณใช้เพื่อส่งรายงานและจับคู่ผู้ติดตั้งเท่านั้น
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
