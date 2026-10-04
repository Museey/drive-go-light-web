/**
 * ใบไหนในสายเอกสารขายตัดสต๊อก (ผู้ใช้กำหนด 4 ต.ค. 2569 · ตรงกับรุ่น 6.4)
 *
 * ใบส่งมอบตัดตั้งแต่บันทึก · ใบเสร็จที่ออกต่อจากใบส่งมอบนั้นไม่ตัดซ้ำ ·
 * ใบส่งมอบที่ออกก่อนเปลี่ยนกติกา (ไม่เคยตัด) ใบเสร็จต่อของมันยังตัดเหมือนเดิม (ผู้ใช้เลือก) ·
 * แก้ใบส่งมอบเก่าที่ใบเสร็จตัดไปแล้ว ต้องไม่ตัดซ้ำ
 *
 * ตัดและคืนสต๊อกด้วยฟังก์ชันตัวเดียวกับที่บันทึก/ยกเลิกเอกสารใช้ ไม่ใช่ใส่แถวปลอม —
 * คำว่า "ถือสต๊อก" ดูจากบัญชีสต๊อกจริง ถ้าใส่แถวเอง เทสต์จะผ่านกับข้อมูลที่ระบบไม่มีวันสร้าง
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';
import { consumeStock, receiveStock, returnDocStock } from '../src/lib/stock-cost';
import { cutsStockWith, holdsStockWith, receiptHoldsStockWith } from '../src/lib/sales-stock';
import type { SalesKind } from '../src/lib/sales-rules';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ใบไหนในสายเอกสารขายตัดสต๊อก', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let part: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่ทดสอบตัดสต๊อก') returning id`)).rows[0].id;

    /* ต่อในนาม role ของแอปจริง — อ่านบัญชีสต๊อกผ่าน RLS แบบเดียวกับเครื่องจริง */
    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

    part = (await app.query(
      `insert into products (tenant_id, code, name, unit, last_cost, price_a)
       values (current_tenant_id(), 'BRK-1', 'ผ้าเบรกหน้า', 'ชุด', 400, 800) returning id`)).rows[0].id;
    await receiveStock(app, { productId: part, qty: 50, costAmount: 20000, movedOn: '2026-10-01', reason: 'opening' });
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    await app.query(`delete from stock_moves where doc_id is not null`);
    await app.query(`delete from documents`);
  });

  let seq = 0;
  const addDoc = async (kind: SalesKind, parent: string | null = null, status = 'issued') => {
    const { rows } = await app.query(
      `insert into documents (tenant_id, kind, doc_no, status, vat_mode, parent_doc_id, voided_at)
       values (current_tenant_id(), $1, $2, $3::doc_status, $4, $5, $6) returning id`,
      [kind, `${kind}-${++seq}`, status, kind === 'IV' ? 'none' : 'ex', parent,
       status === 'void' ? new Date().toISOString() : null]);
    return rows[0].id as string;
  };
  /** ตัดสต๊อกให้ใบนี้ด้วยตัวเดียวกับที่ saveSalesDoc ใช้ */
  const cut = (docId: string, qty = 2) =>
    consumeStock(app, { productId: part, qty, movedOn: '2026-10-04', reason: 'sale', docId });
  const qtyOnHand = async () =>
    Number((await app.query(`select qty_on_hand from product_stock where product_id = $1`, [part])).rows[0].qty_on_hand);

  /* ===================================================================== */

  it('ใบเสนอราคาไม่ตัด · ใบส่งมอบใบใหม่ตัด (ทั้งไม่มี VAT และมี VAT) · ใบเสร็จที่ไม่มีใบส่งมอบนำหน้าตัด', async () => {
    const qt = await addDoc('QT');
    expect(await cutsStockWith(app, { kind: 'QT', parentDocId: null })).toBe(false);
    expect(await cutsStockWith(app, { kind: 'IV', parentDocId: qt })).toBe(true);
    expect(await cutsStockWith(app, { kind: 'IVT', parentDocId: null })).toBe(true);
    /* ขายหน้าร้าน · ออกใบเสร็จตรงจากใบเสนอราคา */
    expect(await cutsStockWith(app, { kind: 'RC', parentDocId: null })).toBe(true);
    expect(await cutsStockWith(app, { kind: 'RC', parentDocId: qt })).toBe(true);
  });

  it('ใบเสร็จที่ออกต่อจากใบส่งมอบที่ตัดสต๊อกแล้ว ไม่ตัดซ้ำ', async () => {
    const iv = await addDoc('IV');
    await cut(iv);
    expect(await holdsStockWith(app, iv)).toBe(true);
    expect(await cutsStockWith(app, { kind: 'RC', parentDocId: iv })).toBe(false);
  });

  it('ใบส่งมอบที่ออกก่อนเปลี่ยนกติกา (ไม่เคยตัด) — ใบเสร็จต่อของมันยังตัดเหมือนเดิม', async () => {
    const oldIv = await addDoc('IVT');
    expect(await holdsStockWith(app, oldIv)).toBe(false);
    expect(await cutsStockWith(app, { kind: 'RC', parentDocId: oldIv })).toBe(true);
  });

  it('ใบที่ยกเลิกแล้วคืนของครบ ไม่ถือสต๊อกแล้ว', async () => {
    const iv = await addDoc('IV');
    await cut(iv, 3);
    await returnDocStock(app, iv, { movedOn: '2026-10-04', note: 'ยกเลิก' });
    expect(await holdsStockWith(app, iv)).toBe(false);
  });

  it('แก้ใบส่งมอบที่ยังไม่มีใบเสร็จ หรือใบเสร็จไม่ได้ตัด — คืนแล้วตัดใหม่ สต๊อกเท่ากับรายการใหม่', async () => {
    const before = await qtyOnHand();
    const iv = await addDoc('IV');
    await cut(iv, 2);
    expect(await qtyOnHand()).toBe(before - 2);

    /* ทางเดียวกับ saveSalesDoc ตอนแก้: คืนของเดิมทั้งหมด แล้วถามว่าตัดใหม่ไหม */
    await returnDocStock(app, iv, { movedOn: '2026-10-04', note: 'คืนสต๊อกเพราะแก้ไขเอกสาร' });
    expect(await cutsStockWith(app, { id: iv, kind: 'IV', parentDocId: null })).toBe(true);
    await cut(iv, 5);
    expect(await qtyOnHand()).toBe(before - 5);

    /* ใบเสร็จต่อแบบใหม่ไม่ถือสต๊อก — ใบส่งมอบยังเป็นคนตัดเหมือนเดิม */
    await addDoc('RC', iv);
    expect(await receiptHoldsStockWith(app, iv)).toBe(false);
    expect(await cutsStockWith(app, { id: iv, kind: 'IV', parentDocId: null })).toBe(true);
  });

  it('แก้ใบส่งมอบเก่าที่ใบเสร็จต่อของมันเป็นคนตัดสต๊อก — ใบส่งมอบไม่ตัดซ้ำ', async () => {
    const oldIv = await addDoc('IV');
    const rc = await addDoc('RC', oldIv);
    await cut(rc, 2);
    expect(await receiptHoldsStockWith(app, oldIv)).toBe(true);
    expect(await cutsStockWith(app, { id: oldIv, kind: 'IV', parentDocId: null })).toBe(false);

    /* ใบเสร็จนั้นถูกยกเลิก (คืนของแล้ว) — ใบส่งมอบกลับมาเป็นคนตัด */
    await returnDocStock(app, rc, { movedOn: '2026-10-04', note: 'ยกเลิก' });
    await app.query(`update documents set status = 'void', voided_at = now() where id = $1`, [rc]);
    expect(await receiptHoldsStockWith(app, oldIv)).toBe(false);
    expect(await cutsStockWith(app, { id: oldIv, kind: 'IV', parentDocId: null })).toBe(true);
  });

  it('ใบที่แก้ใช้ชนิดและใบต้นทางจากฐาน ไม่เชื่อหน้าเว็บ', async () => {
    const iv = await addDoc('IV');
    /* ส่งมาว่าเป็นใบเสนอราคาเพื่อเลี่ยงการตัด — ฐานบอกว่าเป็นใบส่งมอบ */
    expect(await cutsStockWith(app, { id: iv, kind: 'QT', parentDocId: null })).toBe(true);

    const held = await addDoc('IVT');
    await cut(held);
    const rc = await addDoc('RC', held);
    /* ส่งมาว่าไม่มีใบต้นทาง — ฐานบอกว่าต่อจากใบส่งมอบที่ตัดไปแล้ว */
    expect(await cutsStockWith(app, { id: rc, kind: 'RC', parentDocId: null })).toBe(false);
  });

  it('อ่านบัญชีสต๊อกของอู่ตัวเองเท่านั้น', async () => {
    const iv = await addDoc('IV');
    await cut(iv);
    const other = (await admin.query(`insert into tenants (name) values ('อู่ข้างเคียง') returning id`)).rows[0].id;
    await app.query(`select set_config('app.tenant_id', $1, false)`, [other]);
    try {
      expect(await holdsStockWith(app, iv), 'อู่อื่นมองไม่เห็นบัญชีสต๊อกของใบนี้').toBe(false);
    } finally {
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
    }
  });
});
