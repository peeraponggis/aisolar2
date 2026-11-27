import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin, supabaseAsUser } from '@/lib/supabase-server';
import { computeQuote, type QuoteInput } from '@/lib/quote';
import { PROJECT_SNAPSHOT_VERSION, peaTypeOf } from '@/lib/projects';
import { sanitizeAdvanced } from '@/lib/advanced';
import { validateQuoteInput } from '@/lib/quote-input';
import { entitlementsFor, projectCount } from '@/lib/subscription';
import { sanitizeRateOverride } from '@/lib/rate-override';

export type CreateProjectResponse = { ok: true; id: string } | { ok: false; error: string };

/**
 * สร้างโปรเจกต์ใหม่ — จาก lead ที่ซื้อไว้แล้ว หรือเริ่มจากศูนย์
 *
 * ถ้าอ้าง lead ต้องเป็น lead ที่ช่างคนนี้ซื้อจริง ตรวจผ่าน lead_purchases ในนามผู้ใช้
 * เพื่อให้ RLS เป็นด่านที่สอง ไม่ใช่เชื่อรหัสที่ส่งมาจากฝั่ง client
 */
export async function POST(request: Request): Promise<NextResponse<CreateProjectResponse>> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (user.role !== 'installer' && user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'บัญชีนี้ไม่ใช่ผู้ติดตั้ง' }, { status: 403 });
  }

  const asUser = supabaseAsUser(user.accessToken);
  if (!asUser) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อม' }, { status: 503 });

  // ตรวจโควตาก่อนทำอย่างอื่น — ช่างที่เต็มโควตาไม่ควรกรอกจนจบแล้วมาเจอ error ทีหลัง
  const [entitlements, used] = await Promise.all([entitlementsFor(user), projectCount(user)]);
  if (entitlements.projectLimit !== null && used >= entitlements.projectLimit) {
    // หมดอายุแล้วต้องบอกว่าเป็นเพราะหมดอายุ ไม่ใช่บอกว่าแพ็กเกจที่ซื้อไว้เก็บได้แค่นี้
    const reason = entitlements.active
      ? `แพ็กเกจ${entitlements.effectivePlan.name}เก็บได้ ${entitlements.projectLimit} โปรเจกต์`
      : `แพ็กเกจ${entitlements.plan.name}หมดอายุแล้ว ตอนนี้ใช้สิทธิ์เท่าแพ็กเกจทดลอง (${entitlements.projectLimit} โปรเจกต์)`;
    return NextResponse.json(
      { ok: false, error: `${reason} — ใช้ไปแล้ว ${used} · ต่ออายุหรืออัปเกรดเพื่อเพิ่มโควตา` },
      { status: 402 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { leadId?: string; customerName?: string; input?: unknown }
    | null;

  let customerName = String(body?.customerName ?? '').trim();
  let input: QuoteInput | null = null;
  let leadId: string | null = null;

  if (body?.leadId) {
    if (!/^[0-9a-f-]{36}$/i.test(body.leadId)) {
      return NextResponse.json({ ok: false, error: 'รหัส lead ไม่ถูกต้อง' }, { status: 400 });
    }
    const { data: purchase } = await asUser
      .from('lead_purchases')
      .select('lead_id')
      .eq('lead_id', body.leadId)
      .maybeSingle();
    if (!purchase && user.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'ต้องซื้อ lead นี้ก่อน' }, { status: 403 });
    }

    // อ่าน lead ด้วยสิทธิ์ระดับระบบ เพราะต้องดึง snapshot มาตั้งต้นให้ครบ
    const admin = supabaseAdmin();
    const { data: lead } = (await admin
      ?.from('leads')
      .select('contact_name, calc_snapshot')
      .eq('id', body.leadId)
      .maybeSingle()) ?? { data: null };
    if (!lead) return NextResponse.json({ ok: false, error: 'ไม่พบ lead นี้' }, { status: 404 });

    leadId = body.leadId;
    customerName = customerName || String(lead.contact_name);
    const snapshot = lead.calc_snapshot as { input?: QuoteInput } | null;
    input = snapshot?.input ?? null;
  }

  if (body?.input) {
    const checked = validateQuoteInput(body.input);
    if ('error' in checked) {
      return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
    }
    input = {
      ...checked.value,
      rateOverride: sanitizeRateOverride((body.input as { rateOverride?: unknown }).rateOverride ?? {}, checked.value.userType),
    };
  }

  if (!customerName || customerName.length < 2) {
    return NextResponse.json({ ok: false, error: 'กรุณากรอกชื่อลูกค้า' }, { status: 400 });
  }

  const quote = input ? computeQuote({ ...input, advanced: sanitizeAdvanced(input.advanced ?? {}) }) : null;

  const { data, error } = await asUser
    .from('projects')
    .insert({
      installer_id: user.id,
      lead_id: leadId,
      customer_name: customerName,
      pea_type: input ? peaTypeOf(input) : null,
      status: 'draft',
      bill_input: input,
      rate_override: input?.rateOverride ?? null,
      results: quote ? { version: PROJECT_SNAPSHOT_VERSION, ...quote } : null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[projects] insert failed:', error.message);
    return NextResponse.json({ ok: false, error: 'สร้างโปรเจกต์ไม่สำเร็จ' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, id: data.id as string });
}
