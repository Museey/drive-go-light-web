/**
 * สต๊อกของใบซื้อ — ต้นทุนรับเข้า และการปรับสต๊อกตอนแก้ใบ (24 พ.ย. 2569)
 *
 * สองเรื่องที่ไฟล์นี้ยืนยัน
 *
 * 1. ต้นทุนรับเข้าเป็นเงินที่จ่ายจริง — หักส่วนลดรายบรรทัด ส่วนลดท้ายบิล และถอด VAT
 *    ออกเมื่อใบเป็นราคารวม VAT ของอู่ที่จด VAT (เดิมใช้ จำนวน × ราคาบนบรรทัดตรง ๆ)
 *
 * 2. แก้ใบซื้อแล้ว **ไม่มีแถว stock_moves ไหนถูกลบหรือแก้** — เดิมลบทุกแถวของใบแล้วใส่ใหม่
 *    ทั้งที่ของล็อตนั้นอาจถูกขายไปแล้ว ต้นทุนของใบขายจึงอ้างล็อตที่ไม่มีอยู่จริง
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  plannedReceipts, receiveBuyStockWith, syncBuyStockWith, type BuyStockDoc,
} from '../src/lib/buy-stock';
import { voidBuyDocWith } from '../src/lib/buy-void';
import { consumeStock } from '../src/lib/stock-cost';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

const doc = (over: Partial<BuyStockDoc>): BuyStockDoc => ({
  docDate: '2026-03-01', goodsReceived: true, discount: 0, vatMode: 'none', vatRate: 7,
  vatRegistered: true, items: [], ...over,
});

describe('ต้นทุนรับเข้าของใบซื้อ', () => {
  const P = '11111111-1111-4111-8111-111111111111';
  const Q = '22222222-2222-4222-8222-222222222222';

  it('ไม่มีส่วนลด ไม่มี VAT — ต้นทุนเท่ากับ จำนวน × ราคา เหมือนเดิม', () => {
    expect(plannedReceipts(doc({ items: [{ productId: P, qty: 10, unitPrice: 100 }] })))
      .toEqual([{ productId: P, qty: 10, costAmount: 1000, expiresOn: null }]);
  });

  it('ส่วนลดรายบรรทัดถูกหักออกจากต้นทุน', () => {
    const [r] = plannedReceipts(doc({ items: [{ productId: P, qty: 10, unitPrice: 100, discPct: 10 }] }));
    expect(r!.costAmount).toBe(900);
  });

  it('ส่วนลดท้ายบิลเฉลี่ยตามสัดส่วนมูลค่าของแต่ละบรรทัด', () => {
    const got = plannedReceipts(doc({
      discount: 300,
      items: [
        { productId: P, qty: 10, unitPrice: 100 },   /* 1,000 = หนึ่งในสาม */
        { productId: Q, qty: 10, unitPrice: 200 },   /* 2,000 = สองในสาม */
      ],
    }));
    expect(got.map((r) => r.costAmount)).toEqual([900, 1800]);
  });

  it('บรรทัดที่ไม่ผูกทะเบียนก็ร่วมรับส่วนลดท้ายบิล — ไม่โยนทั้งก้อนให้บรรทัดที่ผูก', () => {
    const got = plannedReceipts(doc({
      discount: 200,
      items: [
        { productId: P, qty: 1, unitPrice: 1000 },
        { productId: null, qty: 1, unitPrice: 1000 },
      ],
    }));
    expect(got).toHaveLength(1);
    expect(got[0]!.costAmount).toBe(900);
  });

  it('ราคารวม VAT ของอู่ที่จด VAT — ถอด VAT ออก เพราะภาษีซื้อขอคืนได้', () => {
    const [r] = plannedReceipts(doc({ vatMode: 'in', items: [{ productId: P, qty: 1, unitPrice: 107 }] }));
    expect(r!.costAmount).toBe(100);
  });

  it('ราคารวม VAT ของอู่ที่ไม่จด VAT — VAT เป็นต้นทุนทั้งก้อน', () => {
    const [r] = plannedReceipts(doc({
      vatMode: 'in', vatRegistered: false, items: [{ productId: P, qty: 1, unitPrice: 107 }],
    }));
    expect(r!.costAmount).toBe(107);
  });

  it('ยังไม่รับของ หรือจำนวนไม่เป็นบวก = ไม่มีแถวรับเข้า', () => {
    expect(plannedReceipts(doc({ goodsReceived: false, items: [{ productId: P, qty: 5, unitPrice: 10 }] }))).toEqual([]);
    expect(plannedReceipts(doc({ items: [{ productId: P, qty: 0, unitPrice: 10 }] }))).toEqual([]);
  });
});

