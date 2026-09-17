/**
 * จำนวนของบรรทัดรายการในฟอร์ม (ผู้ใช้กำหนด 17 ก.ย. 2569)
 *
 *   บรรทัดที่ยังไม่กรอก → 0 (เดิม 1 ตามต้นแบบ — บรรทัดว่างขึ้น 1 ดูเหมือนมีของ)
 *   บรรทัดว่างที่เริ่มมีของ (พิมพ์ชื่อ/รหัส · เลือกสินค้า) และจำนวนยังเป็น 0 → 1 ให้เอง กดบันทึกได้ทันทีเหมือนเดิม
 *   ลบจนบรรทัดกลับเป็นว่าง → 0
 *   ผู้ใช้พิมพ์จำนวนเอง (patch มี qty) → ใช้ค่านั้นเสมอ
 *
 * ใช้ร่วมกันทุกฟอร์มที่มีตารางรายการ — รายรับ · รายจ่าย · ใบเคลม · ชุดอะไหล่
 * แต่ละฟอร์มนิยาม "บรรทัดที่มีของ" ของตัวเอง (ตรงกับที่ฝั่งเซิร์ฟเวอร์ตัดบรรทัดว่างทิ้ง) จึงส่ง isReal มา
 */

export const BLANK_QTY = 0;

export function patchLine<T extends { qty: number }>(line: T, patch: Partial<T>, isReal: (l: T) => boolean): T {
  const next = { ...line, ...patch };
  if ('qty' in patch) return next;
  const was = isReal(line);
  const now = isReal(next);
  if (!was && now && next.qty === 0) return { ...next, qty: 1 };
  if (was && !now) return { ...next, qty: BLANK_QTY };
  return next;
}
