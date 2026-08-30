import { describe, expect, it } from 'vitest';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../src/lib/password';

describe('การแฮชรหัสผ่าน', () => {
  it('ตรวจรหัสผ่านที่ถูกต้องผ่าน', async () => {
    const hash = await hashPassword('รหัสผ่านที่ยาวพอสมควร');
    expect(await verifyPassword('รหัสผ่านที่ยาวพอสมควร', hash)).toBe(true);
  });

  it('รหัสผ่านผิดไม่ผ่าน', async () => {
    const hash = await hashPassword('รหัสผ่านที่ยาวพอสมควร');
    expect(await verifyPassword('รหัสผ่านอื่น', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('รหัสผ่านเดียวกันได้ hash คนละค่า (salt สุ่มทุกครั้ง)', async () => {
    const a = await hashPassword('abcdefghij');
    const b = await hashPassword('abcdefghij');
    expect(a).not.toBe(b);
    expect(await verifyPassword('abcdefghij', a)).toBe(true);
    expect(await verifyPassword('abcdefghij', b)).toBe(true);
  });

  it('เก็บพารามิเตอร์ไว้ในค่าที่บันทึก เพื่อให้ปรับความหนักในอนาคตได้', async () => {
    const hash = await hashPassword('abcdefghij');
    const [algo, N, r, p] = hash.split('$');
    expect(algo).toBe('scrypt');
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it('ผู้ใช้ที่ยังไม่มีรหัสผ่านไม่ผ่านการตรวจ', async () => {
    expect(await verifyPassword('อะไรก็ตาม', null)).toBe(false);
    expect(await verifyPassword('อะไรก็ตาม', '')).toBe(false);
  });

  it('ค่าที่เก็บไว้เสียหายคืน false ไม่โยน error', async () => {
    for (const bad of ['ไม่ใช่รูปแบบที่ถูก', 'scrypt$1$2$3', 'scrypt$x$y$z$aa$bb', 'bcrypt$1$2$3$aa$bb']) {
      expect(await verifyPassword('abcdefghij', bad), bad).toBe(false);
    }
  });

  it('รหัสผ่านภาษาไทยที่เขียนต่างรูปแบบแต่ค่าเท่ากันต้องผ่าน (normalize NFKC)', async () => {
    const composed = 'ก'.normalize('NFC') + 'ทดสอบรหัสผ่าน';
    const hash = await hashPassword(composed);
    expect(await verifyPassword(composed.normalize('NFD'), hash)).toBe(true);
  });
});

describe('เกณฑ์ความแข็งแรงของรหัสผ่าน', () => {
  it('สั้นเกินไปไม่ผ่าน', () => {
    expect(checkPasswordStrength('สั้น')).toContain('อย่างน้อย 10');
  });

  it('รหัสที่เดาง่ายไม่ผ่าน', () => {
    expect(checkPasswordStrength('mypassword123')).toContain('เดาง่าย');
    expect(checkPasswordStrength('drivegolight2569')).toContain('เดาง่าย');
  });

  it('มีช่องว่างหัวท้ายไม่ผ่าน — พิมพ์พลาดแล้วจำไม่ได้ว่าพิมพ์อะไรไป', () => {
    expect(checkPasswordStrength(' รหัสผ่านของฉัน')).toContain('ช่องว่าง');
    expect(checkPasswordStrength('รหัสผ่านของฉัน ')).toContain('ช่องว่าง');
  });

  it('ยาวพอและไม่ใช่คำที่เดาง่ายผ่าน', () => {
    expect(checkPasswordStrength('อู่ช่างเอรถสวย2569')).toBeNull();
    expect(checkPasswordStrength('correct-horse-battery')).toBeNull();
  });

  it('ยาวเกินไปไม่ผ่าน — กันคนส่งข้อมูลก้อนใหญ่มาให้ scrypt ทำงานหนัก', () => {
    expect(checkPasswordStrength('ก'.repeat(500))).toContain('ยาวเกินไป');
  });
});