describe.skipIf(!DB_URL)('แก้ใบซื้อไม่ลบประวัติสต๊อก', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let productId: string;
  let otherId: string;

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
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบแก้ใบซื้อ') returning id`);
    tenantId = t.rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    for (const t of ['stock_moves', 'doc_items', 'payments', 'doc_edits', 'documents', 'products']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
    const p = await admin.query(
      `insert into products (tenant_id, code, name, unit, last_cost, cost_method)
       values ($1,'OIL-01','น้ำมันเครื่อง','แกลลอน',0,'FIFO'),
              ($1,'FLT-01','ไส้กรอง','ลูก',0,'FIFO') returning id`, [tenantId]);
    productId = p.rows[0].id;
    otherId = p.rows[1].id;
  });

  async function poHeader(no: string, kind = 'PO'): Promise<string> {
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name,
                              subtotal, net_amount, grand_total, payable, vat_mode, vat_rate,
                              goods_received)
       values ($1,$3,$2,'2026-03-01','issued','ร้านอะไหล่',0,0,0,0,'none',0,$4)
       returning id`, [tenantId, no, kind, kind === 'PO']);
    return d.rows[0].id;
  }

  const moves = async (docId: string) => (await admin.query(
    `select id, product_id, qty_delta::float8 as qty, cost_amount::float8 as cost, reason::text as reason
       from stock_moves where doc_id = $1 order by created_at, id`, [docId])).rows;

  const onHand = async (id = productId): Promise<number> => {
    const { rows } = await app.query(`select qty_on_hand from product_stock where product_id = $1`, [id]);
    return n(rows[0]?.qty_on_hand ?? 0);
  };

  const lastCost = async (id = productId) =>
    n((await admin.query(`select last_cost from products where id = $1`, [id])).rows[0].last_cost);

  it('รับเข้าด้วยต้นทุนสุทธิ และทุนล่าสุดเป็นราคาสุทธิต่อหน่วย', async () => {
    const id = await poHeader('PO-001');
    await receiveBuyStockWith(app, id, doc({
      discount: 100, items: [{ productId, qty: 10, unitPrice: 100, discPct: 10 }],
    }), null);

    const m = await moves(id);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ qty: 10, cost: 800, reason: 'purchase' });
    expect(await lastCost()).toBe(80);
  });

  it('แก้อย่างอื่นที่ไม่กระทบสต๊อก — ไม่มีแถวใหม่เลย', async () => {
    const id = await poHeader('PO-001');
    const before = doc({ items: [{ productId, qty: 10, unitPrice: 100 }] });
    await receiveBuyStockWith(app, id, before, null);
    const was = await moves(id);

    await syncBuyStockWith(app, id, before, doc({ items: [{ productId, qty: 10, unitPrice: 100 }] }), null);
    expect(await moves(id)).toEqual(was);
  });

  it('แก้จำนวน — แถวเดิมอยู่ครบ เพิ่มแถวตัดออกกับแถวรับเข้าใหม่ ยอดคงเหลือตรงใบใหม่', async () => {
    const id = await poHeader('PO-001');
    const before = doc({ items: [{ productId, qty: 10, unitPrice: 100 }] });
    await receiveBuyStockWith(app, id, before, null);
    const original = (await moves(id))[0];

    await syncBuyStockWith(app, id, before, doc({ items: [{ productId, qty: 12, unitPrice: 100 }] }), null);

    const m = await moves(id);
    expect(m.map((r) => r.reason)).toEqual(['purchase', 'return', 'purchase']);
    expect(m[0]).toEqual(original);                      /* แถวเดิมไม่ถูกลบและไม่ถูกแก้ */
    expect(m[1]).toMatchObject({ qty: -10, cost: 1000 });
    expect(m[2]).toMatchObject({ qty: 12, cost: 1200 });
    expect(await onHand()).toBe(12);
  });

  it('ขายไปแล้วบางส่วนก่อนแก้ใบ — ต้นทุนของการขายที่ตรึงไว้ไม่เปลี่ยน และของไม่งอก', async () => {
    const id = await poHeader('PO-001');
    const before = doc({ items: [{ productId, qty: 10, unitPrice: 100 }] });
    await receiveBuyStockWith(app, id, before, null);

    /* ขายออก 4 ผ่านเอกสารอีกใบ — ต้นทุนตรึงที่ 400 */
    const sale = await poHeader('RC-001', 'RC');
    const cogs = await consumeStock(app, {
      productId, qty: 4, movedOn: '2026-03-05', reason: 'sale', docId: sale,
    });
    expect(cogs).toBe(400);

    /* แก้ราคาซื้อเป็น 120 — ใบซื้อบอกว่ามี 10 แต่ในคลังเหลือของจากใบนี้สุทธิ 10 (ใบขายเป็นคนละใบ)
       ระบบตัดยอดสุทธิของใบซื้อออกแล้วรับเข้าใหม่ จำนวนในคลังต้องเป็น 10 − 4 = 6 เหมือนเดิม */
    await syncBuyStockWith(app, id, before, doc({ items: [{ productId, qty: 10, unitPrice: 120 }] }), null);

    expect(await onHand()).toBe(6);
    const s = await moves(sale);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ qty: -4, cost: 400 });   /* ต้นทุนขายเดิมไม่ถูกแตะ */
    expect(await lastCost()).toBe(120);
  });

  it('เอาสินค้าออกจากใบ และเพิ่มสินค้าตัวใหม่ — กระทบเฉพาะสองตัวนั้น', async () => {
    const id = await poHeader('PO-001');
    const before = doc({ items: [
      { productId, qty: 5, unitPrice: 100 },
      { productId: otherId, qty: 3, unitPrice: 50 },
    ] });
    await receiveBuyStockWith(app, id, before, null);

    await syncBuyStockWith(app, id, before, doc({ items: [{ productId, qty: 5, unitPrice: 100 }] }), null);

    expect(await onHand(productId)).toBe(5);
    expect(await onHand(otherId)).toBe(0);
    const m = await moves(id);
    /* น้ำมันเครื่องไม่เปลี่ยน จึงยังมีแถวเดียว · ไส้กรองมีแถวรับเข้าเดิมกับแถวตัดออก */
    expect(m.filter((r) => r.product_id === productId)).toHaveLength(1);
    expect(m.filter((r) => r.product_id === otherId).map((r) => r.reason)).toEqual(['purchase', 'return']);
  });

  it('ยกเลิกติ๊กรับของ — ของออกจากคลังทั้งหมด โดยไม่ลบแถว', async () => {
    const id = await poHeader('PO-001');
    const before = doc({ items: [{ productId, qty: 10, unitPrice: 100 }] });
    await receiveBuyStockWith(app, id, before, null);

    await syncBuyStockWith(app, id, before, doc({
      goodsReceived: false, items: [{ productId, qty: 10, unitPrice: 100 }],
    }), null);

    expect(await onHand()).toBe(0);
    expect((await moves(id)).map((r) => r.reason)).toEqual(['purchase', 'return']);
  });

  it('แก้แล้วยกเลิกใบ — ตัดออกเท่ากับจำนวนบนใบล่าสุดพอดี ไม่ซ้ำสองรอบ', async () => {
    const id = await poHeader('PO-001');
    const before = doc({ items: [{ productId, qty: 10, unitPrice: 100 }] });
    await receiveBuyStockWith(app, id, before, null);
    await syncBuyStockWith(app, id, before, doc({ items: [{ productId, qty: 12, unitPrice: 100 }] }), null);

    await voidBuyDocWith(app, id, 'ทดสอบ', null);
    expect(await onHand()).toBe(0);
  });

  it('การยกเลิกปฏิเสธเอกสารที่ไม่ใช่ฝั่งซื้อ', async () => {
    const sale = await poHeader('RC-009', 'RC');
    await expect(voidBuyDocWith(app, sale, 'ทดสอบ', null)).rejects.toThrow(/ไม่ใช่ใบซื้อ/);
  });
});
