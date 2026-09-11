/**
 * กู้คืนใบซื้อและค่าใช้จ่ายที่ยกเลิกไปแล้ว
 *
 * **มีเฉพาะฝั่งรายจ่าย** ตามกติกาของรุ่น 6.4 — เอกสารรายรับที่ยกเลิกแล้วกู้คืนไม่ได้
 * เพราะยอดขาย ภาษีขาย และใบกำกับภาษีที่ส่งออกไปแล้วพัวพันอยู่ ใบพวกนั้นใช้คัดลอกใบใหม่
 *
 * ข้อที่สำคัญที่สุดในไฟล์นี้คือ **มูลค่าสต๊อกต้องกลับมาเท่าเดิมทุกสตางค์** —
 * ตอนยกเลิกระบบตัดของออกตามล็อตจริง ซึ่งอาจเป็นคนละราคากับที่ซื้อมา
 * ถ้ากู้คืนด้วยราคาบนใบ มูลค่าสต๊อกจะเพี้ยนทุกครั้งที่ราคาซื้อขยับระหว่างทาง
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { bookValueOf, receiveStock } from '../src/lib/stock-cost';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('กู้คืนเอกสารรายจ่าย', () => {
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
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบกู้คืน') returning id`);
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
      `insert into products (tenant_id, code, name, unit, last_cost)
       values ($1,'OIL-01','น้ำมันเครื่อง','แกลลอน',100) returning id`, [tenantId]);
    productId = p.rows[0].id;
  });

  /** ใบซื้อที่รับของเข้าคลังแล้ว */
  async function purchase(no: string, qty: number, unitCost: number): Promise<string> {
    const d = await admin.query(
      /* direction เป็นคอลัมน์คำนวณจาก kind — ใส่เองไม่ได้ ฐานปฏิเสธ */
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name,
                              subtotal, net_amount, grand_total, payable, vat_mode, vat_rate,
                              goods_received)
       values ($1,'PO',$2,'2026-03-01','issued','ร้านอะไหล่',
               $3,$3,$3,$3,'none',0,true)
       returning id`,
      [tenantId, no, qty * unitCost],
    );
    const id = d.rows[0].id;
    await admin.query(
      `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, unit_cost,
                                cost_amount, reason, doc_id)
       values ($1,$2,'2026-03-01',$3::numeric,$4,$3::numeric*$4,'purchase',$5)`,
      [tenantId, productId, qty, unitCost, id],
    );
    return id;
  }

  const onHand = async (): Promise<number> => {
    const { rows } = await app.query(
      `select qty_on_hand from product_stock where product_id = $1`, [productId]);
    return n(rows[0]?.qty_on_hand ?? 0);
  };

  const statusOf = async (id: string) => {
    const { rows } = await admin.query(
      `select status::text as status, voided_at, voided_reason from documents where id = $1`, [id]);
    return rows[0];
  };

  /* ใช้ฟังก์ชันจริงผ่าน mutate() ไม่ได้เพราะต้องมี session — เรียกตรรกะเดียวกัน
     ผ่านตัวที่รับ client เข้ามา แล้วเทียบผลที่ฐานข้อมูลจริง */
  const voidDoc = async (id: string) => {
    const { voidBuyDocWith } = await import('../src/lib/buy-void');
    await voidBuyDocWith(app, id, 'ยกเลิกโดยผู้ใช้', null);
  };
  const unvoidDoc = async (id: string) => {
    const { unvoidBuyDocWith } = await import('../src/lib/buy-void');
    await unvoidBuyDocWith(app, id, null);
  };

  it('กู้คืนแล้วของกลับเข้าคลังครบจำนวน', async () => {
    const id = await purchase('PO-001', 10, 100);
    expect(await onHand()).toBe(10);

    await voidDoc(id);
    expect(await onHand()).toBe(0);

    await unvoidDoc(id);
    expect(await onHand()).toBe(10);
  });

  /** ข้อสำคัญที่สุด */
  it('มูลค่าสต๊อกกลับมาเท่าเดิมทุกสตางค์ แม้ราคาซื้อจะขยับระหว่างทาง', async () => {
    /* ของเก่าในคลังราคา 80 มาก่อน แล้วใบนี้ซื้อเข้ามา 10 ที่ 100 */
    await receiveStock(app, {
      productId, qty: 5, costAmount: 400, movedOn: '2026-01-01', reason: 'opening',
    });
    const id = await purchase('PO-001', 10, 100);

    const before = await bookValueOf(app, productId);
    expect(before).toBe(1400);                         // 400 + 1,000

    await voidDoc(id);
    /* ราคาซื้อล่าสุดเปลี่ยนไปหลังจากนั้น — ต้องไม่มีผลกับการกู้คืน */
    await admin.query(`update products set last_cost = 999 where id = $1`, [productId]);

    await unvoidDoc(id);
    expect(await bookValueOf(app, productId)).toBe(before);
  });

  /*
   * ต้นทุนที่ถูกตัดออกแต่ละรอบไม่เท่ากัน เพราะระหว่างรอบมีของราคาอื่นเข้ามาปน
   * ถ้ากู้คืนด้วย "ค่าเฉลี่ยของทุกครั้งที่เคยยกเลิก" ตัวเลขจะค่อย ๆ เพี้ยน
   * ข้อนี้จึงบังคับให้ย้อนเฉพาะการยกเลิกครั้งล่าสุดจริง ๆ
   */
  it('ยกเลิก–กู้คืนสลับกันหลายรอบ ที่ต้นทุนคนละราคา ของและมูลค่าไม่เพี้ยน', async () => {
    const id = await purchase('PO-001', 10, 100);

    let other = 0;   /* ของราคาอื่นที่สะสมอยู่ในคลัง นอกเหนือจากของบนใบนี้ */

    for (const extra of [50, 500, 5]) {
      const before = await bookValueOf(app, productId);
      await voidDoc(id);
      expect(await onHand()).toBe(other);
      await unvoidDoc(id);
      expect(await onHand()).toBe(other + 10);
      expect(await bookValueOf(app, productId)).toBe(before);

      /* ของราคาอื่นเข้ามาปนก่อนรอบถัดไป — ล็อตที่จะถูกตัดจึงเปลี่ยนไป */
      await receiveStock(app, {
        productId, qty: 2, costAmount: extra * 2, movedOn: '2026-05-01', reason: 'adjust',
      });
      other += 2;
    }
  });

  it('กู้คืนใบที่ไม่ได้ยกเลิกไว้ ถูกปฏิเสธ', async () => {
    const id = await purchase('PO-001', 10, 100);
    await expect(unvoidDoc(id)).rejects.toThrow(/ไม่ได้ถูกยกเลิก/);
  });

  it('กู้คืนซ้ำครั้งที่สอง ถูกปฏิเสธ ของไม่งอกสองเท่า', async () => {
    const id = await purchase('PO-001', 10, 100);
    await voidDoc(id);
    await unvoidDoc(id);

    await expect(unvoidDoc(id)).rejects.toThrow(/ไม่ได้ถูกยกเลิก/);
    expect(await onHand()).toBe(10);
  });

  it('สถานะและวันที่ยกเลิกถูกล้างพร้อมกัน — สคีมาบังคับให้ตรงกัน', async () => {
    const id = await purchase('PO-001', 10, 100);
    await voidDoc(id);
    expect((await statusOf(id)).voided_at).not.toBeNull();

    await unvoidDoc(id);
    const st = await statusOf(id);
    expect(st.status).toBe('issued');
    expect(st.voided_at).toBeNull();
    expect(st.voided_reason).toBeNull();
  });

  it('ประวัติเอกสารบันทึกว่ากู้คืน ไม่ใช่แค่ "แก้ไข"', async () => {
    const id = await purchase('PO-001', 10, 100);
    await voidDoc(id);
    await unvoidDoc(id);

    const { rows } = await admin.query(
      `select action from doc_edits where document_id = $1 order by id`, [id]);
    expect(rows.map((r) => r.action)).toContain('unvoid');
    expect(rows.map((r) => r.action)).toContain('void');
  });

  it('ค่าใช้จ่ายที่ไม่มีสต๊อก กู้คืนได้และไม่สร้างแถวสต๊อกขึ้นมา', async () => {
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name,
                              subtotal, net_amount, grand_total, payable, vat_mode, vat_rate,
                              expense_cat)
       values ($1,'EX','EX-001','2026-03-01','issued','ค่าไฟ',
               500,500,500,500,'none',0,'utility')
       returning id`,
      [tenantId],
    );
    const id = d.rows[0].id;

    await voidDoc(id);
    expect((await statusOf(id)).status).toBe('void');

    await unvoidDoc(id);
    expect((await statusOf(id)).status).toBe('issued');

    const { rows } = await admin.query(
      `select count(*)::int as c from stock_moves where doc_id = $1`, [id]);
    expect(rows[0].c).toBe(0);
  });
});
