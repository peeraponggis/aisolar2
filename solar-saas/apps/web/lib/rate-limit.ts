import 'server-only';
import { supabaseAdmin } from './supabase-server';

/**
 * จำกัดอัตราการยิง API — เก็บส่วนกลางที่ Postgres
 *
 * ตัวนับในหน่วยความจำคุ้มได้แค่โปรเซสเดียว พออยู่หลัง load balancer หรือขึ้น serverless
 * แต่ละอินสแตนซ์จะมีตัวนับของตัวเอง ขีดจำกัดจริงจึงกลายเป็น N เท่าของที่ตั้งไว้
 * ที่นี่นับรวมกันในตาราง `rate_limits` ผ่านฟังก์ชัน check_rate_limit() (ดู supabase/05_rate_limits.sql)
 *
 * ทำไมไม่ใช้ Redis: โปรเจกต์นี้มี Postgres อยู่แล้ว การเพิ่มบริการใหม่หมายถึงคีย์ใหม่
 * ค่าใช้จ่ายใหม่ และจุดที่พังได้อีกจุด ที่ปริมาณระดับนี้ Postgres เร็วพอ
 *
 * ถ้าเรียกฐานข้อมูลไม่สำเร็จ จะถอยไปใช้ตัวนับในหน่วยความจำแทน ไม่ใช่ปล่อยผ่านทั้งหมด —
 * ฐานข้อมูลสะดุดไม่ควรทำให้ทั้งระบบเปิดโล่ง และไม่ควรทำให้ลูกค้าจริงส่งฟอร์มไม่ได้
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > windowMs) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** วินาทีที่ต้องรอก่อนยิงใหม่ได้ (มีค่าเมื่อ ok = false) */
  retryAfterSeconds: number;
  /** นับจากที่ไหน — ใช้ดูตอนแก้ปัญหา */
  scope: 'shared' | 'in-memory';
}

/** ตัวนับสำรองในหน่วยความจำ ใช้เมื่อยังไม่ได้ตั้งค่าฐานข้อมูลหรือเรียกไม่สำเร็จ */
function localRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - bucket.hits[0])) / 1000)),
      scope: 'in-memory',
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0, scope: 'in-memory' };
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const supabase = supabaseAdmin();
  if (!supabase) return localRateLimit(key, limit, windowMs);

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });
    if (error) throw new Error(error.message);

    const row = (Array.isArray(data) ? data[0] : data) as
      | { out_allowed: boolean; out_remaining: number; out_retry_after: number }
      | undefined;
    if (!row) throw new Error('empty response');

    return {
      ok: row.out_allowed,
      remaining: Number(row.out_remaining),
      retryAfterSeconds: Number(row.out_retry_after),
      scope: 'shared',
    };
  } catch (e) {
    console.error('[rate-limit] ใช้ตัวนับส่วนกลางไม่ได้ ถอยไปใช้ในหน่วยความจำ:', e);
    return localRateLimit(key, limit, windowMs);
  }
}

/**
 * หา IP ผู้เรียกจาก header ของ proxy
 * เชื่อ x-forwarded-for ได้เฉพาะเมื่อ deploy หลัง proxy ที่ตั้งค่า header นี้เอง (Vercel, Cloudflare)
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** ใช้เฉพาะในเทสต์ — ล้างตัวนับในหน่วยความจำระหว่างเคส */
export function resetRateLimit(): void {
  buckets.clear();
  lastSweep = 0;
}
