/**
 * ต้นทุนแบบเข้าก่อนออกก่อนบนฐานข้อมูลจริง
 *
 * ชุดทดสอบใน core พิสูจน์ว่าสูตรตรงกับรุ่น 6.4 แล้ว ไฟล์นี้พิสูจน์อีกครึ่ง —
 * บัญชี stock_moves เล่นซ้ำแล้วได้ล็อตเดียวกัน ต้นทุนถูกตรึงลงแถวจริง
 * และการยกเลิกกับการแก้เอกสารไม่ทำให้ประวัติหาย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { consumeStock, lotsOfProduct, receiveStock, returnDocStock } from '../src/lib/stock-cost';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('ต้นทุนเข้าก่อนออกก่อนบนฐานข้อมูล', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let productId: string;
  let docId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
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

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบต้นทุน') returning id`);
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
    await admin.query(`delete from products where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from documents where tenant_id = $1`, [tenantId]);

    const p = await admin.query(
      `insert into products (tenant_id, code, name, unit, last_cost, price_a)
       values ($1, 'BRK-001', 'ผ้าเบรกหน้า', 'ชุด', 250, 500) returning id`,
      [tenantId],
    );
    productId = p.rows[0].id;

    /* เอกสารหนึ่งใบไว้ให้รายการซื้อ/ขาย/คืนอ้างถึง —
       สคีมาบังคับว่าการเคลื่อนไหวที่มาจากเอกสารต้องอ้างเอกสารเสมอ */
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, party_name)
       values ($1, 'RC', 'RC-ทดสอบ-001', '2026-03-01', 'ลูกค้าทดสอบ') returning id`,
      [tenantId],
    );
    docId = d.rows[0].id;
  });

  /** รับเข้าสองล็อตราคาต่างกัน — สถานการณ์ที่ทำให้ FIFO ต่างจากต้นทุนเฉลี่ย */
  async function twoLots() {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1000, movedOn: '2026-01-10', reason: 'set',
      note: 'ล็อตแรก 100/ชิ้น',
    });
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1500, movedOn: '2026-02-10', reason: 'set',
      note: 'ล็อตสอง 150/ชิ้น',
    });
  }

  it('เล่นบัญชีแล้วได้ล็อตเรียงตามวันที่รับเข้า', async () => {
    await twoLots();
    const lots = await lotsOfProduct(app, productId);
    expect(lots).toEqual([
      { qty: 10, unitCost: 100, on: '2026-01-10' },
      { qty: 10, unitCost: 150, on: '2026-02-10' },
    ]);
  });

  it('ตัดออกใช้ราคาล็อตแรกก่อน แล้วตรึงต้นทุนลงแถวนั้น', async () => {
    await twoLots();
    const cost = await consumeStock(app, {
      productId, qty: 15, movedOn: '2026-03-01', reason: 'sale', docId,
    });
    expect(cost).toBe(1750);                       // 10×100 + 5×150

    const { rows } = await admin.query(
      `select qty_delta, unit_cost, cost_amount from stock_moves
        where product_id = $1 and reason = 'sale'`, [productId],
    );
    expect(n(rows[0].qty_delta)).toBe(-15);
    expect(n(rows[0].cost_amount)).toBe(1750);
    expect(n(rows[0].unit_cost)).toBeCloseTo(116.67, 2);

    expect(await lotsOfProduct(app, productId)).toEqual([
      { qty: 5, unitCost: 150, on: '2026-02-10' },
    ]);
  });

  it('ตัดเกินที่มีในคลัง ส่วนเกินคิดที่ต้นทุนล่าสุด ไม่ใช่ศูนย์', async () => {
    await receiveStock(app, {
      productId, qty: 3, costAmount: 300, movedOn: '2026-01-10', reason: 'set',
    });
    /* last_cost ของสินค้าตัวนี้คือ 250 */
    const cost = await consumeStock(app, {
      productId, qty: 5, movedOn: '2026-03-01', reason: 'sale', docId,
    });
    expect(cost).toBe(800);                        // 3×100 + 2×250
  });

  it('คืนของกลับเข้าคลังด้วยต้นทุนเดิม แล้วตัดใหม่ได้ต้นทุนเท่าเดิม', async () => {
    await twoLots();
    const first = await consumeStock(app, {
      productId, qty: 15, movedOn: '2026-03-01', reason: 'sale', docId,
    });

    await receiveStock(app, {
      productId, qty: 15, costAmount: first, movedOn: '2026-03-05', reason: 'return',
      docId, note: 'คืนจากการยกเลิก',
    });

    /* ของที่คืนอยู่หน้าแถว จึงถูกตัดออกก่อน — ได้ต้นทุนเท่าครั้งแรกเป๊ะ */
    const again = await consumeStock(app, {
      productId, qty: 15, movedOn: '2026-03-10', reason: 'sale', docId,
    });
    expect(again).toBe(first);
  });

  it('ทุกการเคลื่อนไหวยังอยู่ในบัญชี ไม่มีแถวไหนถูกลบ', async () => {
    await twoLots();
    await consumeStock(app, { productId, qty: 5, movedOn: '2026-03-01', reason: 'sale', docId });
    await receiveStock(app, {
      productId, qty: 5, costAmount: 500, movedOn: '2026-03-02', reason: 'return', docId,
    });
    await consumeStock(app, { productId, qty: 2, movedOn: '2026-03-03', reason: 'use', docId: null });

    const { rows } = await admin.query(
      `select count(*)::int as c from stock_moves where product_id = $1`, [productId],
    );
    expect(rows[0].c).toBe(5);
  });

  /**
   * แก้เอกสารเดิมสองรอบ — รอบที่สองต้องคืนเฉพาะที่ยังค้างอยู่จริง
   *
   * ใบหนึ่งมีทั้งแถวตัดและแถวคืนปนกันหลังแก้รอบแรก ถ้าการคืนไล่ทีละแถวที่ตัดออก
   * โดยไม่หักกับแถวที่คืนไปแล้ว รอบที่สองจะคืนของมากกว่าที่เคยเอาออก
   * แล้วสต๊อกจะงอกขึ้นทุกครั้งที่ผู้ใช้กดแก้เอกสาร
   */
  it('แก้เอกสารเดิมซ้ำหลายรอบแล้วสต๊อกไม่งอก', async () => {
    await twoLots();                       // มีของ 20 ชิ้น

    /* รอบแรก: ขาย 10 */
    await consumeStock(app, { productId, qty: 10, movedOn: '2026-03-01', reason: 'sale', docId });

    /* แก้เป็น 6 — คืนของเดิมก่อนแล้วตัดใหม่ แบบเดียวกับที่ saveSalesDoc ทำ */
    await returnDocStock(app, docId, { movedOn: '2026-03-02', note: 'แก้ไขเอกสาร' });
    await consumeStock(app, { productId, qty: 6, movedOn: '2026-03-02', reason: 'sale', docId });

    /* แก้อีกรอบเป็น 4 */
    await returnDocStock(app, docId, { movedOn: '2026-03-03', note: 'แก้ไขเอกสาร' });
    await consumeStock(app, { productId, qty: 4, movedOn: '2026-03-03', reason: 'sale', docId });

    const { rows } = await admin.query(
      `select coalesce(sum(qty_delta), 0) as q from stock_moves where product_id = $1`,
      [productId],
    );
    expect(Number(rows[0].q)).toBe(16);    // 20 − 4 ไม่ใช่ 20 − 4 + ของที่งอกมา
  });

  it('รายการที่ลงย้อนหลังเข้าคิวตามวันที่จริง ไม่ใช่ตามเวลาที่คีย์', async () => {
    /* คีย์ล็อตเดือนกุมภาพันธ์ก่อน แล้วค่อยคีย์ล็อตเดือนมกราคมย้อนหลัง */
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1500, movedOn: '2026-02-10', reason: 'set',
    });
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1000, movedOn: '2026-01-10', reason: 'set',
    });

    const lots = await lotsOfProduct(app, productId);
    expect(lots[0]!.on).toBe('2026-01-10');
    expect(await consumeStock(app, {
      productId, qty: 10, movedOn: '2026-03-01', reason: 'sale', docId,
    })).toBe(1000);
  });

  it('เบิกใช้ในอู่ตัดสต๊อกและคิดต้นทุนเหมือนขาย แต่แยกเหตุผลไว้ให้งบนับคนละช่อง', async () => {
    await twoLots();
    const cost = await consumeStock(app, {
      productId, qty: 4, movedOn: '2026-03-01', reason: 'use', note: 'ล้างชิ้นส่วน',
    });
    expect(cost).toBe(400);

    const { rows } = await admin.query(
      `select reason::text as reason, cost_amount from stock_moves
        where product_id = $1 and qty_delta < 0`, [productId],
    );
    expect(rows[0].reason).toBe('use');
    expect(n(rows[0].cost_amount)).toBe(400);
  });
});
