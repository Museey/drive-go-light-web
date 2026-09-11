/**
 * ตัวเลขชุดใหม่บนหน้าแรก และตารางเอกสารขายรายใบ
 *
 * ข้อที่สำคัญที่สุดคือ **ตัวเลขเกินกำหนดบนหน้าแรกต้องตรงกับหน้า 06.2 / 06.3 เป๊ะ**
 * เพราะทั้งสองหน้าอยู่ห่างกันแค่คลิกเดียว คนเปิดเทียบกันแน่นอน
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { payablesWith, receivablesWith } from '../src/lib/ar-ap';
import {
  owingSidesWith, salesByMonthWith, salesDocsWith, topOwing, whtByRateWith,
} from '../src/lib/home-report';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ตัวเลขรายงานหน้าแรก', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let otherTenant: string;
  let custA: string;
  let custB: string;

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
      `insert into tenants (name) values ('อู่รายงาน'), ('อู่ข้างบ้าน') returning id`);
    tenantId = t.rows[0].id;
    otherTenant = t.rows[1].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    for (const t of [otherTenant, tenantId]) {
      await admin.query(`delete from payments where tenant_id = $1`, [t]);
      await admin.query(`delete from stock_moves where tenant_id = $1`, [t]);
      await admin.query(`delete from documents where tenant_id = $1`, [t]);
      await admin.query(`delete from contacts where tenant_id = $1`, [t]);
    }
    const c = await admin.query(
      `insert into contacts (tenant_id, code, kind, type, org_name)
       values ($1,'CUS-1','customer','company','บริษัท ก จำกัด'),
              ($1,'CUS-2','customer','company','บริษัท ข จำกัด')
       returning id`, [tenantId]);
    custA = c.rows[0].id;
    custB = c.rows[1].id;
  });

  /** วันที่นับจาก current_date ของฐาน ไม่ใช่นาฬิกาของ Node (คนละเขตเวลากัน) */
  const day = async (n: number): Promise<string> => {
    const { rows } = await app.query(`select (current_date + $1::int)::text as d`, [n]);
    return rows[0].d as string;
  };
  const monthOf = async (n: number): Promise<string> => {
    const { rows } = await app.query(
      `select to_char(date_trunc('month', current_date) + make_interval(months => $1::int),
                      'YYYY-MM') as k`, [n]);
    return rows[0].k as string;
  };

  interface DocOpts {
    kind?: string; partyId?: string | null; name?: string;
    date?: string; due?: string | null; net?: number; vat?: number; wht?: number;
    tenant?: string;
  }

  async function doc(no: string, o: DocOpts = {}): Promise<string> {
    const net = o.net ?? 1000;
    const vat = o.vat ?? 0;
    const wht = o.wht ?? 0;
    const payable = net + vat - wht;
    const { rows } = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, due_date, status,
                              party_id, party_name, subtotal, net_amount, vat_amount,
                              wht_amount, wht_rate, grand_total, payable, vat_mode, vat_rate)
       values ($1,$2,$3,$4,$5,'issued',$6,$7,$8,$8,$9::numeric,$10,$11,$12,$13,
               (case when $9::numeric > 0 then 'ex' else 'none' end)::vat_mode,
               case when $9::numeric > 0 then 7 else 0 end)
       returning id`,
      /* ตั้งต้นเป็นใบส่งมอบแบบไม่มี VAT — สคีมาบังคับว่า IVT ต้องมีภาษีเสมอ
         ข้อที่ต้องการ VAT จริงจะส่ง kind กับ vat มาเอง */
      [o.tenant ?? tenantId, o.kind ?? 'IV', no, o.date ?? await day(-10), o.due ?? null,
       o.partyId === undefined ? custA : o.partyId, o.name ?? 'บริษัท ก จำกัด',
       net, vat, wht, wht > 0 ? 3 : 0, net + vat, payable],
    );
    return rows[0].id;
  }

  const pay = (docId: string, amount: number) => admin.query(
    `insert into payments (tenant_id, doc_id, paid_on, method, amount)
     values ($1,$2,current_date,'เงินโอน',$3)`, [tenantId, docId, amount]);

  describe('ยอดขายหกเดือนล่าสุด', () => {
    it('ได้ครบหกเดือนเสมอ เรียงเก่าไปใหม่ และเดือนล่าสุดอยู่ท้าย', async () => {
      const bars = await salesByMonthWith(app, 6);
      expect(bars).toHaveLength(6);
      expect(bars.map((b) => b.key)).toEqual([...bars.map((b) => b.key)].sort());
      expect(bars[5]!.key).toBe(await monthOf(0));
    });

    /* แท่งที่หายไปทำให้กราฟโกหก เพราะเดือนที่เหลือเลื่อนมาชิดกันเหมือนขายได้ทุกเดือน */
    it('เดือนที่ไม่มีใบได้ศูนย์ ไม่ใช่หายไปจากแถว', async () => {
      await doc('IV-1', { date: await day(-1), net: 500 });
      const bars = await salesByMonthWith(app, 6);

      expect(bars).toHaveLength(6);
      expect(bars.filter((b) => b.amount === 0).length).toBeGreaterThan(0);
      expect(bars[5]!.amount).toBe(500);
    });

    it('ใบที่ยกเลิกไม่ถูกนับ', async () => {
      const id = await doc('IV-1', { date: await day(-1), net: 500 });
      await admin.query(
        `update documents set status='void', voided_at=now() where id=$1`, [id]);
      expect((await salesByMonthWith(app, 6))[5]!.amount).toBe(0);
    });

    it('ของอู่อื่นไม่โผล่มา', async () => {
      await doc('IV-X', { date: await day(-1), net: 900, tenant: otherTenant });
      expect((await salesByMonthWith(app, 6))[5]!.amount).toBe(0);
    });
  });

  describe('ห้าอันดับที่ค้างมากที่สุด', () => {
    it('รวมยอดรายคู่ค้า เรียงจากมากไปน้อย', () => {
      const top = topOwing([
        { partyId: 'a', partyName: 'ก', outstanding: 100 },
        { partyId: 'b', partyName: 'ข', outstanding: 500 },
        { partyId: 'a', partyName: 'ก', outstanding: 50 },
      ]);
      expect(top.map((t) => [t.name, t.count, t.amount]))
        .toEqual([['ข', 1, 500], ['ก', 2, 150]]);
    });

    /* จัดกลุ่มด้วยชื่ออย่างเดียวจะยุบใบที่ไม่มีชื่อรวมกันเป็นก้อนที่ไม่มีความหมาย
       และแยกลูกค้าคนเดียวกันที่พิมพ์ชื่อต่างกันนิดเดียวออกเป็นสองคน */
    it('ใบที่ไม่ได้ผูกทะเบียนแยกตามชื่อ ไม่ยุบรวมกับคนอื่น', () => {
      const top = topOwing([
        { partyId: null, partyName: 'ลูกค้าเงินสด', outstanding: 10 },
        { partyId: null, partyName: '', outstanding: 20 },
        { partyId: null, partyName: '', outstanding: 5 },
      ]);
      expect(top).toHaveLength(2);
      expect(top[0]).toMatchObject({ name: 'ไม่ระบุชื่อ', count: 2, amount: 25 });
    });

    /*
     * ชื่อคู่ค้าถูกคัดลอกลงเอกสารตอนออกใบ แก้ชื่อในทะเบียนทีหลังแล้วใบเก่าไม่เปลี่ยนตาม
     * ลูกค้ารายเดียวจึงมีได้หลายชื่อ — จัดกลุ่มด้วยชื่อจะกลายเป็นคนละคน
     */
    it('ลูกค้ารายเดียวที่ชื่อบนใบไม่ตรงกัน ยังเป็นก้อนเดียว', () => {
      const top = topOwing([
        { partyId: 'a', partyName: 'บริษัท ก จำกัด', outstanding: 100 },
        { partyId: 'a', partyName: 'บริษัท ก. จำกัด', outstanding: 50 },
      ]);
      expect(top).toHaveLength(1);
      expect(top[0]).toMatchObject({ count: 2, amount: 150 });
    });

    it('คนละรายที่ชื่อซ้ำกัน ไม่ถูกยุบรวม', () => {
      const top = topOwing([
        { partyId: 'a', partyName: 'ร้านสมชาย', outstanding: 100 },
        { partyId: 'b', partyName: 'ร้านสมชาย', outstanding: 40 },
      ]);
      expect(top).toHaveLength(2);
      expect(top.map((t) => t.amount)).toEqual([100, 40]);
    });

    it('ตัดที่จำนวนที่ขอ', () => {
      const rows = Array.from({ length: 9 }, (_, i) => (
        { partyId: `p${i}`, partyName: `ร้าน ${i}`, outstanding: i + 1 }));
      expect(topOwing(rows, 5)).toHaveLength(5);
      expect(topOwing(rows, 5)[0]!.amount).toBe(9);
    });
  });

  /** ข้อสำคัญที่สุดของไฟล์นี้ */
  describe('ตัวเลขหน้าแรกตรงกับหน้าลูกหนี้และเจ้าหนี้', () => {
    it('ยอดรวม จำนวนใบ และเกินกำหนด ตรงกันทุกช่อง', async () => {
      await doc('IV-1', { due: await day(-5), net: 1000 });                 // เกินกำหนด
      await doc('IV-2', { due: await day(10), net: 2000, partyId: custB,
                          name: 'บริษัท ข จำกัด' });                        // ยังไม่ถึงกำหนด
      const paid = await doc('IV-3', { due: await day(-3), net: 500 });
      await pay(paid, 500);                                                   // จ่ายครบ ไม่ค้าง
      await doc('PO-1', { kind: 'PO', due: await day(-2), net: 700, partyId: null,
                          name: 'ร้านอะไหล่' });

      const [home, ar, ap] = await Promise.all([
        owingSidesWith(app, 5), receivablesWith(app), payablesWith(app),
      ]);

      expect(home.ar.total).toBe(ar.total);
      expect(home.ar.count).toBe(ar.count);
      expect(home.ar.overdueTotal).toBe(ar.overdueTotal);
      expect(home.ar.overdueCount).toBe(ar.overdueCount);

      expect(home.ap.total).toBe(ap.total);
      expect(home.ap.overdueCount).toBe(ap.overdueCount);

      /* และตัวเลขต้องไม่ใช่ศูนย์ ไม่งั้นข้อนี้ผ่านเพราะไม่มีข้อมูล */
      expect(home.ar.count).toBe(2);
      expect(home.ar.overdueCount).toBe(1);
      expect(home.ap.overdueCount).toBe(1);
      expect(home.ar.top[0]!.amount).toBe(2000);
    });
  });

  describe('หัก ณ ที่จ่ายแยกตามอัตรา', () => {
    it('แยกอัตราถูก และรวมกันแล้วเท่ากับยอดรวม', async () => {
      const m = await monthOf(0);
      await doc('RC-1', { kind: 'RC', date: await day(-1), net: 1000, wht: 30 });
      await doc('RC-2', { kind: 'RC', date: await day(-1), net: 2000, wht: 60 });

      const rates = await whtByRateWith(app, m);
      expect(rates).toHaveLength(1);
      expect(rates[0]).toMatchObject({ rate: 3, count: 2, base: 3000, amount: 90 });
    });

    it('ใบที่ไม่ถูกหักไม่ถูกนับ', async () => {
      await doc('RC-1', { kind: 'RC', date: await day(-1), net: 1000 });
      expect(await whtByRateWith(app, await monthOf(0))).toEqual([]);
    });
  });

  describe('เอกสารขายรายใบ', () => {
    it('ยอดรวมของทุกหน้าเท่ากับยอดรวมทั้งช่วง และแบ่งหน้าไม่ซ้ำไม่ขาด', async () => {
      for (let i = 1; i <= 5; i++) {
        await doc(`IV-${i}`, { date: await day(-i), net: 100 * i });
      }

      const first = await salesDocsWith(app, { pageSize: 2, page: 1 });
      const second = await salesDocsWith(app, { pageSize: 2, page: 2 });
      const third = await salesDocsWith(app, { pageSize: 2, page: 3 });

      expect(first.total).toBe(5);
      expect(third.rows).toHaveLength(1);

      const all = [...first.rows, ...second.rows, ...third.rows];
      expect(new Set(all.map((r) => r.id)).size).toBe(5);
      expect(all.reduce((s, r) => s + r.net, 0)).toBe(1500);
    });

    /* ศูนย์แปลว่าขายได้กำไรเต็มจำนวน ซึ่งคนละเรื่องกับยังไม่ได้ตัดสต๊อก */
    it('ใบที่ยังไม่เคยตัดสต๊อกได้ต้นทุนว่าง ไม่ใช่ศูนย์', async () => {
      await doc('IV-1', { net: 1000 });
      const { rows } = await salesDocsWith(app, {});
      expect(rows[0]!.cost).toBeNull();
    });

    it('ใบที่ตัดสต๊อกแล้วได้ต้นทุนที่ตรึงไว้ และของที่คืนหักกลบให้', async () => {
      const id = await doc('RC-1', { kind: 'RC', net: 1000 });
      const p = await admin.query(
        `insert into products (tenant_id, code, name, unit, last_cost)
         values ($1,'P-1','ของ','ชิ้น',100) returning id`, [tenantId]);

      await admin.query(
        `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, unit_cost,
                                  cost_amount, reason, doc_id)
         values ($1,$2,current_date,-3,100,300,'sale',$3)`,
        [tenantId, p.rows[0].id, id]);

      expect((await salesDocsWith(app, {})).rows[0]!.cost).toBe(300);

      await admin.query(
        `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta, unit_cost,
                                  cost_amount, reason, doc_id)
         values ($1,$2,current_date,1,100,100,'return',$3)`,
        [tenantId, p.rows[0].id, id]);

      expect((await salesDocsWith(app, {})).rows[0]!.cost).toBe(200);
    });

    it('กรองตามช่วงวันที่', async () => {
      await doc('IV-1', { date: await day(-30), net: 100 });
      await doc('IV-2', { date: await day(-1), net: 200 });

      const recent = await salesDocsWith(app, { from: await day(-7) });
      expect(recent.total).toBe(1);
      expect(recent.rows[0]!.net).toBe(200);
    });

    it('ของอู่อื่นไม่โผล่มา', async () => {
      await doc('IV-X', { net: 999, tenant: otherTenant });
      expect((await salesDocsWith(app, {})).total).toBe(0);
    });
  });
});
