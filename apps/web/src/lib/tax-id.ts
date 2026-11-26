/**
 * เลขประจำตัวผู้เสียภาษี — 13 หลัก
 *
 * ช่องกรอกเป็น 13 ช่องแยกกันแบบแบบฟอร์มสรรพากร (ผู้ใช้กำหนด 19 ก.ย. 2569)
 * ตัวจัดค่าอยู่ที่นี่เพื่อให้ทดสอบได้โดยไม่ต้องเปิดเบราว์เซอร์ และให้ฝั่งเซิร์ฟเวอร์ใช้ตัวเดียวกัน
 */
export const TAX_ID_LEN = 13;

/** เหลือเฉพาะตัวเลข ตัดส่วนที่เกิน 13 หลักทิ้ง — วางมาแบบมีขีดคั่นก็ใช้ได้ */
export function taxIdDigits(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '').slice(0, TAX_ID_LEN);
}

/** กระจายลงช่อง — ได้ 13 ช่องเสมอ ช่องที่ยังไม่มีเลขเป็นค่าว่าง */
export function taxIdBoxes(value: unknown): string[] {
  const d = taxIdDigits(value);
  return Array.from({ length: TAX_ID_LEN }, (_, i) => d[i] ?? '');
}

/**
 * หลักที่ 13 ตรงกับสูตรของกรมการปกครอง / สรรพากรไหม — ใช้ได้ทั้งเลขบัตรประชาชนและเลขนิติบุคคล
 * ไม่ได้บอกว่าเลขนี้มีอยู่จริง แค่จับเลขที่พิมพ์ผิดหนึ่งหลักหรือสลับหลักได้เกือบทั้งหมด
 */
export function taxIdChecksumOk(value: unknown): boolean {
  const d = taxIdDigits(value);
  if (d.length !== TAX_ID_LEN) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(d[12]);
}
