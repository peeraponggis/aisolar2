'use client';

/** ปุ่มสั่งพิมพ์ — ซ่อนตอนพิมพ์เอง ผู้ใช้เลือก "บันทึกเป็น PDF" ในกล่องพิมพ์ของเบราว์เซอร์ */
export default function PrintButton() {
  return (
    <button type="button" className="print-btn no-print" onClick={() => window.print()}>
      🖨 พิมพ์ / บันทึกเป็น PDF
    </button>
  );
}
