/**
 * ใบเคลมสินค้า
 *
 * สองเรื่องที่ต้องพิสูจน์ให้หนัก
 * 1. **ใบเคลมใช้ต้นทุนเข้าก่อนออกก่อนชุดเดียวกับการขาย** ไม่ใช่ต้นทุนล่าสุด
 *    ถ้าใช้คนละวิธี ของชิ้นเดียวกันจะมีสองราคาแล้วมูลค่าคลังจะเพี้ยนสะสม
 * 2. **ยกเลิกแล้วของกลับเข้าล็อตเดิมด้วยต้นทุนเดิม** และยกเลิกซ้ำไม่ได้
 *    ไม่งั้นของงอกขึ้นมาจากอากาศทุกครั้งที่กดปุ่ม
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { getClaim, listClaims, saveClaim, voidClaim, type ClaimInput } from '../src/lib/claims';
import { consumeStock, lotsOfProduct, receiveStock } from '../src/lib/stock-cost';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('ใบเคลมสินค้า', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let productId: string;
  let custId: string;

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

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบเคลม') returning id`);
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
    for (const t of ['stock_moves', 'claim_items', 'claims', 'claim_sequences',
                     'doc_items', 'documents', 'products', 'contacts']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
    const p = await admin.query(
      `insert into products (tenant_id, code, name, unit, last_cost, price_a)
       values ($1,'BRK-001','ผ้าเบรกหน้า','ชุด',250,500) returning id`,
      [tenantId],
    );
    productId = p.rows[0].id;

    const k = await admin.query(
      `insert into contacts (tenant_id, code, kind, type, org_name)
       values ($1,'CUS-0001','customer','company','บริษัท ลูกค้าองค์กร จำกัด') returning id`,
      [tenantId],
    );
    custId = k.rows[0].id;
  });

  /** สองล็อตราคาต่างกัน — สถานการณ์ที่ทำให้ FIFO ต่างจากต้นทุนล่าสุด */
  async function twoLots() {
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1000, movedOn: '2026-01-10', reason: 'set',
    });
    await receiveStock(app, {
      productId, qty: 10, costAmount: 1500, movedOn: '2026-02-10', reason: 'set',
    });
  }

  const onHand = async (): Promise<number> => {
    const r = await admin.query(
      `select coalesce(sum(qty_delta),0) as q from stock_moves where product_id = $1`,
      [productId],
    );
    return n(r.rows[0].q);
  };

  const base = (over: Partial<ClaimInput> = {}): ClaimInput => ({
    side: 'customer',
    kind: 'warranty',
    claimDate: '2026-03-01',
    partyId: custId,
    partyName: 'บริษัท ลูกค้าองค์กร จำกัด',
    partyTel: '02-000-0000',
    refNo: 'RC-202602-011',
    vehicleId: null,
    vehicle: { brand: 'Toyota', model: 'Vios' },
    vehiclePlate: 'กข 1234',
    reason: 'ผ้าเบรกสึกผิดปกติภายในระยะรับประกัน',
    byWhom: 'สมชาย',
    note: '',
    items: [{
      productId, code: 'BRK-001', oem: '', name: 'ผ้าเบรกหน้า', unit: 'ชุด',
      qty: 15, unitCost: 250,
    }],
    ...over,
  });

  it('เคลมออกไปแล้วต้นทุนคิดแบบเข้าก่อนออกก่อน ไม่ใช่ต้นทุนล่าสุด', async () => {
    await twoLots();
    const r = await saveClaim(app, base(), null);

    /* 10 ชิ้นแรกที่ 100 + อีก 5 ที่ 150 = 1,750 — ต้นทุนล่าสุดจะได้ 15 × 250 = 3,750 */
    expect(r.cost).toBe(1750);
    expect(r.cutQty).toBe(15);
    expect(r.no).toMatch(/^CL-202603-001$/);
    expect(await onHand()).toBe(5);
  });

  it('ต้นทุนถูกตรึงลงทั้งบรรทัดใบเคลมและแถวในบัญชีสต๊อก', async () => {
    await twoLots();
    const r = await saveClaim(app, base(), null);

    const item = await admin.query(
      `select cost_amount from claim_items where claim_id = $1`, [r.id],
    );
    expect(n(item.rows[0].cost_amount)).toBe(1750);

    const move = await admin.query(
      `select qty_delta, cost_amount, reason::text as reason, claim_id, claim_item_id
       from stock_moves where claim_id = $1`, [r.id],
    );
    expect(move.rows).toHaveLength(1);
    expect(n(move.rows[0].qty_delta)).toBe(-15);
    expect(n(move.rows[0].cost_amount)).toBe(1750);
    expect(move.rows[0].reason).toBe('claim');
    expect(move.rows[0].claim_item_id).not.toBeNull();
  });

  it('ยกเลิกแล้วของกลับเข้าล็อตเดิมด้วยต้นทุนเดิม ขายต่อได้ต้นทุนเท่ากัน', async () => {
    await twoLots();
    const r = await saveClaim(app, base(), null);
    await voidClaim(app, r.id, 'ลูกค้าไม่มารับของ', null);

    expect(await onHand()).toBe(20);

    /* ของที่คืนอยู่หน้าแถว ตัดใหม่แล้วต้องได้ต้นทุนเท่าตอนเคลมเป๊ะ */
    const doc = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, party_name)
       values ($1,'RC','RC-ทดสอบ-001','2026-03-05','ลูกค้า') returning id`, [tenantId],
    );
    const again = await consumeStock(app, {
      productId, qty: 15, movedOn: '2026-03-05', reason: 'sale', docId: doc.rows[0].id,
    });
    expect(again).toBe(1750);
  });

  it('ยกเลิกซ้ำไม่ได้ ไม่งั้นของงอกขึ้นมาจากอากาศ', async () => {
    await twoLots();
    const r = await saveClaim(app, base(), null);
    await voidClaim(app, r.id, '', null);

    await expect(voidClaim(app, r.id, '', null)).rejects.toThrow(/ยกเลิกไปแล้ว/);
    expect(await onHand()).toBe(20);
  });

  it('บรรทัดที่ไม่ผูกทะเบียนสินค้าไม่ตัดสต๊อก แต่ยังอยู่บนใบ', async () => {
    await twoLots();
    const r = await saveClaim(app, base({
      items: [
        { productId, code: 'BRK-001', oem: '', name: 'ผ้าเบรกหน้า', unit: 'ชุด', qty: 2, unitCost: 250 },
        { productId: null, code: '', oem: '', name: 'น้ำยาล้างเบรก', unit: 'กระป๋อง', qty: 1, unitCost: 80 },
      ],
    }), null);

    expect(r.unlinked).toBe(1);
    expect(r.cutQty).toBe(2);
    expect(await onHand()).toBe(18);

    const got = await getClaim(app, r.id);
    expect(got!.items).toHaveLength(2);
    /* บรรทัดที่ไม่ตัดสต๊อกยังมีมูลค่าบนใบ คิดจาก จำนวน × ต้นทุนที่กรอก */
    expect(got!.cost).toBe(200 + 80);
  });

  it('เลขที่เดินคนละชุดต่อทิศทาง — CL กับ VC ไม่กวนกัน', async () => {
    await twoLots();
    const a = await saveClaim(app, base(), null);
    const b = await saveClaim(app, base({
      side: 'vendor', kind: 'defect', vehicle: null, vehiclePlate: '',
      items: [{ productId, code: 'BRK-001', oem: '', name: 'ผ้าเบรกหน้า',
                unit: 'ชุด', qty: 1, unitCost: 250 }],
    }), null);
    const c2 = await saveClaim(app, base(), null);

    expect(a.no).toBe('CL-202603-001');
    expect(b.no).toBe('VC-202603-001');
    expect(c2.no).toBe('CL-202603-002');
  });

  it('ประเภทของอีกทิศทางใส่ไม่ได้ ฐานข้อมูลกันไว้อีกชั้น', async () => {
    await twoLots();
    await expect(saveClaim(app, base({ kind: 'defect' }), null))
      .rejects.toThrow(/ไม่ตรงกับทิศทาง/);

    /* ต่อให้เลี่ยงการตรวจในโค้ดได้ ฐานก็ยังปฏิเสธ */
    await expect(admin.query(
      `insert into claims (tenant_id, no, side, kind, claim_date, reason)
       values ($1,'CL-ทดสอบ-999','customer','defect','2026-03-01','x')`, [tenantId],
    )).rejects.toThrow(/claim_kind_side/);
  });

  it('ฝั่งผู้ขายไม่ผูกรถ แม้ส่งข้อมูลรถมาก็ตัดทิ้ง', async () => {
    await twoLots();
    const r = await saveClaim(app, base({
      side: 'vendor', kind: 'wrong',
      vehicle: { brand: 'Toyota' }, vehiclePlate: 'กข 1234',
    }), null);

    const got = await getClaim(app, r.id);
    expect(got!.vehicle).toBeNull();
    expect(got!.vehiclePlate).toBe('');
  });

  it('เหตุผลว่างบันทึกไม่ได้ — 6.4 ก็บังคับ', async () => {
    await twoLots();
    await expect(saveClaim(app, base({ reason: '   ' }), null))
      .rejects.toThrow(/เหตุผล/);
  });

  it('ไม่มีรายการสักบรรทัดบันทึกไม่ได้', async () => {
    await twoLots();
    await expect(saveClaim(app, base({ items: [] }), null))
      .rejects.toThrow(/อย่างน้อยหนึ่งรายการ/);
  });

  it('ลบสินค้าที่เคยถูกเคลมไม่ได้ ประวัติต้องตามรอยกลับไปหาของจริงได้', async () => {
    await twoLots();
    await saveClaim(app, base(), null);
    await expect(admin.query(`delete from products where id = $1`, [productId]))
      .rejects.toThrow(/violates foreign key/);
  });

  it('ลบใบเคลมที่ตัดสต๊อกไปแล้วไม่ได้ ต้องยกเลิกเท่านั้น', async () => {
    await twoLots();
    const r = await saveClaim(app, base(), null);
    await expect(admin.query(`delete from claims where id = $1`, [r.id]))
      .rejects.toThrow(/violates foreign key/);
  });

  /**
   * ข้อเดียวกับที่ใบวางบิลต้องผ่าน — ใบเคลมไม่ใช่เอกสารทางบัญชีฝั่งรายได้
   * ถ้าหลุดเข้าไปในยอดขายหรือลูกหนี้ อู่จะเห็นรายได้ที่ไม่เคยเกิดขึ้นจริง
   */
  it('ใบเคลมไม่โผล่ในยอดขาย ภาษี หรือลูกหนี้', async () => {
    await twoLots();
    const before = await admin.query(
      `select (select count(*)::int from documents where tenant_id = $1) as docs,
              (select count(*)::int from payments  where tenant_id = $1) as pays`,
      [tenantId],
    );
    await saveClaim(app, base(), null);
    const after = await admin.query(
      `select (select count(*)::int from documents where tenant_id = $1) as docs,
              (select count(*)::int from payments  where tenant_id = $1) as pays`,
      [tenantId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('รายการใบเคลมกรองตามทิศทาง และไม่นับใบที่ยกเลิกในยอดของหายจากคลัง', async () => {
    await twoLots();
    const a = await saveClaim(app, base({
      items: [{ productId, code: 'BRK-001', oem: '', name: 'ผ้าเบรกหน้า',
                unit: 'ชุด', qty: 2, unitCost: 250 }],
    }), null);
    await saveClaim(app, base({
      items: [{ productId, code: 'BRK-001', oem: '', name: 'ผ้าเบรกหน้า',
                unit: 'ชุด', qty: 3, unitCost: 250 }],
    }), null);
    await saveClaim(app, base({
      side: 'vendor', kind: 'defect',
      items: [{ productId, code: 'BRK-001', oem: '', name: 'ผ้าเบรกหน้า',
                unit: 'ชุด', qty: 1, unitCost: 250 }],
    }), null);

    const cust = await listClaims(app, { side: 'customer' });
    expect(cust.total).toBe(2);
    expect(cust.writeOff).toBe(500);          // (2 + 3) ชิ้นจากล็อตแรกที่ 100

    await voidClaim(app, a.id, '', null);
    const after = await listClaims(app, { side: 'customer' });
    expect(after.total).toBe(2);              // ยังเห็นใบที่ยกเลิกในรายการ
    expect(after.writeOff).toBe(300);         // แต่ไม่นับยอดแล้ว

    const vend = await listClaims(app, { side: 'vendor' });
    expect(vend.total).toBe(1);
  });

  it('ล็อตที่เหลือหลังเคลมถูกต้อง — ตัดจากล็อตหน้าสุดก่อน', async () => {
    await twoLots();
    await saveClaim(app, base({
      items: [{ productId, code: 'BRK-001', oem: '', name: 'ผ้าเบรกหน้า',
                unit: 'ชุด', qty: 12, unitCost: 250 }],
    }), null);

    const lots = await lotsOfProduct(app, productId);
    expect(lots).toEqual([{ qty: 8, unitCost: 150, on: '2026-02-10' }]);
  });
});
