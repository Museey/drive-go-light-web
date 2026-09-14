/**
 * รหัสแถวในฐานข้อมูลเป็น uuid ทุกตาราง
 *
 * หน้ารายใบรับรหัสจาก URL ตรง ๆ ถ้าส่งต่อให้ Postgres ทั้งที่ไม่ใช่ uuid
 * จะได้ error `invalid input syntax for type uuid` แล้วหน้าพังเป็น 500
 * — ลิงก์พิมพ์ผิดหรือหน้าที่ยังไม่มี (เคยเจอกับ /income/walkin) ควรได้ 404 แทน
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
