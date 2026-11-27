'use client';

import { useEffect } from 'react';

/**
 * ปักธงบอกว่าหน้ารายงานวาดเสร็จแล้ว รวมถึงกราฟทั้งสามตัว
 * ตัวสร้าง PDF (lib/pdf.ts) รอสัญญาณนี้แทนการหน่วงเวลาแบบเดา — หน้าช้าก็ยังได้ไฟล์ครบ
 *
 * รอสองรอบ rAF: รอบแรกให้ React commit เสร็จ รอบสองให้ Chart.js วาดลง canvas จบ
 * (โหมด PDF ปิดอนิเมชันไว้ กราฟจึงเสร็จภายในเฟรมเดียว)
 */
export default function ReportReady() {
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.documentElement.dataset.reportReady = '1';
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      delete document.documentElement.dataset.reportReady;
    };
  }, []);

  return null;
}
