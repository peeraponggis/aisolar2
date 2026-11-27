'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Turnstile, { type TurnstileHandle } from '@/components/Turnstile';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

type Mode = 'login' | 'signup';

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [province, setProvince] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    // captcha ใช้เฉพาะตอนสมัคร — การเข้าสู่ระบบกันด้วย rate limit อยู่แล้ว
    // และการบังคับ captcha ทุกครั้งที่ล็อกอินสร้าง friction ให้ช่างที่เข้าใช้งานทุกวัน
    const payload =
      mode === 'login'
        ? { email, password }
        : { email, password, fullName, company, province, captchaToken };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'ทำรายการไม่สำเร็จ');
        // token ใช้ได้ครั้งเดียว ต้องขอใหม่ก่อนกดส่งรอบหน้า
        turnstileRef.current?.reset();
        return;
      }
      router.replace('/pro');
      router.refresh();
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่');
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="card auth-card" onSubmit={submit}>
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => { setMode('login'); setError(null); }}
        >
          เข้าสู่ระบบ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => { setMode('signup'); setError(null); }}
        >
          สมัครใช้งาน
        </button>
      </div>

      {mode === 'signup' && (
        <>
          <div className="field">
            <label htmlFor="fullName">ชื่อ-นามสกุล</label>
            <input id="fullName" type="text" value={fullName} required minLength={2}
              onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="company">ชื่อบริษัท / ร้าน</label>
            <input id="company" type="text" value={company} required minLength={2}
              onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="province">จังหวัดที่ให้บริการ</label>
            <input id="province" type="text" value={province} required minLength={2}
              onChange={(e) => setProvince(e.target.value)} />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="email">อีเมล</label>
        <input id="email" type="email" value={email} required autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">
          รหัสผ่าน {mode === 'signup' && <span className="hint">(อย่างน้อย 8 ตัวอักษร)</span>}
        </label>
        {/* ปุ่มดูรหัสผ่าน — พิมพ์รหัสยาว ๆ ผิดแล้วไม่รู้ตัวคือสาเหตุที่เข้าไม่ได้บ่อยที่สุด
            และหน้านี้ไม่ได้บอกด้วยว่าอีเมลผิดหรือรหัสผิด (ตั้งใจ) เลยยิ่งเดาไม่ถูก */}
        <div className="password-row">
          <input id="password" type={showPassword ? 'text' : 'password'} value={password} required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)} />
          <button
            type="button"
            className="password-toggle"
            aria-pressed={showPassword}
            aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? 'ซ่อน' : 'แสดง'}
          </button>
        </div>
      </div>

      {mode === 'signup' && TURNSTILE_SITE_KEY && (
        <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} handleRef={turnstileRef} />
      )}

      <button className="cta" type="submit" disabled={sending}>
        {sending ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและเริ่มใช้งาน'}
      </button>
      {error && <div className="form-status err" role="alert">{error}</div>}
      {mode === 'signup' && (
        <div className="cta-note">สมัครฟรี รับเครดิตทดลอง 3 เครดิตสำหรับซื้อ lead ใบแรก</div>
      )}
    </form>
  );
}
