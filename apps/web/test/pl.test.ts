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
import { profitAndLossWith } from '../src/lib/reports-pl';
import { saveClaim, voidClaim, type ClaimInput } from '../src/lib/claims';
import {
  addCountItems, applyCount, createCount, getCount, setCountedQty,
} from '../src/lib/stock-counts';
import { freshSchema } from '../../../tools/test-schema.mjs';

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
    await admin.query(`delete from claim_items where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from claims where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from claim_sequences where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from stock_count_items where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from stock_counts where tenant_id = $1`, [tenantId]);
    await admin.query(`delete from stock_count_sequences where tenant_id = $1`, [tenantId]);
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

  /* ---------------------------------------------------------------
     ใบเคลม — ของหายจากคลัง ไม่ใช่ต้นทุนขาย
     --------------------------------------------------------------- */

  const claim = (over: Partial<ClaimInput> = {}): ClaimInput => ({
    side: 'customer', kind: 'warranty', claimDate: '2026-03-20',
    partyId: null, partyName: 'ลูกค้าเคลม', partyTel: '',
    refNo: '', vehicleId: null, vehicle: null, vehiclePlate: '',
    reason: 'อยู่ในระยะรับประกัน', byWhom: 'สมชาย', note: '',
    items: [{ productId, code: 'OIL-001', oem: '', name: 'น้ำมันเครื่อง',
              unit: 'ลิตร', qty: 2, unitCost: 500 }],
    ...over,
  });

  /**
   * ข้อสำคัญที่สุดของช่วงนี้
   *
   * ถ้าต้นทุนของที่เคลมไปหลุดเข้าต้นทุนขาย กำไรขั้นต้นจะเลิกบอกความจริง
   * ว่าขายของแล้วได้กี่เปอร์เซ็นต์ — ซึ่งเป็นตัวเลขที่อู่ใช้ตั้งราคา
   */
  it('เคลมไม่เข้าต้นทุนขาย เข้าบรรทัดเคลม และกำไรขั้นต้นไม่ขยับ', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    await sell('RC-010', '2026-03-10', 4, 900);

    const before = await profitAndLossWith(app);
    await saveClaim(app, claim(), null);
    const after = await profitAndLossWith(app);

    expect(after.writeOff.claim).toBe(1000);          // 2 × 500
    expect(after.cogs).toBe(before.cogs);             // ต้นทุนขายไม่ขยับ
    expect(after.grossProfit).toBe(before.grossProfit);
    expect(after.netProfit).toBe(before.netProfit - 1000);
  });

  it('เคลมฝั่งผู้ขายก็นับเป็นของหายจากคลังเหมือนกัน — ตามรุ่น 6.4', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    await saveClaim(app, claim({ side: 'vendor', kind: 'defect' }), null);

    const pl = await profitAndLossWith(app);
    expect(pl.writeOff.claim).toBe(1000);
  });

  it('ยกเลิกใบเคลมแล้วยอดกลับเป็นศูนย์ ไม่ค้างอยู่ในงบ', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    const r = await saveClaim(app, claim(), null);
    await voidClaim(app, r.id, '', null);

    const pl = await profitAndLossWith(app);
    expect(pl.writeOff.claim).toBe(0);
  });

  /**
   * ใบเคลมที่ย้ายเข้ามาไม่มีแถวในบัญชีสต๊อก เพราะยอดคงเหลือที่นำเข้าเป็นยอดหลังหักเคลมแล้ว
   * ถ้าไม่มีทางลัดให้งบอ่านจากตัวใบ ประวัติค่าใช้จ่ายของอู่ที่ย้ายมาจะหายไปทั้งก้อน
   */
  it('ใบเคลมที่ย้ายเข้ามา (ไม่มีแถวสต๊อก) ยังขึ้นในงบตามต้นทุนที่ติดมากับใบ', async () => {
    const c2 = await admin.query(
      `insert into claims (tenant_id, no, side, kind, claim_date, party_name, reason)
       values ($1,'CL-เก่า-001','customer','warranty','2026-03-20','ลูกค้าเก่า','รับประกัน')
       returning id`,
      [tenantId],
    );
    await admin.query(
      `insert into claim_items (tenant_id, claim_id, line_no, product_id, name,
                                qty, unit_cost, cost_amount)
       values ($1,$2,1,$3,'น้ำมันเครื่อง',2,500,900)`,
      [tenantId, c2.rows[0].id, productId],
    );

    const pl = await profitAndLossWith(app);
    expect(pl.writeOff.claim).toBe(900);      // ใช้ต้นทุนที่ติดมา ไม่ใช่ 2 × 500
  });

  it('ใบเคลมที่ตัดสต๊อกแล้วไม่ถูกนับซ้ำจากทางลัดของใบที่ย้ายเข้ามา', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    await saveClaim(app, claim(), null);

    const pl = await profitAndLossWith(app);
    expect(pl.writeOff.claim).toBe(1000);     // ไม่ใช่ 2000
  });

  /* ---------------------------------------------------------------
     ตรวจนับสต๊อก — ส่วนต่างเข้าบรรทัดปรับยอด ไม่ใช่ต้นทุนขาย
     --------------------------------------------------------------- */

  /** เปิดใบตรวจนับแล้วปรับยอดสินค้าตัวเดียวไปที่จำนวนที่กำหนด */
  async function countTo(qty: number) {
    const { id } = await createCount(app, { countDate: '2026-03-20' }, null);
    await addCountItems(app, id, [productId]);
    const got = await getCount(app, id);
    await setCountedQty(app, got!.items[0]!.id, qty);
    return applyCount(app, id, null);
  }

  it('ของขาดจากการตรวจนับเข้าบรรทัดปรับยอด ไม่เข้าต้นทุนขาย', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    await sell('RC-020', '2026-03-10', 4, 900);

    const before = await profitAndLossWith(app);
    await countTo(4);                       // เหลือ 6 นับได้ 4 → หาย 2 ที่ 500

    const after = await profitAndLossWith(app);
    expect(after.writeOff.adjust).toBe(before.writeOff.adjust + 1000);
    expect(after.writeOff.claim).toBe(0);
    expect(after.cogs).toBe(before.cogs);
    expect(after.grossProfit).toBe(before.grossProfit);
    expect(after.netProfit).toBe(before.netProfit - 1000);
  });

  it('ของเกินจากการตรวจนับหักกลบยอดของหายจากคลัง', async () => {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 5000, movedOn: '2026-01-15', reason: 'set',
    });
    const before = await profitAndLossWith(app);
    await countTo(13);                      // เกินมา 3 ที่ 500

    const after = await profitAndLossWith(app);
    expect(after.writeOff.adjust).toBe(before.writeOff.adjust - 1500);
  });
});