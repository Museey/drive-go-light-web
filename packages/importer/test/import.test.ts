/**
 * นำเข้าไฟล์สำรองข้อมูลจริงเข้า Postgres จริง แล้วอ่านกลับมาเทียบยอด
 *
 * เทสต์นี้ต้องมี Postgres — ตั้ง DATABASE_URL ก่อนรัน (ต้องเป็นผู้ใช้ที่สร้าง role ได้)
 *   docker run -d --name dgl_pg -e POSTGRES_PASSWORD=x -e POSTGRES_DB=dgl -p 5433:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/importer
 *
 * ตัวนำเข้าเชื่อมต่อด้วย role ธรรมดา (ไม่ใช่ superuser) เพื่อให้ RLS ทำงานจริงเหมือนตอนใช้งาน
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

// คอลัมน์ date (oid 1082) ต้องกลับมาเป็นสตริง 'YYYY-MM-DD'
// ถ้าปล่อยให้เป็น Date แล้วเรียก toISOString() จะเพี้ยนไป 1 วันในเขตเวลาไทย (UTC+7)
pg.types.setTypeParser(1082, (v) => v);
import {
  arDue, exTotals, poTotals, recTotals, salesDocs, vatChain,
} from '@drivegolight/core';
import { importBackup, normalizeBackup } from '../src/index.js';
import type { ImportResult } from '../src/index.js';
import { freshSchema } from '../../../tools/test-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const SCHEMA = resolve(ROOT, 'db/001_init.sql');
const FIXTURE = resolve(ROOT, 'fixtures/demo-backup.json');

const DB_URL = process.env.DATABASE_URL;

// เลขทศนิยมจาก Postgres กลับมาเป็นสตริง — แปลงเองเพื่อไม่ให้ pg ปัดค่า
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('นำเข้าไฟล์สำรองข้อมูลเข้า Postgres', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let raw: any;
  let db: any;
  let ctx: { vatRate: number };
  let result: ImportResult;

  beforeAll(async () => {
    raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    db = normalizeBackup(raw);
    ctx = { vatRate: db.shop.vatRate };

    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    // เริ่มจากสคีมาเปล่าทุกครั้ง
    await freshSchema(admin, ['db/001_init.sql']);

    await admin.query(`
      -- **ไม่ลบ role ทิ้ง** — role อยู่ระดับคลัสเตอร์ ถ้ามีฐานข้อมูลอื่นในเครื่องเดียวกัน
      -- ที่ยังมีสิทธิ์ของ role นี้ค้างอยู่ (เช่นฐานที่เอาไว้ลองอะไรสักอย่าง)
      -- คำสั่ง drop role จะล้มทั้งชุดทดสอบ ทั้งที่ไม่เกี่ยวกับสิ่งที่กำลังทดสอบเลย
      -- คืนสิทธิ์ในฐานนี้แล้วสร้างใหม่ถ้ายังไม่มี ก็พอแล้ว
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        else
          execute 'create role dgl_app login password ''apppass''';
        end if;
      end $$;
      alter role dgl_app login password 'apppass';
      grant usage on schema public to dgl_app;
      grant select, insert, update, delete on all tables in schema public to dgl_app;
      grant execute on all functions in schema public to dgl_app;
    `);

    app = new pg.Client({ connectionString: asUser(DB_URL!, 'dgl_app', 'apppass') });
    await app.connect();

    result = await importBackup(app, raw, { openingStockDate: '2026-08-28' });

    // importBackup ตั้ง app.tenant_id แบบ local ซึ่งหมดอายุเมื่อ commit
    // เทสต์ต้องตั้งระดับ session เองถึงจะอ่านข้อมูลกลับมาได้ — นี่คือ RLS ทำงานถูกต้อง
    await app.query(`select set_config('app.tenant_id', $1, false)`, [result.tenantId]);
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it('นำเข้าครบทุกอย่างตามจำนวนในไฟล์', async () => {
    const docTotal = db.quotes.length + db.invoices.length + db.receipts.length +
                     db.purchases.length + db.expenses.length;

    expect(result.counts.products).toBe(db.products.length);
    expect(result.counts.contacts).toBe(db.customers.length);
    expect(result.counts.documents).toBe(docTotal);

    const { rows } = await app.query(`
      select (select count(*) from products)  as products,
             (select count(*) from contacts)  as contacts,
             (select count(*) from vehicles)  as vehicles,
             (select count(*) from documents) as documents,
             (select count(*) from doc_items) as items,
             (select count(*) from payments)  as payments
    `);
    expect(n(rows[0].products)).toBe(db.products.length);
    expect(n(rows[0].contacts)).toBe(db.customers.length);
    expect(n(rows[0].documents)).toBe(docTotal);
    expect(n(rows[0].vehicles)).toBe(
      db.customers.reduce((s: number, c: any) => s + (c.vehicles?.length ?? 0), 0),
    );
    expect(n(rows[0].items)).toBeGreaterThan(1000);
    expect(n(rows[0].payments)).toBeGreaterThan(300);
  });

  it('ยอดของเอกสารขายทุกใบใน DB ตรงกับที่ core คำนวณจากไฟล์', async () => {
    const { rows } = await app.query(`
      select legacy_id, kind, net_amount, vat_amount, wht_amount, grand_total, payable
      from documents where kind in ('RC','IV','IVT')
    `);
    expect(rows.length).toBe(db.invoices.length + db.receipts.length);

    const byLegacy = new Map(rows.map((r) => [r.legacy_id, r]));
    for (const d of [...db.invoices, ...db.receipts]) {
      const t = recTotals(d, ctx);
      const row = byLegacy.get(`${d.kind}:${d.id}`);
      expect(row, `ไม่พบเอกสาร ${d.no} ใน DB`).toBeTruthy();
      expect(n(row.net_amount), `net ${d.no}`).toBe(t.net);
      expect(n(row.vat_amount), `vat ${d.no}`).toBe(t.vat);
      expect(n(row.wht_amount), `wht ${d.no}`).toBe(t.wht);
      expect(n(row.grand_total), `grand ${d.no}`).toBe(t.grand);
      expect(n(row.payable), `payable ${d.no}`).toBe(t.payable);
    }
  });

  it('ยอดของใบซื้อและค่าใช้จ่ายตรงกับที่ core คำนวณ', async () => {
    const { rows } = await app.query(
      `select legacy_id, kind, net_amount, vat_amount, wht_amount, payable
       from documents where kind in ('PO','EX')`,
    );
    const byLegacy = new Map(rows.map((r) => [r.legacy_id, r]));

    for (const p of db.purchases) {
      const t = poTotals(p, ctx);
      const row = byLegacy.get(`PO:${p.id}`);
      expect(n(row.net_amount), `net ${p.no}`).toBe(t.net);
      expect(n(row.payable), `payable ${p.no}`).toBe(t.payable);
      expect(n(row.wht_amount), `ใบซื้อห้ามมีภาษีหัก ณ ที่จ่าย ${p.no}`).toBe(0);
    }
    for (const e of db.expenses) {
      const t = exTotals(e, ctx);
      const row = byLegacy.get(`EX:${e.id}`);
      expect(n(row.net_amount), `net ${e.no}`).toBe(t.net);
      expect(n(row.wht_amount), `wht ${e.no}`).toBe(t.wht);
      expect(n(row.payable), `payable ${e.no}`).toBe(t.payable);
    }
  });

  it('ยอดลูกหนี้คงค้างรวมตรงกับที่คำนวณจากไฟล์', async () => {
    const expected = [...db.invoices, ...db.receipts]
      .map((d: any) => arDue(d, ctx))
      .filter((v) => v > 0.004)
      .reduce((a, b) => a + b, 0);

    const { rows } = await app.query(`
      select round(sum(d.payable - coalesce(p.paid, 0)), 2) as ar
      from documents d
      left join (select doc_id, sum(amount) as paid from payments group by doc_id) p on p.doc_id = d.id
      where d.direction = 'sell' and d.kind <> 'QT' and d.status = 'issued'
        and d.payable - coalesce(p.paid, 0) > 0.004
    `);

    expect(n(rows[0].ar)).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    expect(n(rows[0].ar)).toBeGreaterThan(0);
  });

  it('ภาษีขาย/ภาษีซื้อรายเดือนใน DB ตรงกับ vatChain ของ core', async () => {
    const chain = vatChain(
      { sales: salesDocs(db.invoices, db.receipts), purchases: db.purchases, expenses: db.expenses },
      ctx,
    );

    // ภาษีขายจาก DB — ใบเสร็จที่ออกต่อจากใบส่งมอบต้องไม่นับซ้ำ (parent_doc_id ชี้ไปที่ใบส่งมอบ)
    const { rows } = await app.query(`
      select to_char(doc_date, 'YYYY-MM') as key, round(sum(vat_amount), 2) as vat_out
      from documents
      where kind in ('IV','IVT')
         or (kind = 'RC' and (parent_doc_id is null
             or (select kind from documents p where p.id = documents.parent_doc_id) = 'QT'))
      group by 1 order by 1
    `);

    const fromDb = new Map(rows.map((r) => [r.key, n(r.vat_out)]));
    let checked = 0;
    for (const m of chain) {
      if (m.out === 0) continue;
      expect(fromDb.get(m.key), `ภาษีขายงวด ${m.key}`).toBeCloseTo(m.out, 2);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  /*
   * เทียบยอดก่อน VAT ของใบซื้อและค่าใช้จ่ายที่นำเข้าไป กับที่ core คำนวณจากไฟล์ต้นทาง
   *
   * เคยเทียบผ่าน profitAndLoss() ของ core ซึ่งเป็นสูตรงบของรุ่น 6.4 —
   * อ่านแล้วเหมือนกำลังบอกว่าเงินที่จ่ายซื้อของคือต้นทุนขาย ทั้งที่ระบบไม่ได้คิดแบบนั้น
   * ตรงนี้สนใจแค่ว่า "ยอดที่นำเข้าไปตรงกับยอดในไฟล์ไหม" จึงบวกเองตรง ๆ ชัดกว่า
   */
  it('ยอดก่อน VAT ของใบซื้อและค่าใช้จ่ายที่นำเข้า ตรงกับที่ core คำนวณจากไฟล์', async () => {
    const buys = db.purchases.reduce((s: number, p: any) => s + poTotals(p, ctx).net, 0);
    const opsNet = db.expenses
      .filter((e: any) => e.cat !== 'asset')
      .reduce((s: number, e: any) => s + exTotals(e, ctx).net, 0);

    const { rows } = await app.query(`
      select round(sum(net_amount), 2) as buys from documents where kind = 'PO'
    `);
    expect(n(rows[0].buys)).toBeCloseTo(Math.round(buys * 100) / 100, 2);

    const ops = await app.query(`
      select round(sum(net_amount), 2) as ops
      from documents where kind = 'EX' and expense_cat <> 'asset'
    `);
    expect(n(ops.rows[0].ops)).toBeCloseTo(Math.round(opsNet * 100) / 100, 2);
  });

  it('สายเอกสาร ใบเสนอราคา → ใบส่งมอบ → ใบเสร็จ ถูกผูกไว้ครบ', async () => {
    const linked = db.receipts.filter((r: any) => r.invId).length;
    const { rows } = await app.query(`
      select count(*) as c
      from documents rc
      join documents inv on inv.id = rc.parent_doc_id
      where rc.kind = 'RC' and inv.kind in ('IV','IVT')
    `);
    expect(n(rows[0].c)).toBe(linked);

    const fromQuote = await app.query(`
      select count(*) as c
      from documents inv
      join documents q on q.id = inv.parent_doc_id
      where inv.kind in ('IV','IVT') and q.kind = 'QT'
    `);
    expect(n(fromQuote.rows[0].c)).toBe(db.invoices.filter((i: any) => i.quoteId).length);
  });

  it('ยอดสต๊อกคงเหลือตรงกับ products.qty ในไฟล์', async () => {
    const { rows } = await app.query(`
      select p.legacy_id, s.qty_on_hand from products p join product_stock s on s.product_id = p.id
    `);
    const byLegacy = new Map(rows.map((r) => [r.legacy_id, n(r.qty_on_hand)]));

    for (const p of db.products) {
      expect(byLegacy.get(p.id), `สินค้า ${p.code}`).toBeCloseTo(Number(p.qty) || 0, 3);
    }
  });

  it('ตัวนับเลขที่เอกสารต่อจากของเดิม ไม่ออกเลขซ้ำ', async () => {
    const { rows } = await app.query(
      `select kind, last_no from doc_sequences order by kind`,
    );
    const seq = new Map(rows.map((r) => [r.kind, n(r.last_no)]));
    expect(seq.get('RC')).toBe(db.seq.r);
    expect(seq.get('IVT')).toBe(db.seq.ivt);
    expect(seq.get('PO')).toBe(db.seq.p);

    // เลขถัดไปต้องมากกว่าเลขสูงสุดที่ใช้ไปแล้วเสมอ
    const next = await app.query(
      `select next_doc_no(current_tenant_id(), 'RC', '') as no`,
    );
    expect(n(next.rows[0].no)).toBe(db.seq.r + 1);

    const used = await app.query(
      `select max(substring(doc_no from '[0-9]+$')::int) as used from documents where kind = 'RC'`,
    );
    expect(n(next.rows[0].no)).toBeGreaterThan(n(used.rows[0].used));
  });

  it('รายการที่ยังไม่ผูกทะเบียนสินค้ายังอยู่ครบ (รายการค้างทำ)', async () => {
    const expected = [...db.quotes, ...db.invoices, ...db.receipts, ...db.purchases, ...db.expenses]
      .flatMap((d: any) => d.items)
      .filter((it: any) => !it.pid).length;

    const { rows } = await app.query(`select count(*) as c from doc_items where product_id is null`);
    expect(n(rows[0].c)).toBe(expected);
    expect(expected).toBeGreaterThan(100);
  });

  it('บอกเรื่องที่ผู้ใช้ต้องรู้ผ่าน warnings ไม่เงียบ', () => {
    expect(result.warnings.some((w) => w.includes('เจ้าของกิจการ'))).toBe(true);
  });

  /**
   * ผู้เรียกที่กำลังจะสร้างบัญชีเจ้าของให้ทันที ไม่ควรถูกเตือนว่ายังไม่มีบัญชีเจ้าของ
   * คำเตือนที่ไม่จริงทำให้คนเลิกอ่านคำเตือนทั้งหมด ซึ่งอันตรายกว่าไม่เตือนเลย
   */
  it('ไม่เตือนเรื่องบัญชีเจ้าของ เมื่อผู้เรียกบอกว่าจะสร้างให้ต่อทันที', async () => {
    /* ลบอู่ที่สร้างขึ้นทิ้งเมื่อจบ — เทสต์ข้ออื่นในไฟล์นี้นับจำนวนแถวรวมของทุกอู่
       ถ้าปล่อยให้ค้างไว้ ข้อที่นับจะแดงโดยไม่เกี่ยวกับสิ่งที่มันทดสอบ
       ทุกตารางผูกกับ tenants แบบ on delete cascade จึงหายตามหมด */
    let tenantId = '';
    try {
      const r = await importBackup(app, raw, {
        openingStockDate: '2026-08-28', ownerFollows: true,
      });
      tenantId = r.tenantId;
      expect(r.warnings.some((w) => w.includes('ยังไม่มีบัญชีเจ้าของกิจการ'))).toBe(false);
    } finally {
      if (tenantId) await admin.query('delete from tenants where id = $1', [tenantId]);
      await app.query(`select set_config('app.tenant_id', $1, false)`, [result.tenantId]);
    }
  }, 60_000);

  it('นำเข้าไฟล์เดิมซ้ำได้เป็นอู่ใหม่ ไม่ชนกับของเดิม', async () => {
    const second = await importBackup(app, raw, { openingStockDate: '2026-08-28' });
    expect(second.tenantId).not.toBe(result.tenantId);

    // อู่ใหม่เห็นเฉพาะข้อมูลตัวเอง
    await app.query('begin');
    await app.query(`select set_config('app.tenant_id', $1, true)`, [second.tenantId]);
    const mine = await app.query('select count(*) as c from documents');
    await app.query('commit');
    expect(n(mine.rows[0].c)).toBe(result.counts.documents);

    // นับรวมทั้งสองอู่จากฝั่ง admin (ไม่ติด RLS)
    const all = await admin.query('select count(*) as c from documents');
    expect(n(all.rows[0].c)).toBe(result.counts.documents * 2);
  }, 120_000);

  it('ไฟล์ที่โครงสร้างผิดถูกปฏิเสธ ไม่ทิ้งข้อมูลค้าง', async () => {
    const before = await admin.query('select count(*) as c from tenants');
    await expect(importBackup(app, { ...raw, products: 'ไม่ใช่ array' } as any))
      .rejects.toThrow(/products ต้องเป็น array/);
    const after = await admin.query('select count(*) as c from tenants');
    expect(n(after.rows[0].c)).toBe(n(before.rows[0].c));
  });
});

/** สลับผู้ใช้ใน connection string โดยคงส่วนอื่นไว้ */
function asUser(url: string, user: string, pass: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = pass;
  return u.toString();
}
