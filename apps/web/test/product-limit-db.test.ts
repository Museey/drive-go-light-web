/**
 * จำกัดสินค้าที่ใช้งานไม่เกิน 3,000 รายการต่ออู่ — บังคับที่ฐานข้อมูล (db/032_product_limit.sql)
 *
 * บังคับที่ฐานเพราะสินค้าเกิดได้ห้าทาง (ฟอร์ม · เปิดใช้งานกลับ · CSV · รายการค้างทำ · กู้คืนไฟล์)
 * และทางที่หกในวันหน้าจะไม่มีใครจำได้ว่าต้องตรวจ — แบบเดียวกับโควตารูปสินค้า
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PRODUCT_LIMIT } from '@drivegolight/core';
import { freshSchema } from '../../../tools/test-schema.mjs';

const DB_URL = process.env.DATABASE_URL;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** เลขในไฟล์ SQL ต้องตรงกับค่าคงที่ของ core — ข้อความในแอปบอกเลขเดียวกับที่ฐานบังคับ */
describe('เลข 3,000 ตรงกันทุกที่', () => {
  it.each(['db/001_init.sql', 'db/032_product_limit.sql'])('%s', (f) => {
    const text = readFileSync(resolve(ROOT, f), 'utf8');
    const m = text.match(/lim\s+constant\s+int\s*:=\s*(\d+)/);
    expect(m, `${f} ต้องมีค่าคงที่ lim`).toBeTruthy();
    expect(Number(m![1])).toBe(PRODUCT_LIMIT);
  });
});

describe.skipIf(!DB_URL)('ฐานข้อมูลบังคับสินค้าที่ใช้งานไม่เกิน 3,000 ต่ออู่', () => {
  let admin: pg.Client;
  let shopA: string;
  let shopB: string;

  /** ใส่หลายแถวใน "คำสั่งเดียว" — แบบเดียวกับที่กู้คืนไฟล์ทำ */
  const addMany = (c: pg.Client, tenant: string, n: number, prefix: string, active = true) =>
    c.query(
      `insert into products (tenant_id, code, name, unit, active)
       select $1, $2 || g, 'สินค้า ' || g, 'ชิ้น', $4 from generate_series(1, $3::int) g`,
      [tenant, prefix, n, active]);
  const activeCount = async (tenant: string) =>
    Number((await admin.query(`select count(*) from products where tenant_id = $1 and active`, [tenant])).rows[0].count);
  const expectLimitError = async (p: Promise<unknown>) => {
    const err = await p.then(() => null, (e) => e);
    expect(err, 'ต้องถูกปฏิเสธ').toBeTruthy();
    expect(err.code).toBe('53400');
    expect(err.constraint).toBe('products_active_limit');
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    const t = await admin.query(`insert into tenants (name) values ('อู่เต็ม ก'), ('อู่เต็ม ข') returning id`);
    shopA = t.rows[0].id;
    shopB = t.rows[1].id;
    await addMany(admin, shopA, PRODUCT_LIMIT, 'A');
  }, 120_000);

  afterAll(async () => { await admin?.end(); });

  it('ใส่ครบ 3,000 ในคำสั่งเดียวได้', async () => {
    expect(await activeCount(shopA)).toBe(PRODUCT_LIMIT);
  });

  it('ตัวที่ 3,001 ถูกปฏิเสธด้วยรหัสของเรา', async () => {
    await expectLimitError(addMany(admin, shopA, 1, 'A-OVER'));
    expect(await activeCount(shopA)).toBe(PRODUCT_LIMIT);
  });

  it('สินค้าปิดใช้งานเพิ่มได้แม้ครบ — นับเฉพาะที่ใช้งาน', async () => {
    await addMany(admin, shopA, 5, 'A-OFF', false);
    expect(await activeCount(shopA)).toBe(PRODUCT_LIMIT);
  });

  it('เปิดใช้งานสินค้าที่ปิดไว้ตอนครบ ถูกปฏิเสธ', async () => {
    await expectLimitError(admin.query(
      `update products set active = true where tenant_id = $1 and code = 'A-OFF1'`, [shopA]));
  });

  it('แก้ราคาสินค้าเดิมตอนครบได้ปกติ', async () => {
    const r = await admin.query(`update products set price_a = 99 where tenant_id = $1 and code = 'A1'`, [shopA]);
    expect(r.rowCount).toBe(1);
  });

  it('ปิดใช้งานหนึ่งตัวแล้วเปิดตัวอื่นแทนได้หนึ่งตัว', async () => {
    await admin.query(`update products set active = false where tenant_id = $1 and code = 'A2'`, [shopA]);
    await admin.query(`update products set active = true where tenant_id = $1 and code = 'A-OFF1'`, [shopA]);
    expect(await activeCount(shopA)).toBe(PRODUCT_LIMIT);
    await expectLimitError(admin.query(
      `update products set active = true where tenant_id = $1 and code = 'A-OFF2'`, [shopA]));
  });

  it('คำสั่งเดียวหลายแถวข้ามเส้น — ยกเลิกทั้งคำสั่ง ไม่มีแถวไหนเข้า · อู่อื่นไม่ถูกนับรวม', async () => {
    await addMany(admin, shopB, PRODUCT_LIMIT - 1, 'B');
    expect(await activeCount(shopB), 'อู่ ข ไม่ถูกนับรวมกับอู่ ก ที่เต็มแล้ว').toBe(PRODUCT_LIMIT - 1);
    await expectLimitError(addMany(admin, shopB, 2, 'B-TWO'));
    expect(await activeCount(shopB)).toBe(PRODUCT_LIMIT - 1);
  });

  it('สองทรานแซกชันแข่งกันเพิ่มตัวสุดท้าย — ได้เข้าแค่หนึ่ง', async () => {
    const c1 = new pg.Client({ connectionString: DB_URL });
    const c2 = new pg.Client({ connectionString: DB_URL });
    await c1.connect();
    await c2.connect();
    try {
      await c1.query('begin');
      await c2.query('begin');
      await addMany(c1, shopB, 1, 'B-RACE1');
      /* c2 ต้องรอ c1 (ล็อกรายอู่) — ถ้าไม่รอ ทั้งคู่จะเห็น 2,999 + ของตัวเอง แล้วผ่านทั้งคู่ */
      const second = addMany(c2, shopB, 1, 'B-RACE2').then(() => 'ok', (e) => e);
      await new Promise((r) => setTimeout(r, 300));
      await c1.query('commit');
      const got = await second;
      await c2.query('rollback');
      expect(got, 'ทรานแซกชันที่สองต้องถูกปฏิเสธ').not.toBe('ok');
      expect((got as { code?: string }).code).toBe('53400');
      expect(await activeCount(shopB)).toBe(PRODUCT_LIMIT);
    } finally {
      await c1.end();
      await c2.end();
    }
  });
});
