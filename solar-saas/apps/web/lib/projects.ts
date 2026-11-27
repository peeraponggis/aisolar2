/**
 * โปรเจกต์ของช่าง (ชั้นธุรกิจที่ 3 — mini-CRM)
 *
 * ตาราง projects มีนโยบาย "own projects" อยู่แล้ว ทุกการอ่าน/เขียนจึงทำในนามผู้ใช้ผ่าน
 * supabaseAsUser() ได้เลย ไม่ต้องใช้ secret key และไม่ต้องเพิ่ม SQL ใด ๆ
 *
 * เก็บทั้งอินพุตและผลลัพธ์เป็น jsonb ตามหลักที่ล็อกไว้ตั้งแต่เฟส 0 — โครงสร้างของเอนจิน
 * เปลี่ยนได้โดยไม่ต้อง migrate ตาราง และใบเสนอราคาเดิมไม่เปลี่ยนตามอัตราค่าไฟที่แก้ทีหลัง
 */
import type { Quote, QuoteInput } from './quote';

export const PROJECT_STATUSES = ['draft', 'quoted', 'won', 'lost'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'ร่าง',
  quoted: 'เสนอราคาแล้ว',
  won: 'ปิดการขายได้',
  lost: 'ไม่ได้งาน',
};

/** ลำดับในไปป์ไลน์ ใช้เรียงคอลัมน์และตัดสินว่าปุ่มไหนควรโผล่ */
export const NEXT_STATUS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['quoted', 'lost'],
  quoted: ['won', 'lost'],
  won: ['quoted'],
  lost: ['draft'],
};

export interface ProjectRow {
  id: string;
  lead_id: string | null;
  customer_name: string;
  pea_type: number | null;
  status: ProjectStatus;
  bill_input: QuoteInput | null;
  rate_override: Record<string, number> | null;
  results: (Quote & { version: number }) | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary {
  id: string;
  leadId: string | null;
  customerName: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  /** ตัวเลขย่อสำหรับหน้ารายการ — null ถ้ายังไม่เคยคำนวณ */
  kwp: number | null;
  priceVat: number | null;
  paybackYears: number | null;
}

export const PROJECT_SNAPSHOT_VERSION = 1;

export function toSummary(row: ProjectRow): ProjectSummary {
  const r = row.results;
  return {
    id: row.id,
    leadId: row.lead_id,
    customerName: row.customer_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kwp: r?.sizing?.actualKwp ?? null,
    priceVat: r?.sizing?.sellingPriceVat ?? null,
    paybackYears: r?.finance?.paybackYears ?? null,
  };
}

/** ประเภทผู้ใช้ไฟที่บันทึกเป็นตัวเลขในตาราง (คอลัมน์ pea_type) */
export function peaTypeOf(input: QuoteInput): number {
  return input.userType === 'home' ? 1 : input.userType === 'small' ? 2 : 3;
}
