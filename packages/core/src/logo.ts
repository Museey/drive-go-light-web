/**
 * โลโก้ร้าน — เก็บเป็น data URI ในคอลัมน์เดียว (`shops.logo_url` / `tenants.logo_url`)
 *
 * ไม่ได้ไป object storage เพราะรูปเดียวต่ออู่ ขนาดไม่กี่สิบ KB และต้องติดไปกับไฟล์สำรอง
 * ให้ย้ายเครื่องแล้วโลโก้ตามไปด้วย การเก็บเป็น data URI จึงจบในที่เดียว
 *
 * เกณฑ์อยู่ที่นี่ที่เดียว เพราะโลโก้เข้าระบบได้สองทาง — อัปโหลดที่หน้า 07.1
 * กับนำเข้า/กู้คืนจากไฟล์สำรอง ถ้าแยกกันเขียน วันหนึ่งทางหนึ่งจะรับของที่อีกทางปฏิเสธ
 */

/** ชนิดไฟล์ที่รับ — ตรงกับที่ช่องอัปโหลดในหน้าตั้งค่าร้านรับ */
export const LOGO_TYPES = ['png', 'jpeg', 'webp', 'svg+xml'] as const;

/** 200 KB — ใหญ่พอสำหรับโลโก้ที่ย่อแล้ว และไม่ทำให้ไฟล์สำรองบวมจนส่งต่อกันไม่ไหว */
export const LOGO_MAX_BYTES = 200 * 1024;

const LOGO_RE = new RegExp(
  `^data:image/(${LOGO_TYPES.map((t) => t.replace('+', '\\+')).join('|')});base64,`,
);

/** เป็น data URI ของรูปที่รับได้หรือไม่ — ไม่ได้ตรวจขนาด (ดู LOGO_MAX_BYTES) */
export function isLogoDataUri(value: unknown): boolean {
  return typeof value === 'string' && LOGO_RE.test(value);
}
