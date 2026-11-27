import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // เอนจินเป็น TypeScript ดิบใน workspace — ให้ Next คอมไพล์ให้เหมือนโค้ดในแอป
  transpilePackages: ['@proinventive/solar-engine'],

  // รวมเซิร์ฟเวอร์กับ node_modules เท่าที่ใช้จริงไว้ในโฟลเดอร์เดียว สำหรับใส่ container
  // ไม่ต้องก๊อป node_modules ทั้งก้อน (หลักร้อย MB) เข้าภาพ
  output: 'standalone',
  // เอนจินอยู่นอก apps/web — ต้องบอกรากของโมโนรีโปให้ trace ข้ามโฟลเดอร์ถูก
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),

  // playwright-core เรียก browsers.json แบบไดนามิก ตัว trace ของ Next จึงมองไม่เห็น
  // และไม่ก๊อปมาให้ ผลคือ PDF พังตอนรันจริงทั้งที่ build ผ่าน — ต้องบังคับใส่เอง
  outputFileTracingIncludes: {
    '/api/**': ['../../node_modules/playwright-core/browsers.json'],
  },

  experimental: {
    // เอนจินอยู่นอก apps/web — ต้องอนุญาตให้ trace ไฟล์ข้ามโฟลเดอร์ใน monorepo
    externalDir: true,
  },
};

export default nextConfig;
