'use client';

import { useState } from 'react';

/**
 * กล่องผูกบัญชี LINE — ใช้ทั้งฝั่งลูกค้า (รับรายงาน) และฝั่งช่าง (รับแจ้งเตือน lead)
 *
 * ทำไมต้องให้คัดลอกรหัสไปวางเอง: LINE ไม่ยอมให้ส่งข้อความหาใครก่อนที่เขาจะเพิ่มเพื่อน
 * และตอนเพิ่มเพื่อนก็ไม่มีทางรู้ว่าเป็นใคร รหัสนี้จึงเป็นตัวเชื่อมระหว่างคนบนเว็บกับคนในแชต
 */
export default function LineLinkBox({
  token,
  addFriendUrl,
  title,
  description,
}: {
  token: string;
  addFriendUrl: string;
  title: string;
  description: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // เบราว์เซอร์บางตัวไม่ให้ใช้ clipboard ถ้าไม่ได้เปิดผ่าน https — ให้ผู้ใช้ลากเลือกเอง
      setCopied(false);
    }
  }

  return (
    <div className="line-box">
      <div className="line-title">{title}</div>
      <p className="line-desc">{description}</p>

      <ol className="line-steps">
        <li>
          {addFriendUrl ? (
            <a className="line-add" href={addFriendUrl} target="_blank" rel="noreferrer">
              เพิ่มเพื่อน LINE Official Account
            </a>
          ) : (
            <span>เพิ่มเพื่อน LINE Official Account ของเรา</span>
          )}
        </li>
        <li>คัดลอกรหัสด้านล่างไปวางในแชต แล้วกดส่ง</li>
      </ol>

      <div className="line-token">
        <code>{token}</code>
        <button type="button" onClick={copy}>
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
      <div className="line-expiry">รหัสมีอายุ 24 ชั่วโมง</div>
    </div>
  );
}
