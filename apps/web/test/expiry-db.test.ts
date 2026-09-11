/**
 * ล็อตที่ยังเหลือของ และรายการของใกล้หมดอายุ
 *
 * ตัวนี้ตอบคำถาม "สินค้าตัวนี้มีของที่กำลังจะหมดอายุค้างอยู่ไหม" ด้วย SQL
 * แทนการเล่นบัญชีซ้ำในโค้ด เพราะหน้ารายการมีสินค้าหลายร้อยตัว
 *
 * **จึงต้องพิสูจน์ว่ามันให้คำตอบตรงกับการเล่นบัญชีจริง** ไม่ใช่แค่ดูสมเหตุสมผล
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  expiringSummaryWith, listExpiringLotsWith, listExpiringWith, nearestExpiryWith,
} from '../src/lib/expiry';
import { lotsOfProduct } from '../src/lib/stock-cost';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ของใกล้หมดอายุ', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let otherTenant: string;
  let prod: string;

  const addProduct = async (code: string): Promise<string> => {
    const { rows } = await app.query(
      `insert into products (tenant_id, code, name, unit, last_cost)
       values (current_tenant_id(), $1, $1, 'ขวด', 100) returning id`, [code]);
    return rows[0].id;
  };

  /* ใช้ reason 'opening' เพราะ CHECK บังคับว่า reason อื่นต้องอ้างเอกสาร
     ซึ่งฟิกซ์เจอร์นี้ไม่ได้สร้างเอกสารขึ้นมา */
  const receive = (productId: string, qty: number, on: string, expires: string | null) =>
    app.query(
      `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta,
                                unit_cost, cost_amount, reason, expires_on)
       values (current_tenant_id(),$1,$2,$3::numeric,100,$3::numeric*100,'opening',$4)`,
      [productId, on, qty, expires]);

  const consume = (productId: string, qty: number, on: string) =>
    app.query(
      `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta,
                                unit_cost, cost_amount, reason)
       values (current_tenant_id(),$1,$2,$3::numeric,100,$3::numeric*-100,'use')`,
      [productId, on, -qty]);

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

    const t = await admin.query(
      `insert into tenants (name) values ('อู่หมดอายุ'), ('อู่ข้างบ้าน') returning id`);
    tenantId = t.rows[0].id;
    otherTenant = t.rows[1].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    for (const t of [otherTenant, tenantId]) {
      await app.query(`select set_config('app.tenant_id', $1, false)`, [t]);
      await app.query('delete from stock_moves');
      await app.query('delete from products');
    }
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
    prod = await addProduct('OIL-01');
  });

  const nearest = async () => (await nearestExpiryWith(app)).get(prod) ?? null;

  /*
   * ตรวจ "ไม่มีชื่ออยู่ใน Map" ไม่ใช่แค่ "ค่าเป็น null" — เพราะตัวเรียกใช้ .has()
   * ถ้าปล่อยให้สินค้าที่ไม่มีวันหมดอายุมีชื่ออยู่พร้อมค่า null .has() จะโกหก
   * (เคยเขียนเทสต์ที่ตรวจแค่ค่า แล้วการกลายพันธุ์รอดมาได้)
   */
  it('ไม่มีวันหมดอายุเลย — ไม่มีชื่ออยู่ใน Map เลย', async () => {
    await receive(prod, 10, '2026-01-01', null);
    const m = await nearestExpiryWith(app);
    expect(m.has(prod)).toBe(false);
    expect(m.size).toBe(0);
  });

  it('มีล็อตเดียว — ได้วันหมดอายุของล็อตนั้น', async () => {
    await receive(prod, 10, '2026-01-01', '2026-12-31');
    expect(await nearest()).toBe('2026-12-31');
  });

  it('หลายล็อต — ได้วันที่ใกล้ที่สุด', async () => {
    await receive(prod, 5, '2026-01-01', '2027-06-01');
    await receive(prod, 5, '2026-02-01', '2026-09-01');
    expect(await nearest()).toBe('2026-09-01');
  });

  /*
   * ข้อสำคัญที่สุด — ล็อตที่ตัดหมดไปแล้วต้องไม่ทำให้ขึ้นป้ายเตือน
   * ของที่หมดอายุนั้นออกจากคลังไปแล้ว การเตือนถึงมันคือการเตือนผิด
   */
  it('ล็อตที่ใกล้หมดถูกตัดหมดแล้ว — เลื่อนไปดูล็อตถัดไป', async () => {
    await receive(prod, 5, '2026-01-01', '2026-09-01');   // ตัวนี้ถูกตัดก่อนตาม FEFO
    await receive(prod, 5, '2026-02-01', '2027-06-01');
    await consume(prod, 5, '2026-03-01');

    expect(await nearest()).toBe('2027-06-01');
  });

  it('ตัดหมดทั้งสองล็อต — ไม่เหลืออะไรให้เตือน', async () => {
    await receive(prod, 5, '2026-01-01', '2026-09-01');
    await receive(prod, 5, '2026-02-01', '2027-06-01');
    await consume(prod, 10, '2026-03-01');

    expect(await nearest()).toBeNull();
  });

  it('ตัดไปครึ่งล็อต — ล็อตนั้นยังเหลือ ยังต้องเตือน', async () => {
    await receive(prod, 10, '2026-01-01', '2026-09-01');
    await consume(prod, 4, '2026-03-01');
    expect(await nearest()).toBe('2026-09-01');
  });

  it('ล็อตที่ไม่มีวันหมดอายุถูกตัดทีหลัง จึงไม่ดันล็อตที่มีให้หลุด', async () => {
    await receive(prod, 5, '2026-01-01', null);          // ไม่มีวันหมดอายุ
    await receive(prod, 5, '2026-02-01', '2026-09-01');  // มี — ตัดก่อนตาม FEFO
    await consume(prod, 3, '2026-03-01');

    /* ตัด 3 จากล็อตที่มีวันหมดอายุ ยังเหลือ 2 */
    expect(await nearest()).toBe('2026-09-01');
  });

  /*
   * พิสูจน์ว่า SQL ให้คำตอบตรงกับการเล่นบัญชีจริง ไม่ใช่แค่ดูสมเหตุสมผล
   * ถ้าสองทางนี้เดินห่างกันเมื่อไหร่ ป้ายเตือนจะโกหกโดยไม่มีใครรู้
   */
  it('ตรงกับการเล่นบัญชีจริงของ lotsOfProduct()', async () => {
    await receive(prod, 4, '2026-01-01', '2027-01-01');
    await receive(prod, 4, '2026-02-01', '2026-06-01');
    await receive(prod, 4, '2026-03-01', null);
    await consume(prod, 6, '2026-04-01');

    const lots = await lotsOfProduct(app, prod);
    const fromReplay = lots.find((l) => l.expiresOn)?.expiresOn ?? null;

    expect(await nearest()).toBe(fromReplay);
  });

  it('ของอู่อื่นไม่โผล่มา', async () => {
    await receive(prod, 5, '2026-01-01', '2026-09-01');
    await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
    const m = await nearestExpiryWith(app);
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
    expect(m.has(prod)).toBe(false);
  });

  describe('รายการของใกล้หมดอายุ', () => {
    it('เกินเกณฑ์ — ไม่ขึ้นในรายการ', async () => {
      await receive(prod, 5, '2026-01-01', '2099-01-01');
      expect(await listExpiringWith(app, 60)).toEqual([]);
    });

    it('หมดอายุไปแล้ว — ขึ้น พร้อมจำนวนวันติดลบ', async () => {
      await receive(prod, 5, '2020-01-01', '2020-06-01');
      const rows = await listExpiringWith(app, 60);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.code).toBe('OIL-01');
      expect(rows[0]!.daysLeft).toBeLessThan(0);
      expect(rows[0]!.qtyOnHand).toBe(5);
    });

    it('สินค้าที่ปิดใช้งานแล้ว ไม่มาเตือนให้รก', async () => {
      await receive(prod, 5, '2020-01-01', '2020-06-01');
      await app.query(`update products set active = false where id = $1`, [prod]);
      expect(await listExpiringWith(app, 60)).toEqual([]);
    });

    it('เกณฑ์ที่ส่งเข้ามามีผลจริง', async () => {
      const far = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
      await receive(prod, 5, '2026-01-01', far);
      expect(await listExpiringWith(app, 30)).toEqual([]);
      expect(await listExpiringWith(app, 90)).toHaveLength(1);
    });
  });

  /*
   * หน้าจอเปิดเอกสารถามถึงอะไหล่สิบบรรทัด ไม่ควรต้องเล่นประวัติสต๊อกทั้งร้าน
   * แต่ตัวกรองที่เขียนผิดนิดเดียวจะกลายเป็น "ตอบทุกอย่าง" ซึ่งไม่มีใครสังเกต
   * เพราะคำตอบที่เกินมายังถูกอยู่ แค่ช้าและรั่วข้อมูลของสินค้าที่ไม่ได้ถาม
   */
  describe('ถามเฉพาะสินค้าที่ระบุ', () => {
    it('ตอบเฉพาะตัวที่ถาม ไม่พ่วงตัวอื่นมาด้วย', async () => {
      const other = await addProduct('OIL-02');
      await receive(prod, 5, '2026-01-01', '2026-09-01');
      await receive(other, 5, '2026-01-01', '2026-10-01');

      const m = await nearestExpiryWith(app, [other]);
      expect(m.size).toBe(1);
      expect(m.get(other)).toBe('2026-10-01');
      expect(m.has(prod)).toBe(false);
    });

    it('ไม่ได้ถามถึงสินค้าตัวไหนเลย — ต้องได้ผลว่าง ไม่ใช่ได้ทั้งร้าน', async () => {
      await receive(prod, 5, '2026-01-01', '2026-09-01');
      expect((await nearestExpiryWith(app, [])).size).toBe(0);
      /* ไม่ส่งตัวกรองมาเลยยังต้องได้ทั้งร้านเหมือนเดิม */
      expect((await nearestExpiryWith(app)).size).toBe(1);
    });
  });

  /*
   * ตัวเลขบนการ์ดหน้าแรก — นับรายสินค้า ไม่ใช่รายล็อต
   * ถ้ามันนับคนละอย่างกับป้ายในทะเบียนสินค้า อู่จะเห็นเลข 3 ที่หน้าแรก
   * แล้วกดเข้าไปเจอ 5 รายการ โดยไม่มีอะไรอธิบายว่าทำไม
   */
  describe('ตัวเลขของใกล้หมดอายุบนหน้าแรก', () => {
    const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

    it('ไม่มีของใกล้หมดอายุ — ศูนย์ทุกช่อง', async () => {
      await receive(prod, 10, '2026-01-01', null);
      expect(await expiringSummaryWith(app)).toEqual({ count: 0, expired: 0, value: 0 });
    });

    /*
     * การ์ดหน้าแรกกดแล้วไปหน้ารายการ ตัวเลขสองที่จึงต้องนับของอย่างเดียวกัน
     * เคยนับรายสินค้าและคิดมูลค่ายอดคงเหลือทั้งตัว การ์ดกับหน้ารายการเลยไม่ตรงกัน
     * โดยไม่มีอะไรอธิบาย — ของที่ไม่มีวันหมดอายุในตัวเดียวกันถูกนับเข้าไปด้วย
     */
    it('นับรายล็อต และคิดมูลค่าเฉพาะของที่อยู่ในล็อตที่ใกล้หมด', async () => {
      await receive(prod, 4, '2026-01-01', inDays(10));
      await receive(prod, 6, '2026-02-01', inDays(20));
      await receive(prod, 10, '2026-03-01', null);   /* ไม่มีวันหมดอายุ ต้องไม่ถูกนับ */

      const sum = await expiringSummaryWith(app);
      expect(sum.count).toBe(2);
      /* (4 + 6) × ต้นทุน 100 บาท — ไม่ใช่ 20 ชิ้นที่คงเหลือทั้งหมด */
      expect(sum.value).toBe(1000);
    });

    it('ล็อตที่ถูกตัดไปบางส่วน — มูลค่าคิดจากเศษที่เหลือ', async () => {
      await receive(prod, 10, '2026-01-01', inDays(10));
      await consume(prod, 4, '2026-03-01');
      expect((await expiringSummaryWith(app)).value).toBe(600);
    });

    it('แยกได้ว่าล็อตไหนเลยวันหมดอายุไปแล้ว', async () => {
      const late = await addProduct('OIL-03');
      await receive(prod, 5, '2026-01-01', inDays(10));
      await receive(late, 5, '2020-01-01', inDays(-5));

      const sum = await expiringSummaryWith(app);
      expect(sum.count).toBe(2);
      expect(sum.expired).toBe(1);
    });

    it('เกณฑ์วันของร้านมีผลจริง — ไม่ได้ฝังเลข 60 ไว้ในคิวรี', async () => {
      await receive(prod, 5, '2026-01-01', inDays(45));
      expect((await expiringSummaryWith(app)).count).toBe(1);

      /* คืนค่าเดิมใน finally — ถ้าข้อนี้ล้มกลางคัน เกณฑ์ที่ค้างไว้จะไปทำให้
         ข้อถัด ๆ ไปล้มตามแบบที่หาสาเหตุไม่เจอ beforeEach ล้างแค่สินค้ากับสต๊อก */
      try {
        await app.query(
          `update tenants set expiry_warn_days = 30 where id = current_tenant_id()`);
        expect((await expiringSummaryWith(app)).count).toBe(0);
      } finally {
        await app.query(
          `update tenants set expiry_warn_days = 60 where id = current_tenant_id()`);
      }
    });

    it('สินค้าที่ปิดใช้งานแล้ว ไม่ถูกนับ — ตรงกับรายการที่กดเข้าไปดู', async () => {
      await receive(prod, 5, '2026-01-01', inDays(10));
      await app.query(`update products set active = false where id = $1`, [prod]);
      expect(await expiringSummaryWith(app)).toEqual({ count: 0, expired: 0, value: 0 });
    });

    it('ของอู่อื่นไม่ถูกนับรวม', async () => {
      await receive(prod, 5, '2026-01-01', inDays(10));
      await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
      const sum = await expiringSummaryWith(app);
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
      expect(sum.count).toBe(0);
    });
  });

  /*
   * รายการรายล็อตของหน้า 05.1.1 — ต่างจากรายการรายสินค้าตรงที่ต้องบอก
   * "ของที่ต้องไปจัดการมีกี่ชิ้น" ล็อตที่ถูกตัดไปแล้วบางส่วนจึงต้องตอบเศษที่เหลือ
   * ไม่ใช่จำนวนที่รับเข้ามาตอนแรก ไม่งั้นคนถือกระดาษไปหาของครบจำนวนไม่เจอ
   */
  describe('รายการของใกล้หมดอายุแยกรายล็อต', () => {
    /** วันที่นับจากวันนี้ — รายการนี้เทียบกับ current_date ของฐาน */
    const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

    it('หลายล็อต — แยกบรรทัด เรียงจากที่หมดก่อน พร้อมจำนวนของแต่ละล็อต', async () => {
      await receive(prod, 10, '2026-01-01', inDays(30));
      await receive(prod, 4, '2026-02-01', inDays(10));

      const rows = await listExpiringLotsWith(app, 60);
      expect(rows.map((r) => [r.expiresOn, r.qty])).toEqual([
        [inDays(10), 4],
        [inDays(30), 10],
      ]);
      expect(rows[0]!.code).toBe('OIL-01');
      expect(rows[0]!.value).toBe(400);
    });

    it('ล็อตที่ถูกตัดไปบางส่วน — ตอบเศษที่เหลือ ไม่ใช่จำนวนที่รับเข้ามา', async () => {
      await receive(prod, 10, '2026-01-01', inDays(10));
      await receive(prod, 10, '2026-01-01', inDays(30));
      await consume(prod, 4, '2026-03-01');

      const rows = await listExpiringLotsWith(app, 60);
      expect(rows.map((r) => r.qty)).toEqual([6, 10]);
    });

    it('ล็อตที่ถูกตัดหมดแล้ว หายไปจากรายการ', async () => {
      await receive(prod, 10, '2026-01-01', inDays(10));
      await receive(prod, 10, '2026-01-01', inDays(30));
      await consume(prod, 10, '2026-03-01');

      const rows = await listExpiringLotsWith(app, 60);
      expect(rows.map((r) => [r.expiresOn, r.qty])).toEqual([[inDays(30), 10]]);
    });

    it('รับเข้าคนละรอบแต่หมดอายุวันเดียวกัน — รวมเป็นบรรทัดเดียว', async () => {
      await receive(prod, 3, '2026-01-01', inDays(20));
      await receive(prod, 7, '2026-02-01', inDays(20));

      const rows = await listExpiringLotsWith(app, 60);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.qty).toBe(10);
    });

    it('ของที่ไม่มีวันหมดอายุไม่โผล่ในรายการ', async () => {
      await receive(prod, 10, '2026-01-01', null);
      expect(await listExpiringLotsWith(app, 60)).toEqual([]);
    });

    it('เลยวันหมดอายุแล้วยังอยู่ในรายการ พร้อมจำนวนวันติดลบ', async () => {
      await receive(prod, 5, '2020-01-01', inDays(-3));
      const rows = await listExpiringLotsWith(app, 60);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.daysLeft).toBe(-3);
    });

    it('เกินเกณฑ์วันเตือน — ไม่ขึ้น', async () => {
      await receive(prod, 5, '2026-01-01', inDays(45));
      expect(await listExpiringLotsWith(app, 30)).toEqual([]);
      expect(await listExpiringLotsWith(app, 90)).toHaveLength(1);
    });

    it('สินค้าที่ปิดใช้งานแล้ว ไม่มาเตือนให้รก', async () => {
      await receive(prod, 5, '2026-01-01', inDays(10));
      await app.query(`update products set active = false where id = $1`, [prod]);
      expect(await listExpiringLotsWith(app, 60)).toEqual([]);
    });

    it('ของอู่อื่นไม่โผล่มา', async () => {
      await receive(prod, 5, '2026-01-01', inDays(10));
      await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
      const rows = await listExpiringLotsWith(app, 60);
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
      expect(rows).toEqual([]);
    });
  });
});
