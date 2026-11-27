/**
 * Theme manager (เฟส 0) — ใช้ได้ทั้ง vanilla และเรียกจาก React hook
 * guest: จำใน localStorage / สมาชิก: sync ลง profiles.theme ผ่าน Supabase (เฟส 2)
 */

export const THEMES = [
  { id: 'solar-amber', name: 'Solar Amber', description: 'ธีมหลัก อบอุ่น น่าเชื่อถือ' },
  { id: 'engineer-blue', name: 'Engineer Blue', description: 'สายวิศวกรรม โทนเดิมที่คุ้นเคย' },
  { id: 'emerald-energy', name: 'Emerald Energy', description: 'พลังงานสะอาด ภาพลักษณ์ ESG' },
  { id: 'midnight-pro', name: 'Midnight Pro', description: 'โหมดมืด ใช้งานต่อเนื่องสบายตา' },
  { id: 'minimal-slate', name: 'Minimal Slate', description: 'เรียบหรู เหมาะกับลูกค้าองค์กร' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'pi_theme';
const DEFAULT_THEME: ThemeId = 'solar-amber';

export function getTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : DEFAULT_THEME;
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id);
  window.localStorage.setItem(STORAGE_KEY, id);
  // เฟส 2: ถ้าล็อกอินอยู่ ให้ sync ขึ้น profiles.theme ด้วย
  // await supabase.from('profiles').update({ theme: id }).eq('id', userId)
}

/** เรียกใน <head> ก่อน render เพื่อกัน flash ธีมผิด (inline script) */
export const THEME_INIT_SNIPPET = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
