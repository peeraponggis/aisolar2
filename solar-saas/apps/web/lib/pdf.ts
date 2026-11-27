import 'server-only';
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';

/**
 * แปลงหน้ารายงานเป็นไฟล์ PDF ด้วย Chromium แบบ headless
 *
 * ทำไมใช้เบราว์เซอร์เปิดหน้าเดิม แทนที่จะวาด PDF เอง: หน้ารายงานมีกราฟ Chart.js ที่วาดลง canvas
 * และมีฟอนต์ไทย ถ้าประกอบ PDF เองด้วยไลบรารีต้องวาดกราฟใหม่และฝังฟอนต์เอง งานเยอะและผลต่างกัน
 * วิธีนี้ "สิ่งที่เห็นบนเว็บ = สิ่งที่ได้ในไฟล์" เพราะเป็นเอนจินเดียวกันกับที่ผู้ใช้กด Ctrl+P
 *
 * ใช้ playwright-core (ไม่ดาวน์โหลดเบราว์เซอร์ 300MB) แล้วชี้ไปที่ Chrome/Edge ที่เครื่องมีอยู่
 * บนเซิร์ฟเวอร์ที่ไม่มีเบราว์เซอร์ ให้ตั้ง CHROME_EXECUTABLE_PATH หรือติดตั้ง chromium เพิ่ม
 */

const CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

export function findBrowserExecutable(): string | null {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export function isPdfAvailable(): boolean {
  return findBrowserExecutable() !== null;
}

/**
 * เปิด URL แล้วคืนไฟล์ PDF ขนาด A4
 * รอสัญญาณ data-report-ready ที่หน้ารายงานตั้งให้หลังกราฟวาดเสร็จ ไม่ใช่รอเวลาแบบเดา
 */
export async function renderPdf(
  url: string,
  timeoutMs = 30000,
  /** cookie เซสชัน สำหรับหน้าที่ต้องล็อกอิน (เช่นรายงานโปรเจกต์ของช่าง) */
  cookieHeader?: string,
): Promise<Buffer> {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error('ไม่พบ Chrome หรือ Edge สำหรับสร้าง PDF — ตั้งค่า CHROME_EXECUTABLE_PATH');
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1600 },
      ...(cookieHeader ? { extraHTTPHeaders: { cookie: cookieHeader } } : {}),
    });
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    // หน้ารายงานตั้งแอตทริบิวต์นี้เมื่อกราฟทั้งสามวาดเสร็จแล้ว
    await page.waitForSelector('html[data-report-ready="1"]', { timeout: timeoutMs });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await browser?.close().catch(() => {});
  }
}
