/**
 * หน้าตั้งรหัสผ่านของ **คอนโซล** ต้องออกจากบัญชีที่ค้างในเบราว์เซอร์ก่อนพาไปหน้าล็อกอิน
 *
 * หน้าล็อกอินเด้งคนที่มีเซสชันอยู่แล้วไปหน้าแรกทันที ถ้าไม่ล้างเซสชันเดิม
 * คนที่เพิ่งตั้งรหัสจะถูกพากลับเข้าบัญชีเดิมโดยไม่มีโอกาสกรอกอีเมลใหม่ (ผู้ใช้แจ้ง 16 ก.ย. 2569)
 *
 * ตรวจจากไฟล์เพราะเดินเส้นทางจริงต้องมีบัญชีผู้ให้บริการกับเซสชันของคอนโซล
 * **ฝั่งอู่ไม่ได้อยู่ในไฟล์นี้** — พฤติกรรมต่างกันแล้ว (ตั้งเสร็จเข้าระบบให้เลย ผู้ใช้กำหนด)
 * และมีเทสต์เบราว์เซอร์จริงคุมอยู่ที่ e2e/setup-logout.spec.ts ซึ่งตรวจถึงการเพิกถอนเซสชันเดิมในฐานด้วย
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../src/app');

describe('หน้าตั้งรหัสผ่านของคอนโซล', () => {
  const src = readFileSync(join(APP, 'ops/setup/[token]/page.tsx'), 'utf8');

  it('ล้างเซสชันเดิมก่อนพาไปหน้าล็อกอินของคอนโซล', () => {
    expect(src, 'ต้องเรียกออกจากระบบ').toContain('opsSignOut()');
    expect(src.indexOf('opsSignOut()'), 'ต้องเรียกก่อนพาไปหน้าล็อกอิน')
      .toBeLessThan(src.lastIndexOf("redirect('/ops/login')"));
  });
});
