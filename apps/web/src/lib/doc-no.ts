/**
 * เลขที่เอกสารรูปแบบใหม่ (13 ก.ย. 69) — ใช้ร่วมกันทุกเอกสาร
 *
 *   คำนำหน้า + ปี พ.ศ. 2 หลักท้าย + เดือน + วัน + ลำดับ 4 หลัก
 *   เช่น QT6909130007 = ใบเสนอราคา วันที่ 13 ก.ย. 2569 ใบที่ 7 ของเดือน
 *
 * **ลำดับรีเซ็ตรายเดือน** — คีย์ period ที่ส่งเข้า next_*_no คือ "ปปดด"
 * ของเดิมส่ง period ว่าง ซึ่งทำให้เลขนับต่อเนื่องไม่รีเซ็ตแม้ชื่อจะมีเดือนอยู่
 * เลขเก่า (เช่น QT-202609-001) ไม่ถูกแตะ — เป็นข้อความอิสระในตาราง documents
 */

/** 'YYYY-MM-DD' → 'ปปดด' (พ.ศ. 2 หลัก + เดือน) ใช้เป็นคีย์รีเซ็ตรายเดือน */
export function docNoPeriod(iso: string): string {
  const y = Number(iso.slice(0, 4));
  if (!y || iso.length < 10) throw new Error(`วันที่ไม่ถูกต้องสำหรับออกเลขที่: ${iso}`);
  const be2 = String((y + 543) % 100).padStart(2, '0');
  return be2 + iso.slice(5, 7);
}

/** ประกอบเลขที่เอกสารเต็ม */
export function formatDocNo(prefix: string, iso: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`ลำดับเลขที่ไม่ถูกต้อง: ${seq}`);
  return `${prefix}${docNoPeriod(iso)}${iso.slice(8, 10)}${String(seq).padStart(4, '0')}`;
}
