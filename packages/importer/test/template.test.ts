/**
 * แบบร่างเปิดอู่ใหม่ต้องผ่านการตรวจเสมอ
 *
 * ONBOARDING.md เคยบอกว่า "ส่งไฟล์เปล่าที่มีแค่ shop เข้าไป" ซึ่งไม่จริง —
 * ตัวตรวจบังคับว่าต้องมี array ครบทุกกลุ่มแม้จะว่าง ผู้ให้บริการที่ทำตามเอกสาร
 * จะเจอ error 7 บรรทัดตอนเปิดอู่ให้ลูกค้ารายแรก
 *
 * เทสต์นี้อ่านไฟล์แบบร่างจริง ถ้าวันหน้าตัวตรวจบังคับ key เพิ่ม
 * แบบร่างจะแดงเองก่อนที่ลูกค้าจะเจอ
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateBackup } from '../src/normalize.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('tools/new-shop.template.json', () => {
  const raw = JSON.parse(readFileSync(resolve(repo, 'tools/new-shop.template.json'), 'utf8'));

  it('ผ่านการตรวจโดยไม่ต้องแก้อะไรเลย', () => {
    expect(validateBackup(raw)).toEqual([]);
  });

  it('ว่างจริง ไม่มีข้อมูลตัวอย่างหลงมา', () => {
    for (const key of ['categories', 'products', 'customers', 'purchases',
                       'expenses', 'quotes', 'invoices', 'receipts']) {
      expect(raw[key], key).toEqual([]);
    }
  });
});
