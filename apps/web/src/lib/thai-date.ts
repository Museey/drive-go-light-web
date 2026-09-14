/**
 * วันที่แบบ วว/ดด/ปป (พ.ศ. 2 หลัก) ↔ ISO 'YYYY-MM-DD'
 *
 * ช่องวันที่ของเบราว์เซอร์บังคับให้แสดง ค.ศ. ตาม locale เครื่อง — ผู้ใช้ขอ พ.ศ. ทั้งระบบ
 * จึงใช้ช่องพิมพ์ของเราเอง รับ 13/09/69 (และยอมรับ 13/09/2569, 13-9-69 ด้วย)
 * ปี 2 หลักถือเป็น 25xx เสมอ — โปรแกรมนี้ไม่มีเอกสารก่อน พ.ศ. 2500
 */

export function parseThaiDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let be = Number(m[3]);
  if (m[3].length === 2) be += 2500;
  const y = be - 543;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1957) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;   // 31/02 เป็นต้น
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String((y + 543) % 100).padStart(2, '0')}`;
}
