/**
 * จำกัดสินค้าที่ใช้งานไม่เกิน 3,000 รายการต่ออู่ (ผู้ใช้กำหนด 16 ก.ย. 2569)
 *
 * นับเฉพาะที่เปิดใช้งาน — ระบบไม่มีทางลบสินค้า ปิดใช้งานสินค้าที่เลิกขายจึงเป็นทางเดียวที่คืนที่ได้
 * ฐานข้อมูลบังคับเลขเดียวกันนี้ (db/032_product_limit.sql) — เทสต์ฝั่งเว็บตรวจว่าสองที่ตรงกัน
 */
import { describe, expect, it } from 'vitest';
import {
  activeProductsOf, csvNewProducts, PRODUCT_LIMIT, productLimitHint, productLimitMessage, productRoomAfter,
} from '../src/index.js';

describe('PRODUCT_LIMIT', () => {
  it('3,000 รายการ', () => {
    expect(PRODUCT_LIMIT).toBe(3000);
  });
});

describe('productRoomAfter — หลังเพิ่มแล้วเกินไหม', () => {
  it('เพิ่มจนครบพอดีได้', () => {
    expect(productRoomAfter(2999, 1)).toEqual({ total: 3000, over: 0 });
  });
  it('เกินหนึ่งรายการ', () => {
    expect(productRoomAfter(3000, 1)).toEqual({ total: 3001, over: 1 });
  });
  it('อู่ที่เกินอยู่แล้ว (มาก่อนมีกติกา) เพิ่มศูนย์รายการ ไม่ถือว่าทำให้เกิน', () => {
    expect(productRoomAfter(3200, 0).over).toBe(0);
  });
});

describe('activeProductsOf — นับสินค้าที่ใช้งานในไฟล์สำรอง', () => {
  it('ไม่มี active = ใช้งาน (ไฟล์รุ่นเก่าไม่มีฟิลด์นี้) · active: false = ปิดใช้งาน', () => {
    expect(activeProductsOf([{ id: 1 }, { id: 2, active: true }, { id: 3, active: false }])).toBe(2);
  });
  it('ไม่ใช่ array — ศูนย์ ไม่พัง', () => {
    expect(activeProductsOf(undefined)).toBe(0);
  });
});

describe('csvNewProducts — รหัสใหม่ในไฟล์ CSV', () => {
  it('นับเฉพาะรหัสที่ยังไม่มี · รหัสซ้ำในไฟล์นับครั้งเดียว · แถวไม่มีรหัสหรือชื่อไม่นับ', () => {
    const rows = [
      { code: 'A', name: 'ก' }, { code: 'B', name: 'ข' }, { code: 'B', name: 'ข ซ้ำ' },
      { code: 'C', name: '' }, { code: '', name: 'ไม่มีรหัส' }, { code: 'OLD', name: 'ของเดิม' },
    ];
    expect(csvNewProducts(rows, new Set(['OLD']))).toBe(2);
  });
});

describe('productLimitMessage', () => {
  it('ฟอร์ม — บอกทางแก้', () => {
    expect(productLimitMessage({ kind: 'form' }))
      .toBe('สินค้าที่ใช้งานครบ 3,000 รายการแล้ว — ปิดใช้งานสินค้าที่เลิกขายก่อนจึงจะเพิ่มได้');
  });
  it('CSV — บอกยอดรวมและส่วนที่เกิน ว่าไม่ได้นำเข้าเลย', () => {
    expect(productLimitMessage({ kind: 'csv', total: 3120, over: 120 }))
      .toBe('ไฟล์นี้จะทำให้มีสินค้าใช้งาน 3,120 รายการ เกิน 120 รายการ — ไม่ได้นำเข้าเลย');
  });
  it('กู้คืน — บอกว่าข้อมูลเดิมยังอยู่', () => {
    expect(productLimitMessage({ kind: 'restore', total: 3050, over: 50 }))
      .toBe('ไฟล์นี้มีสินค้าใช้งาน 3,050 รายการ เกินกำหนด 3,000 — ไม่ได้กู้คืน ข้อมูลเดิมยังอยู่ครบ');
  });
});

/**
 * ข้อความบนหัวการ์ดนำเข้าสินค้า (07.3) — เดิมเขียนว่า "ครั้งละไม่เกิน 3,000 รายการต่อไฟล์"
 * ซึ่งไม่จริงสองทาง: ไม่มีเพดานต่อไฟล์แยกต่างหาก และร้านที่มีของอยู่แล้วเหลือที่น้อยกว่านั้น
 * (ผู้ใช้แจ้ง 18 ก.ย. 2569)
 */
describe('ข้อความบอกที่ว่างก่อนนำเข้าสินค้า', () => {
  it('บอกที่ว่างที่เหลือจริง ไม่ใช่เพดานต่อไฟล์', () => {
    const t = productLimitHint(2900);
    expect(t).toContain('2,900');
    expect(t).toContain('3,000');
    expect(t, 'ที่เหลือจริงคือ 100 ไม่ใช่ 3,000').toContain('100');
    expect(t).not.toContain('ต่อไฟล์');
  });

  it('ร้านเปล่ายังบอกที่ว่างเต็มจำนวน', () => {
    expect(productLimitHint(0)).toContain('3,000');
  });

  it('เต็มแล้วบอกว่าต้องปิดใช้งานก่อน ไม่ใช่บอกว่าเหลือ 0', () => {
    const t = productLimitHint(PRODUCT_LIMIT);
    expect(t).toContain('ปิดใช้งาน');
    expect(t).not.toMatch(/เพิ่มได้อีก/);
  });

  it('อู่ที่เกินอยู่แล้วตั้งแต่ก่อนมีกติกา ไม่บอกที่ว่างติดลบ', () => {
    expect(productLimitHint(PRODUCT_LIMIT + 50)).toContain('ปิดใช้งาน');
    expect(productLimitHint(PRODUCT_LIMIT + 50)).not.toContain('-50');
  });
});
