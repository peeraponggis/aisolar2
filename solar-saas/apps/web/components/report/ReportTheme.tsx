'use client';

import { useEffect } from 'react';
import { getTheme } from '@/styles/theme-manager';

/**
 * ตรึงรายงานไว้ที่ธีมสว่างตลอดเวลาที่อยู่หน้านี้
 *
 * กราฟวาดลง canvas ด้วยสีที่อ่านตอน render — ตอนสั่งพิมพ์เบราว์เซอร์ไม่วาดใหม่
 * ถ้าผู้ใช้อยู่ธีมมืด กราฟจะออกมาเป็นสีมืดบนกระดาษขาว จึงตรึงธีมตั้งแต่บนจอ
 * ให้สิ่งที่เห็นตรงกับสิ่งที่พิมพ์ (ไม่แตะ localStorage — ธีมที่ผู้ใช้เลือกไว้ยังอยู่)
 */
export default function ReportTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'solar-amber');
    return () => root.setAttribute('data-theme', previous ?? getTheme());
  }, []);

  return null;
}
