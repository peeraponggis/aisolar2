'use client';

/**
 * สะพานระหว่างโทเคนธีม (CSS variables) กับ Chart.js
 *
 * Chart.js วาดลง <canvas> จึงรับสีเป็นสตริงเท่านั้น อ้าง var(--*) ตรง ๆ ไม่ได้
 * ที่นี่จึงอ่านค่าจริงจาก :root แล้วส่งให้กราฟ และเฝ้าดู data-theme เพื่อวาดใหม่เมื่อสลับธีม
 * — ยังคงกฎ "ห้าม hardcode สี" ไว้ได้ เพราะแหล่งความจริงยังเป็น themes.css ที่เดียว
 */
import { useEffect, useState } from 'react';

export interface ChartTheme {
  text: string;
  textMuted: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  accent: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chartNeg: string;
  success: string;
  danger: string;
}

const TOKENS: Record<keyof ChartTheme, string> = {
  text: '--text',
  textMuted: '--text-muted',
  border: '--border',
  surface: '--surface',
  surfaceAlt: '--surface-alt',
  primary: '--primary',
  accent: '--accent',
  chart1: '--chart-1',
  chart2: '--chart-2',
  chart3: '--chart-3',
  chartNeg: '--chart-neg',
  success: '--success',
  danger: '--danger',
};

function readTheme(): ChartTheme {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as ChartTheme;
  for (const [key, token] of Object.entries(TOKENS)) {
    out[key as keyof ChartTheme] = cs.getPropertyValue(token).trim();
  }
  return out;
}

/**
 * สีเดียวกันแต่โปร่งแสง — ใช้กับพื้นที่ใต้กราฟและแถบพื้นหลัง
 * แปลง hex เป็น rgba() เองแทน color-mix() เพราะ canvas ของเบราว์เซอร์รุ่นเก่ายังไม่รองรับ
 */
export function alpha(color: string, a: number): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * เปิดหน้าเพื่อสร้าง PDF อยู่หรือไม่ (?pdf=1)
 * โหมดนี้ต้องปิดอนิเมชันของกราฟ ไม่งั้นตัวสร้าง PDF จะจับภาพตอนกราฟยังวาดไม่เสร็จ
 */
export function isPdfMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pdf') === '1';
}

/** อ่านสีจากธีมปัจจุบัน และคืนค่าใหม่ทุกครั้งที่ผู้ใช้สลับธีม */
export function useChartTheme(): ChartTheme | null {
  const [theme, setTheme] = useState<ChartTheme | null>(null);

  useEffect(() => {
    const update = () => setTheme(readTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
