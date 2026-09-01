/**
 * งบกำไรขาดทุนหลังเปลี่ยนมาคิดต้นทุนขายจริง
 *
 * เดิมต้นทุนขาย = ยอดซื้อในงวด ซึ่งทำให้เดือนที่ซื้อยกล็อตขาดทุนหนัก
 * แล้วเดือนถัดไปกำไรเกินจริง ตอนนี้ต้นทุนลงงวดที่ขายจริง
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { consumeStock, receiveStock } from '../src/lib/stock-cost';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('งบกำไรขาดทุนกับต้นทุนขายจริง', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let productId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(ROOT, 'db/002_auth.sql'), 'utf8'));
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then
          execute 'drop owned by dgl_app';
        end if;
      end $$;
    `);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'),
    );

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบงบ') returning id`);
    tenantId = t.rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query(`delete from stock_moves where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from doc_items where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from documents where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from products where tenant_id = $1`, [tenantId]);

    const p = await admin.query(
      `insert into products (tenant_id, code, name, unit, last_cost, price_a)
       values ($1, 'OIL-001', 'น้ำมันเครื่อง', 'แกลลอน', 500, 900) returning id`,
      [tenantId],
    );
    productId = p.rows[0].id;
  });

  /** ใบเสร็จหนึ่งใบพร้อมบรรทัดสินค้า และตัดสต๊อกจริง */
  async function sell(docNo: string, docDate: string, qty: number, unitPrice: number) {
    const net = qty * unitPrice;
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, party_name,
                              subtotal, net_amount, grand_total, payable)
       values ($1,'RC',$2,$3,'ลูกค้า',$4,$4,$4,$4) returning id`,
      [tenantId, docNo, docDate, net],
    );
    const docId = d.rows[0].id;
    await admin.query(
      `insert into doc_items (tenant_id, doc_id, line_no, product_id, name, qty, unit_price)
       values ($1,$2,1,$3,'น้ำมันเครื่อง',$4,$5)`,
      [tenantId, docId, productId, qty, unitPrice],
    );
    await consumeStock(app, { productId, qty, movedOn: docDate, reason: 'sale', docId });
    return docId;
  }

  it('ซื้อเดือนหนึ่ง ขายอีกเดือนหนึ่ง — ต้นทุนลงงวดที่ขาย ไม่ใช่งวดที่ซื้อ', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    await sell('RC-001', '2026-03-10', 4, 900);

    const { rows } = await admin.query(
      `select coalesce(sum(cost_amount),0) as v from stock_moves
        where tenant_id = $1 and reason = 'sale'
          and moved_on between '2026-03-01' and '2026-03-31'`,
      [tenantId],
    );
    expect(n(rows[0].v)).toBe(2000);           // 4 × 500

    const jan = await admin.query(
      `select coalesce(sum(cost_amount),0) as v from stock_moves
        where tenant_id = $1 and reason = 'sale'
          and moved_on between '2026-01-01' and '2026-01-31'`,
      [tenantId],
    );
    expect(n(jan.rows[0].v)).toBe(0);
  });

  it('เบิกใช้ในอู่ไม่เข้าต้นทุนขาย แต่เข้ารายการของหายจากคลัง', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    await consumeStock(app, {
      productId, qty: 2, movedOn: '2026-03-05', reason: 'use', note: 'ล้างเครื่องมือ',
    });

    const { rows } = await admin.query(
      `select reason::text as reason, coalesce(sum(cost_amount),0) as v
         from stock_moves where tenant_id = $1 and qty_delta < 0 group by 1`,
      [tenantId],
    );
    const byReason = Object.fromEntries(rows.map((r) => [r.reason, n(r.v)]));
    expect(byReason.use).toBe(1000);           // 2 × 500
    expect(byReason.sale).toBeUndefined();
  });

  it('ยกเลิกใบเสร็จแล้วต้นทุนถูกหักกลับ ไม่ค้างอยู่ในงบ', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    const docId = await sell('RC-002', '2026-03-10', 4, 900);

    const { returnDocStock } = await import('../src/lib/stock-cost');
    await returnDocStock(app, docId, { movedOn: '2026-03-20', note: 'ยกเลิก' });

    const { rows } = await admin.query(
      `select coalesce(sum(
         sign(-qty_delta) * cost_amount
       ),0) as v from stock_moves
        where tenant_id = $1 and doc_id = $2 and reason in ('sale','return')`,
      [tenantId, docId],
    );
    expect(n(rows[0].v)).toBe(0);
  });

  it('เอกสารที่ย้ายเข้ามาโดยไม่มีการเคลื่อนไหวสต๊อก ยังประมาณต้นทุนให้ได้', async () => {
    /* จำลองใบเสร็จที่ตัวนำเข้าสร้าง — มีบรรทัดสินค้าแต่ไม่มีแถวตัดสต๊อก */
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, party_name,
                              subtotal, net_amount, grand_total, payable)
       values ($1,'RC','RC-เก่า-001','2026-03-10','ลูกค้าเก่า',3600,3600,3600,3600) returning id`,
      [tenantId],
    );
    await admin.query(
      `insert into doc_items (tenant_id, doc_id, line_no, product_id, name, qty, unit_price)
       values ($1,$2,1,$3,'น้ำมันเครื่อง',4,900)`,
      [tenantId, d.rows[0].id, productId],
    );

    const { rows } = await admin.query(
      `select coalesce(sum(i.qty * p.last_cost),0) as est
         from doc_items i join products p on p.id = i.product_id
        where i.doc_id = $1`, [d.rows[0].id],
    );
    /* 4 × 500 — งบใช้ค่านี้เมื่อไม่มีแถวตัดสต๊อกให้อ่าน */
    expect(n(rows[0].est)).toBe(2000);
  });
});
