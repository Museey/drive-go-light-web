/**
 * ปุ่มส่งออกของลูกหนี้และเจ้าหนี้
 *
 * ตรวจสองอย่างที่พังแล้วไม่มีอาการ — **หัวคอลัมน์ในไฟล์ต้องตรงกับที่เห็นบนจอ**
 * (ไม่งั้นคนทำบัญชีต้องเดาว่าคอลัมน์ไหนคืออะไร) และ **ลิงก์ต้องพาตัวกรองไปด้วย**
 * (ไฟล์ที่ได้ทั้งหมดทั้งที่บนจอกรองอยู่ คือไฟล์ที่เอาไปกระทบยอดไม่ได้)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AP_HEADERS, AR_HEADERS } from '../src/lib/csv';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../src/app/finance');

const read = (p: string) => readFileSync(join(APP, p), 'utf8');

describe('ส่งออกลูกหนี้และเจ้าหนี้', () => {
  it('มีเส้นทางส่งออกทั้งสองฝั่ง', () => {
    expect(readdirSync(join(APP, 'ar'))).toContain('csv');
    expect(readdirSync(join(APP, 'ap'))).toContain('csv');
  });

  it('หัวคอลัมน์ตรงกับที่แสดงบนจอ', () => {
    const arPage = read('ar/page.tsx');
    for (const h of ['เลขที่', 'ชนิด', 'ลูกค้า', 'ทะเบียน', 'วันที่', 'ครบกำหนด']) {
      expect(arPage, `หน้าลูกหนี้ไม่มีคอลัมน์ ${h}`).toContain(`>${h}<`);
    }
    /* คอลัมน์ในไฟล์ต้องครอบคลุมที่เห็นบนจอ บวกวันเกินกำหนดที่บนจอเป็นป้ายสี */
    expect(AR_HEADERS).toContain('ทะเบียนรถ');
    expect(AR_HEADERS).toContain('เกินกำหนด (วัน)');
    expect(AP_HEADERS).toContain('อ้างอิง');
    expect(AP_HEADERS).toContain('เกินกำหนด (วัน)');
  });

  it('ทั้งสองเส้นทางบังคับสิทธิ์ส่งออกของแท็บตัวเอง', () => {
    expect(read('ar/csv/route.ts')).toContain(`requireExport('finance', 'ar')`);
    expect(read('ap/csv/route.ts')).toContain(`requireExport('finance', 'ap')`);
  });

  it('ไฟล์มี BOM ให้ Excel ภาษาไทยเปิดได้', () => {
    for (const f of ['ar/csv/route.ts', 'ap/csv/route.ts']) {
      expect(read(f), f).toContain('BOM +');
    }
  });

  /* ลิงก์ที่ลืมพาตัวกรองไปด้วยจะได้ไฟล์ทั้งหมดทั้งที่บนจอกรองอยู่ —
     ผิดแบบที่ไม่มีอะไรฟ้อง เพราะไฟล์ก็เปิดได้ปกติ แค่มีแถวเกินมา */
  it('ลิงก์ส่งออกพาคำค้นและตัวกรองเกินกำหนดไปด้วย', () => {
    for (const f of ['ar/page.tsx', 'ap/page.tsx']) {
      const src = read(f);
      expect(src, f).toContain('csvQuery');
      expect(src, f).toContain(`...(sp.q ? { q: sp.q } : {})`);
      expect(src, f).toContain(`...(onlyOverdue ? { overdue: '1' } : {})`);
    }
  });

  it('เส้นทางอ่านตัวกรองเดียวกับที่หน้าจอส่งมา', () => {
    for (const f of ['ar/csv/route.ts', 'ap/csv/route.ts']) {
      const src = read(f);
      expect(src, f).toContain(`sp.get('q')`);
      expect(src, f).toContain(`sp.get('overdue') === '1'`);
    }
  });
});
