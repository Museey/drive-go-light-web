/**
 * รายการค้างทำต้องไม่รวมบรรทัดชุดอะไหล่ (029)
 *
 * บรรทัดชุดไม่มี product_id โดยตั้งใจ — ถ้าไม่กันไว้ ขายชุดทุกครั้งจะขึ้นเป็นรายการค้างทำ
 * และผูกชื่อชุดเข้าสินค้าจะเขียน product_id ทับบรรทัดชุด
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { freshSchema } from '../../../tools/test-schema.mjs';
import { linkPendingWith, listPendingItemsWith } from '../src/lib/pending-core';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('รายการค้างทำ', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let kitLine: string;
  let looseLine: string;
  let productId: string;

  const KIT_NAME = 'ชุดอะไหล่ซ่อมบำรุง ถ่ายน้ำมันเครื่อง (น้ำมันเครื่อง, กรอง)';
  const LOOSE_NAME = 'ผ้าเบรกยี่ห้อที่ยังไม่ลงทะเบียน';
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

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

    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    const tenant = (await importBackup(app, fixture, { tenantName: 'อู่ทดสอบค้างทำ', openingStockDate: '2026-08-28' })).tenantId;
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenant]);

    const rc = (await app.query(`select id from documents where kind = 'RC' and status = 'issued' order by doc_no limit 1`)).rows[0];
    productId = (await app.query(`select id from products order by code limit 1`)).rows[0].id;
    const kit = (await app.query(
      `insert into kits (tenant_id, code, name, price) values (current_tenant_id(), 'KIT-001', 'ถ่ายน้ำมันเครื่อง', 900)
       returning id`)).rows[0].id;
    const next = (await app.query(`select coalesce(max(line_no), 0) + 1 as n from doc_items where doc_id = $1`, [rc.id])).rows[0].n;
    kitLine = (await app.query(
      `insert into doc_items (tenant_id, doc_id, line_no, product_id, code, oem, name, unit, qty, unit_price, is_service, disc_pct, kit_id)
       values (current_tenant_id(), $1, $2, null, 'KIT-001', '', $3, 'ชุด', 1, 900, false, 0, $4) returning id`,
      [rc.id, next, KIT_NAME, kit])).rows[0].id;
    looseLine = (await app.query(
      `insert into doc_items (tenant_id, doc_id, line_no, product_id, code, oem, name, unit, qty, unit_price, is_service, disc_pct)
       values (current_tenant_id(), $1, $2, null, '', '', $3, 'ชุด', 2, 450, false, 0) returning id`,
      [rc.id, next + 1, LOOSE_NAME])).rows[0].id;
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it('บรรทัดชุดอะไหล่ไม่ขึ้นเป็นรายการค้างทำ แต่บรรทัดที่พิมพ์เองยังขึ้น', async () => {
    const names = (await listPendingItemsWith(app)).map((p) => p.nameNorm);
    expect(names).not.toContain(norm(KIT_NAME));
    expect(names).toContain(norm(LOOSE_NAME));
  });

  it('ผูกชื่อชุดเข้าสินค้าไม่แตะบรรทัดชุด · ผูกชื่อที่พิมพ์เองยังได้', async () => {
    expect(await linkPendingWith(app, norm(KIT_NAME), productId)).toBe(0);
    const kitRow = (await app.query(`select product_id, kit_id from doc_items where id = $1`, [kitLine])).rows[0];
    expect(kitRow.product_id, 'บรรทัดชุดต้องไม่ถูกผูกสินค้า').toBeNull();
    expect(kitRow.kit_id).not.toBeNull();

    expect(await linkPendingWith(app, norm(LOOSE_NAME), productId)).toBe(1);
    const loose = (await app.query(`select product_id from doc_items where id = $1`, [looseLine])).rows[0];
    expect(loose.product_id).toBe(productId);
  });
});
