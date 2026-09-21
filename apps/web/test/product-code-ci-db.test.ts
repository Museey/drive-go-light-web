/**
 * รหัสสินค้าห้ามซ้ำแบบไม่สนตัวพิมพ์ใหญ่เล็ก (ไมเกรชัน 034 · ผู้ใช้สั่ง 21 ก.ย. 2569)
 *
 * BRK-101 กับ brk-101 ต้องเป็นรหัสเดียวกัน — การยิงบาร์โค้ดและการค้นเทียบแบบไม่สนตัวพิมพ์อยู่แล้ว
 * ถ้าให้อยู่คู่กัน ยิงแล้วระบบหยิบตัวไหนก็ได้ตัวเดียว ของผิดตัวเข้าบิลโดยไม่มีอะไรบอก
 *
 * ข้อสำคัญที่สุดคือไมเกรชันต้องเจอคู่ซ้ำ**ในนามเจ้าของตารางที่โดน RLS บังคับ** แบบเดียวกับ Render
 * ไม่ใช่ในนาม superuser ที่ข้าม RLS ได้ — ตรวจแบบนั้นแล้วผ่านในเครื่อง แต่บนเครื่องจริงเห็น 0 แถว
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema, TEST_OWNER } from '../../../tools/test-schema.mjs';
import { mapHeaders, parseCsv } from '../src/lib/csv';
import { importProductsCsvWith } from '../src/lib/products-csv-core';
import { findByScanWith } from '../src/lib/scan';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;
const MIGRATION = readFileSync(resolve(ROOT, 'db/034_product_code_ci.sql'), 'utf8');

describe.skipIf(!DB_URL)('รหัสสินค้าห้ามซ้ำแบบไม่สนตัวพิมพ์', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let shopA: string;
  let shopB: string;
  let userId: string;

  const asShop = (t: string) => app.query(`select set_config('app.tenant_id', $1, false)`, [t]);
  const addProduct = (t: string, code: string) => admin.query(
    `insert into products (tenant_id, code, name, unit) values ($1, $2, $2, 'ชิ้น') returning id`, [t, code]);
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: Error & { code?: string; constraint?: string }) => e);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบรหัส ก'), ('อู่ทดสอบรหัส ข') returning id`);
    shopA = t.rows[0].id;
    shopB = t.rows[1].id;
    userId = (await admin.query(
      `insert into users (tenant_id, code, name, email, role) values ($1, 'U1', 'เจ้าของ', 'ci@example.com', 'owner') returning id`,
      [shopA])).rows[0].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query('delete from stock_moves');
    await admin.query('delete from products');
    await admin.query(`create unique index if not exists products_code_ci_uidx on products (tenant_id, upper(code))`);
  });

  it('BRK-101 มีแล้ว เพิ่ม brk-101 ไม่ได้ — ฐานปฏิเสธด้วยชื่อที่ข้อความแจ้งผู้ใช้จับได้', async () => {
    await asShop(shopA);
    await app.query(`insert into products (tenant_id, code, name, unit) values (current_tenant_id(), 'BRK-101', 'ผ้าเบรก', 'ชุด')`);
    const err = await failure(app.query(
      `insert into products (tenant_id, code, name, unit) values (current_tenant_id(), 'brk-101', 'ผ้าเบรกพิมพ์เล็ก', 'ชุด')`));

    expect(err?.code).toBe('23505');
    expect(err?.constraint).toBe('products_code_ci_uidx');
    /* friendlyDbError เลือกข้อความจากชื่อ constraint — ต้องมี "code" และต้องไม่มี "barcode" */
    expect(err?.constraint).toContain('code');
    expect(err?.constraint).not.toContain('barcode');
  });

  it('คนละอู่ใช้รหัสเดียวกันได้ตามเดิม ไม่ว่าตัวพิมพ์ไหน', async () => {
    await addProduct(shopA, 'BRK-101');
    await expect(addProduct(shopB, 'brk-101')).resolves.toBeTruthy();
    await expect(addProduct(shopB, 'BRK-102')).resolves.toBeTruthy();
  });

  it('นำเข้า CSV ที่เขียนรหัสเป็นตัวเล็ก = แก้สินค้าเดิม ไม่ใช่สร้างใหม่จนนำเข้าล้ม', async () => {
    await addProduct(shopA, 'BRK-101');
    await asShop(shopA);
    const rows = parseCsv(['รหัสสินค้า,ชื่อสินค้า,หน่วยนับ,ราคา A', 'brk-101,ผ้าเบรกหน้า,ชุด,650'].join('\r\n'));
    const map = mapHeaders(rows[0]!);

    const result = await importProductsCsvWith(app, userId, rows, map);
    expect(result).toMatchObject({ created: 0, updated: 1, errors: [] });

    const { rows: all } = await admin.query(`select code, name, price_a from products where tenant_id = $1`, [shopA]);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ code: 'BRK-101', name: 'ผ้าเบรกหน้า', price_a: '650.00' });
  });

  it('ยิงรหัสตัวเล็กยังเจอสินค้าตัวเดียวที่ถูกต้อง', async () => {
    const id = (await addProduct(shopA, 'BRK-101')).rows[0].id;
    await asShop(shopA);
    await expect(findByScanWith(app, 'brk-101')).resolves.toEqual({ kind: 'one', productId: id });
  });

  describe('ไมเกรชัน 034 บนฐานที่มีคู่ซ้ำอยู่แล้ว', () => {
    /** รันไมเกรชันในนามเจ้าของตาราง (ไม่ใช่ superuser) — RLS บังคับเหมือน role ที่ Render ให้มา */
    const runAsOwner = async () => {
      await admin.query('begin');
      try {
        await admin.query(`set local role ${TEST_OWNER}`);
        await admin.query(MIGRATION);
        await admin.query('commit');
        return null;
      } catch (e) {
        await admin.query('rollback');
        return e as Error & { detail?: string };
      }
    };

    beforeEach(async () => {
      await admin.query('drop index if exists products_code_ci_uidx');
    });

    it('พิสูจน์กับดัก: เจ้าของตารางอ่านรวดเดียวโดยไม่ตั้งอู่ ได้ 0 แถวทั้งที่มีข้อมูล', async () => {
      await addProduct(shopA, 'BRK-101');
      await admin.query('begin');
      await admin.query(`set local role ${TEST_OWNER}`);
      const { rows } = await admin.query('select count(*)::int as n from products');
      await admin.query('rollback');
      expect(rows[0].n, 'ถ้าข้อนี้ไม่เป็น 0 แปลว่าเทสต์ไม่ได้จำลองสภาพของ Render').toBe(0);
    });

    it('มีคู่ซ้ำ → หยุด บอกชื่ออู่และรหัสทุกคู่ ไม่สร้าง index', async () => {
      await addProduct(shopA, 'BRK-101');
      await addProduct(shopA, 'brk-101');
      await addProduct(shopA, 'OIL-5');
      await addProduct(shopB, 'Filter-1');
      await addProduct(shopB, 'FILTER-1');
      await addProduct(shopB, 'brk-101');        // อยู่คนละอู่กับ BRK-101 — ไม่นับเป็นคู่ซ้ำ

      const err = await runAsOwner();
      /* ทั้งหมดอยู่ใน message — ตัวรันไมเกรชันพิมพ์แค่ message ลง log ของ deploy ไม่พิมพ์ detail */
      expect(err?.message).toBe(
        'มีรหัสสินค้าที่ต่างกันแค่ตัวพิมพ์ใหญ่เล็กอยู่แล้ว — ให้อู่เปลี่ยนรหัสตัวใดตัวหนึ่งก่อน แล้วค่อย deploy ใหม่'
        + '\nคู่ที่ชนกัน:\n  อู่ทดสอบรหัส ก: BRK-101 / brk-101\n  อู่ทดสอบรหัส ข: FILTER-1 / Filter-1');

      const idx = await admin.query(`select 1 from pg_indexes where indexname = 'products_code_ci_uidx'`);
      expect(idx.rowCount, 'ล้มแล้วต้องย้อนกลับหมด').toBe(0);
    });

    it('ไม่มีคู่ซ้ำ → สร้าง index ได้ แล้วกันของใหม่ทันที', async () => {
      await addProduct(shopA, 'BRK-101');
      await addProduct(shopB, 'brk-101');

      expect(await runAsOwner()).toBeNull();
      const err = await failure(addProduct(shopA, 'Brk-101'));
      expect(err?.constraint).toBe('products_code_ci_uidx');
    });
  });
});
