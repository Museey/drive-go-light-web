/**
 * จำกัดสินค้าที่ใช้งาน 3,000 รายการ — ทางเข้าของแอป (ฟอร์ม · เปิดใช้งานกลับ · CSV · รายการค้างทำ)
 *
 * ฐานข้อมูลบังคับอยู่แล้ว (product-limit-db.test.ts) ที่นี่ตรวจว่าแอป:
 *   - ได้ข้อความไทยที่บอกว่าต้องทำอะไรต่อ ไม่ใช่ข้อความดิบจากทริกเกอร์
 *   - CSV ถูกปฏิเสธ "ก่อน" เขียนแถวแรก — ไม่ใช่แก้ราคาไปครึ่งไฟล์แล้วค่อยพัง
 *   - นับผ่าน Row Level Security ในนาม dgl_app — เห็นแค่สินค้าของอู่ตัวเอง
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PRODUCT_LIMIT, productLimitMessage } from '@drivegolight/core';
import { freshSchema } from '../../../tools/test-schema.mjs';
import { mapHeaders, parseCsv } from '../src/lib/csv';
import { createProductFromPendingWith } from '../src/lib/pending-core';
import { importProductsCsvWith } from '../src/lib/products-csv-core';
import {
  activeProductCountWith, ensureActivationRoomWith, ensureProductRoomWith, isProductLimitError,
  ProductLimitError,
} from '../src/lib/product-limit';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

const FULL = productLimitMessage({ kind: 'form' });

describe.skipIf(!DB_URL)('ทางเข้าของแอปเมื่อสินค้าที่ใช้งานครบ 3,000', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let full: string;
  let near: string;
  let userId: string;

  const addMany = (tenant: string, n: number, prefix: string, active = true) =>
    admin.query(
      `insert into products (tenant_id, code, name, unit, active, price_a)
       select $1, $2 || g, 'สินค้า ' || g, 'ชิ้น', $4, 100 from generate_series(1, $3::int) g`,
      [tenant, prefix, n, active]);
  const asShop = (tenant: string) => app.query(`select set_config('app.tenant_id', $1, false)`, [tenant]);
  const csv = (lines: string[]) => {
    const rows = parseCsv(['รหัสสินค้า,ชื่อสินค้า,หน่วยนับ,ราคา A', ...lines].join('\r\n'));
    return { rows, map: mapHeaders(rows[0]!) };
  };
  const priceOf = async (tenant: string, code: string) =>
    Number((await admin.query(`select price_a from products where tenant_id = $1 and code = $2`, [tenant, code])).rows[0].price_a);
  const failure = (p: Promise<unknown>) => p.then(() => null, (e) => e);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    const t = await admin.query(`insert into tenants (name) values ('อู่เต็ม'), ('อู่เกือบเต็ม') returning id`);
    full = t.rows[0].id;
    near = t.rows[1].id;
    await addMany(full, PRODUCT_LIMIT, 'F');
    await addMany(full, 2, 'OFF', false);
    await addMany(near, PRODUCT_LIMIT - 10, 'N');
    userId = (await admin.query(
      `insert into users (tenant_id, code, name, email, role) values ($1, 'U1', 'เจ้าของ', 'limit@example.com', 'owner')
       returning id`, [full])).rows[0].id;
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it('นับเฉพาะสินค้าที่ใช้งานของอู่ตัวเอง', async () => {
    await asShop(full);
    expect(await activeProductCountWith(app)).toBe(PRODUCT_LIMIT);
    await asShop(near);
    expect(await activeProductCountWith(app)).toBe(PRODUCT_LIMIT - 10);
  });

  it('แยกข้อผิดพลาดจากทริกเกอร์ของเราออกจากข้อผิดพลาดอื่น', async () => {
    await asShop(full);
    const err = await failure(app.query(
      `insert into products (tenant_id, code, name, unit) values (current_tenant_id(), 'RAW', 'ดิบ', 'ชิ้น')`));
    expect(isProductLimitError(err), String(err)).toBe(true);
    expect(isProductLimitError({ code: '53400' }), 'รหัสเดียวกันแต่ไม่ใช่ constraint ของเรา').toBe(false);
    expect(isProductLimitError({ code: '23505', constraint: 'products_active_limit' })).toBe(false);
    expect(isProductLimitError(null)).toBe(false);
  });

  it('ฟอร์มเพิ่มสินค้า: ครบแล้วได้ข้อความไทย · ยังมีที่ก็ผ่าน', async () => {
    await asShop(full);
    const err = await failure(ensureProductRoomWith(app, 1));
    expect(err).toBeInstanceOf(ProductLimitError);
    expect(err.message).toBe(FULL);

    await asShop(near);
    await expect(ensureProductRoomWith(app, 10)).resolves.toBeUndefined();
    expect((await failure(ensureProductRoomWith(app, 11)))?.message).toBe(FULL);
  });

  it('ฟอร์มแก้ไข: เปิดใช้งานสินค้าที่ปิดไว้ตอนครบถูกปฏิเสธ · แก้สินค้าที่ใช้งานอยู่แล้วหรือปิดใช้งานผ่าน', async () => {
    await asShop(full);
    const id = async (code: string) =>
      (await app.query(`select id from products where code = $1`, [code])).rows[0].id as string;

    expect((await failure(ensureActivationRoomWith(app, await id('OFF1'), true)))?.message).toBe(FULL);
    await expect(ensureActivationRoomWith(app, await id('F1'), true)).resolves.toBeUndefined();
    await expect(ensureActivationRoomWith(app, await id('OFF1'), false)).resolves.toBeUndefined();
  });

  it('CSV ที่เพิ่มรหัสใหม่ตอนครบ — ปฏิเสธทั้งไฟล์ก่อนเขียน แถวแก้ราคาที่มาก่อนไม่ถูกแก้', async () => {
    await asShop(full);
    const { rows, map } = csv(['F1,สินค้า 1,ชิ้น,555', 'NEW1,ของใหม่,ชิ้น,10', 'NEW2,ของใหม่ 2,ชิ้น,10', 'NEW1,ซ้ำในไฟล์,ชิ้น,10']);

    const err = await failure(importProductsCsvWith(app, userId, rows, map));
    expect(err?.message).toBe(productLimitMessage({ kind: 'csv', total: PRODUCT_LIMIT + 2, over: 2 }));
    expect(await priceOf(full, 'F1'), 'แถวก่อนหน้าต้องไม่ถูกแก้').toBe(100);
    expect((await admin.query(`select count(*)::int as n from products where tenant_id = $1 and code like 'NEW%'`, [full])).rows[0].n).toBe(0);
  });

  it('CSV ที่แก้แค่ของเดิมตอนครบ (รวมตัวที่ปิดไว้) ผ่าน · ไม่เปิดใช้งานตัวที่ปิดไว้', async () => {
    await asShop(full);
    const { rows, map } = csv(['F2,สินค้า 2,ชิ้น,222', 'OFF2,ปิดไว้,ชิ้น,333']);

    const result = await importProductsCsvWith(app, userId, rows, map);
    expect(result).toMatchObject({ created: 0, updated: 2 });
    expect(await priceOf(full, 'F2')).toBe(222);
    expect((await admin.query(`select active from products where tenant_id = $1 and code = 'OFF2'`, [full])).rows[0].active).toBe(false);
  });

  it('CSV ที่เติมพอดี 3,000 ผ่าน — รหัสซ้ำในไฟล์นับครั้งเดียว', async () => {
    await asShop(near);
    const lines = Array.from({ length: 10 }, (_, i) => `NEAR${i + 1},ของใหม่ ${i + 1},ชิ้น,10`);
    const { rows, map } = csv([...lines, 'NEAR1,ซ้ำ,ชิ้น,11']);

    const result = await importProductsCsvWith(app, userId, rows, map);
    expect(result).toMatchObject({ created: 10, updated: 1 });
    expect(await activeProductCountWith(app)).toBe(PRODUCT_LIMIT);
  });

  it('ลงทะเบียนรายการค้างทำตอนครบ — ได้ข้อความไทย ไม่ใช่ข้อความดิบจากฐานข้อมูล', async () => {
    await asShop(full);
    const err = await failure(createProductFromPendingWith(app, 'ของค้าง', {
      code: 'PEND1', name: 'ของค้าง', unit: 'ชิ้น', cost: 1, priceA: 2,
    }));
    expect(err).toBeInstanceOf(ProductLimitError);
    expect(err.message).toBe(FULL);
  });
});
