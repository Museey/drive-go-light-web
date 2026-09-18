/**
 * โลโก้ร้าน — เก็บเป็น data URI ในคอลัมน์เดียว (shops.logo_url)
 *
 * เกณฑ์ตรวจอยู่ที่นี่ที่เดียว เพราะมีสองทางที่โลโก้เข้าระบบได้:
 * อัปโหลดที่หน้า 07.1 กับนำเข้า/กู้คืนจากไฟล์สำรอง ถ้าเกณฑ์ต่างกันเมื่อไร
 * จะมีทางหนึ่งที่ปล่อยของที่อีกทางปฏิเสธเข้ามาได้
 */
import { describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES, LOGO_TYPES, isLogoDataUri } from '../src/index.js';

const uri = (type: string, bytes = 10) => `data:image/${type};base64,${'A'.repeat(bytes)}`;

describe('โลโก้ร้าน', () => {
  it('รับเฉพาะชนิดไฟล์ที่หน้าตั้งค่ารับ', () => {
    for (const t of LOGO_TYPES) expect(isLogoDataUri(uri(t)), t).toBe(true);
    for (const t of ['gif', 'bmp', 'tiff', 'x-icon']) expect(isLogoDataUri(uri(t)), t).toBe(false);
  });

  it('ต้องเป็น data URI ที่ฝังรูปมาจริง ไม่ใช่ลิงก์หรือข้อความเปล่า', () => {
    expect(isLogoDataUri('https://example.com/logo.png')).toBe(false);
    expect(isLogoDataUri('data:text/html;base64,AAAA')).toBe(false);
    expect(isLogoDataUri('iVBORw0KGgo=')).toBe(false);
    expect(isLogoDataUri('')).toBe(false);
    expect(isLogoDataUri(null)).toBe(false);
    expect(isLogoDataUri(undefined)).toBe(false);
  });

  it('ขีดจำกัดขนาดเป็นเลขเดียวกับที่หน้า 07.1 ใช้ — 200 KB', () => {
    expect(LOGO_MAX_BYTES).toBe(200 * 1024);
  });
});
