/**
 * ตั้งรหัสผ่านตามลิงก์แล้วต้องออกจากบัญชีที่ค้างในเบราว์เซอร์ก่อน
 *
 * หน้าล็อกอินทั้งสองฝั่งเด้งคนที่มีเซสชันอยู่แล้วไปหน้าแรกทันที ถ้าตั้งรหัสเสร็จแล้วไม่ล้างเซสชันเดิม
 * คนที่เพิ่งตั้งรหัสของอู่ใหม่จะถูกพากลับเข้าอู่เดิมโดยไม่มีโอกาสกรอกอีเมลใหม่ (ผู้ใช้แจ้ง 16 ก.ย. 2569)
 *
 * ฝั่งอู่มีเทสต์เบราว์เซอร์จริงที่ e2e/setup-logout.spec.ts
 * ฝั่งคอนโซลตรวจจากไฟล์ เพราะต้องมีบัญชีผู้ให้บริการกับเซสชันของคอนโซลถึงจะเดินเส้นทางนั้นได้
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../src/app');

describe('หน้าตั้งรหัสผ่าน', () => {
  const cases = [
    ['อู่', 'setup/[token]/page.tsx', 'signOut()', "redirect('/login')"],
    ['คอนโซล', 'ops/setup/[token]/page.tsx', 'opsSignOut()', "redirect('/ops/login')"],
  ] as const;

  for (const [ชื่อ, rel, signOutCall, redirectCall] of cases) {
    it(`ฝั่ง${ชื่อ} — ล้างเซสชันเดิมก่อนพาไปหน้าล็อกอิน`, () => {
      const src = readFileSync(join(APP, rel), 'utf8');
      expect(src, 'ต้องเรียกออกจากระบบ').toContain(signOutCall);
      expect(src.indexOf(signOutCall), 'ต้องเรียกก่อนพาไปหน้าล็อกอิน')
        .toBeLessThan(src.lastIndexOf(redirectCall));
    });
  }
});
