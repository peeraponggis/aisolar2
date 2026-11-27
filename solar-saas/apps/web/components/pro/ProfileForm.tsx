'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from '@/lib/branding';
import type { ProfileResponse } from '@/app/api/pro/profile/route';
import { fmt } from '@/lib/format';

export default function ProfileForm({
  initial,
}: {
  initial: {
    fullName: string;
    company: string;
    phone: string;
    province: string;
    logoUrl: string | null;
  };
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [company, setCompany] = useState(initial.company);
  const [phone, setPhone] = useState(initial.phone);
  const [province, setProvince] = useState(initial.province);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function send(body: FormData) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/pro/profile', { method: 'PATCH', body });
      const data = (await res.json()) as ProfileResponse;
      if (!data.ok) {
        setError(data.error);
        return;
      }
      if (data.logoUrl) setLogoUrl(data.logoUrl);
      setLogo(null);
      setSaved(true);
      router.refresh();
    } catch {
      setError('เชื่อมต่อไม่ได้');
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (logo && logo.size > LOGO_MAX_BYTES) {
      setError('ไฟล์ใหญ่เกิน 2 MB');
      return;
    }
    const body = new FormData();
    body.set('fullName', fullName);
    body.set('company', company);
    body.set('phone', phone);
    body.set('province', province);
    if (logo) body.set('logo', logo);
    await send(body);
  }

  async function removeLogo() {
    if (!confirm('ลบโลโก้? รายงานจะกลับไปใช้ตราของ PROINVENTIVE')) return;
    const body = new FormData();
    body.set('removeLogo', '1');
    await send(body);
    setLogoUrl(null);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>
        <span className="num">1</span> ข้อมูลบริษัท
      </h2>
      <p className="group-note">
        ชื่อและโลโก้นี้จะขึ้นบนหัวรายงานของโปรเจกต์ที่คุณส่งให้ลูกค้า แทนตราของ PROINVENTIVE
      </p>

      <div className="field">
        <label htmlFor="company">ชื่อบริษัท / ร้าน</label>
        <input id="company" type="text" value={company} required minLength={2}
          onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="fullName">ชื่อผู้ติดต่อ</label>
        <input id="fullName" type="text" value={fullName} required minLength={2}
          onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="phone">
          เบอร์ติดต่อ <span className="hint">(ขึ้นบนหัวรายงาน)</span>
        </label>
        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="province">
          จังหวัดที่ให้บริการ <span className="hint">(ใช้จับคู่ lead ในตลาดด้วย)</span>
        </label>
        <input id="province" type="text" value={province} required minLength={2}
          onChange={(e) => setProvince(e.target.value)} />
      </div>

      <h2 style={{ marginTop: 26 }}>
        <span className="num">2</span> โลโก้บนรายงาน
      </h2>

      {logoUrl ? (
        <div className="logo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="โลโก้ปัจจุบัน" />
          <button type="button" className="link-btn" onClick={removeLogo} disabled={saving}>
            ลบโลโก้
          </button>
        </div>
      ) : (
        <p className="placeholder">ยังไม่ได้อัปโหลดโลโก้ — รายงานจะใช้ตราของ PROINVENTIVE</p>
      )}

      <div className="field">
        <label htmlFor="logo">
          อัปโหลดโลโก้ใหม่ <span className="hint">(PNG, JPG, WEBP หรือ SVG ไม่เกิน 2 MB)</span>
        </label>
        <input id="logo" type="file" accept={LOGO_MIME_TYPES.join(',')}
          onChange={(e) => { setLogo(e.target.files?.[0] ?? null); setError(null); }} />
        {logo && (
          <div className="hint" style={{ marginTop: 6 }}>
            {logo.name} · {fmt(logo.size / 1024)} KB
          </div>
        )}
      </div>

      <button className="cta" type="submit" disabled={saving}>
        {saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
      </button>
      {saved && <div className="form-status ok">บันทึกแล้ว</div>}
      {error && <div className="form-status err" role="alert">{error}</div>}
    </form>
  );
}
