'use client';

import { useEffect, useRef } from 'react';

/**
 * วิดเจ็ต Cloudflare Turnstile
 *
 * โหลดสคริปต์ครั้งเดียวต่อหน้า แล้ว render วิดเจ็ตแบบ explicit เพื่อคุมวงจรชีวิตเอง
 * (แบบ implicit จะสแกนทั้งหน้าและงงเมื่อ modal ถูก unmount/mount ซ้ำ)
 *
 * token ใช้ได้ครั้งเดียวและหมดอายุใน 5 นาที — ถ้าส่งฟอร์มไม่ผ่านต้อง reset ขอ token ใหม่
 * ผู้เรียกจึงได้ ref สำหรับสั่ง reset กลับไป
 */

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
      language?: string;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile script failed'));
    document.head.appendChild(script);
  });
}

export interface TurnstileHandle {
  reset: () => void;
}

export default function Turnstile({
  siteKey,
  onToken,
  handleRef,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  handleRef?: React.RefObject<TurnstileHandle | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // เก็บ callback ล่าสุดไว้ใน ref เพื่อไม่ให้ effect วิ่งใหม่ทุกครั้งที่ parent re-render
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(boxRef.current, {
          sitekey: siteKey,
          language: 'th',
          theme: 'auto',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // สคริปต์โหลดไม่ได้ (เช่นเน็ตองค์กรบล็อก) — ปล่อยให้ส่งฟอร์มได้ ฝั่ง server ยังตรวจอยู่
        if (!cancelled) onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          onTokenRef.current(null);
        }
      },
    };
  }, [handleRef]);

  return <div className="turnstile-box" ref={boxRef} />;
}
