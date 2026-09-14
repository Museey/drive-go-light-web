'use client';

/** ปุ่มพิมพ์ — ต้องเป็น client component เพราะเรียก window.print() */
export function PrintButton({ label = 'พิมพ์เอกสาร' }: { label?: string }) {
  return (
    <button className="btn primary" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
