'use client';

import { useEffect, useState } from 'react';
import { THEMES, applyTheme, getTheme, type ThemeId } from '@/styles/theme-manager';

export default function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(THEMES[0].id);

  // อ่านธีมที่จำไว้หลัง hydrate — ตัว inline script ใน <head> ตั้ง data-theme ให้แล้ว
  useEffect(() => setTheme(getTheme()), []);

  const pick = (id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
  };

  return (
    <div className="theme-picker" role="radiogroup" aria-label="เลือกธีมสี">
      <span className="lbl">ธีม</span>
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={`ธีม ${t.name} — ${t.description}`}
          title={t.name}
          className={`swatch sw-${t.id}`}
          onClick={() => pick(t.id)}
        />
      ))}
    </div>
  );
}
