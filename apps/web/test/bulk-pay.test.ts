/**
 * ตัดชำระหลายใบพร้อมกัน
 *
 * สองเรื่องที่ต้องพิสูจน์ให้แน่:
 * 1. **ทั้งชุดอยู่ในทรานแซกชันเดียว** — ใบสุดท้ายพังแล้วใบแรกต้องไม่ถูกบันทึก
 *    ถ้าบันทึกไปครึ่งทาง ผู้ใช้จะไม่รู้ว่าตัดถึงใบไหน แล้วกดซ้ำจนรับเงินสองรอบ
 * 2. **ยอดเกินถูกปรับลงให้พอดี ไม่ใช่ทะลุเข้าไป** — ยอดตั้งต้นมาจากยอดค้าง
 *    ณ ตอนเปิดหน้า ระหว่างนั้นอาจมีคนอื่นตัดชำระใบเดียวกันไปแล้ว
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { bulkPay } from '../src/lib/bulk-pay';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ตัดชำระหลายใบพร้อมกัน', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
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

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบตัดชำระ') returning id`);
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
    await app.query('rollback').catch(() => {});
    for (const t of ['payments', 'doc_items', 'documents', 'contacts']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
    const c = await admin.query(
      `insert into contacts (tenant_id, code, kind, type, org_name)
       values ($1,'CUS-0001','customer','company','บริษัท ลูกค้าองค์กร จำกัด') returning id`,
      [tenantId],
    );
    custId = c.rows[0].id;
  });

  /** ใบส่งมอบที่ยอดสุทธิเท่ากับ payable พอดี อ่านผลง่าย */
  async function invoice(no: string, payable: number, status = 'issued'): Promise<string> {
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_id, party_name,
                              subtotal, net_amount, grand_total, payable, vat_mode, vat_rate,
                              voided_at)
       values ($1,'IVT',$2,'2026-03-05',$3::doc_status,$4,'บริษัท ลูกค้าองค์กร จำกัด',$5,$5,$5,$5,'ex',0,
               case when $3::text = 'void' then now() end)
       returning id`,
      [tenantId, no, status, custId, payable],
    );
    return d.rows[0].id;
  }

  const paidOf = async (docId: string): Promise<number> => {
    const r = await admin.query(
      `select coalesce(sum(amount),0) as p from payments where doc_id = $1`, [docId],
    );
    return Number(r.rows[0].p);
  };

  const run = (lines: { docId: string; amount: number }[], ref = 'CHQ-0091') =>
    bulkPay(app, null, { lines, paidOn: '2026-04-10', method: 'เช็ค', ref });

  it('ตัดสามใบด้วยเช็คใบเดียว ทุกใบได้วันที่ ช่องทาง และเลขอ้างอิงชุดเดียวกัน', async () => {
    const a = await invoice('IVT-001', 1000);
    const b = await invoice('IVT-002', 2000);
    const c = await invoice('IVT-003', 3000);

    const res = await run([
      { docId: a, amount: 1000 }, { docId: b, amount: 2000 }, { docId: c, amount: 3000 },
    ]);

    expect(res.count).toBe(3);
    expect(res.total).toBe(6000);
    expect(res.trimmed).toEqual([]);

    const { rows } = await admin.query(
      `select paid_on, method, ref, amount from payments where tenant_id = $1 order by amount`,
      [tenantId],
    );
    expect(rows.map((r) => Number(r.amount))).toEqual([1000, 2000, 3000]);
    for (const r of rows) {
      expect(r.paid_on).toBe('2026-04-10');
      expect(r.method).toBe('เช็ค');
      expect(r.ref).toBe('CHQ-0091');
    }
  });

  it('ใบที่กรอกศูนย์ถูกข้าม ไม่ใช่ฟ้องกลับทั้งชุด', async () => {
    const a = await invoice('IVT-001', 1000);
    const b = await invoice('IVT-002', 2000);

    const res = await run([{ docId: a, amount: 0 }, { docId: b, amount: 2000 }]);

    expect(res.count).toBe(1);
    expect(await paidOf(a)).toBe(0);
    expect(await paidOf(b)).toBe(2000);
  });

  it('ตัดบางส่วนได้ ใบนั้นยังค้างส่วนที่เหลือ', async () => {
    const a = await invoice('IVT-001', 1000);

    const res = await run([{ docId: a, amount: 400 }]);

    expect(res.total).toBe(400);
    expect(await paidOf(a)).toBe(400);
  });

  it('ยอดที่เกินยอดค้างถูกปรับลงให้พอดี และรายงานกลับว่าปรับใบไหน', async () => {
    const a = await invoice('IVT-001', 1000);
    /* มีคนอื่นตัดไปแล้ว 600 ระหว่างที่ผู้ใช้เปิดหน้าค้างไว้ */
    await admin.query(
      `insert into payments (tenant_id, doc_id, paid_on, method, amount)
       values ($1,$2,'2026-04-01','เงินสด',600)`,
      [tenantId, a],
    );

    const res = await run([{ docId: a, amount: 1000 }]);

    expect(res.total).toBe(400);
    expect(res.trimmed).toEqual([{ docNo: 'IVT-001', asked: 1000, used: 400 }]);
    expect(await paidOf(a)).toBe(1000);   // ไม่ทะลุยอดเอกสาร
  });

  it('ใบที่จ่ายครบไปแล้วถูกปรับลงเหลือศูนย์ แล้วข้ามไป', async () => {
    const a = await invoice('IVT-001', 1000);
    const b = await invoice('IVT-002', 2000);
    await admin.query(
      `insert into payments (tenant_id, doc_id, paid_on, method, amount)
       values ($1,$2,'2026-04-01','เงินสด',1000)`,
      [tenantId, a],
    );

    const res = await run([{ docId: a, amount: 1000 }, { docId: b, amount: 2000 }]);

    expect(res.count).toBe(1);
    expect(res.trimmed).toEqual([{ docNo: 'IVT-001', asked: 1000, used: 0 }]);
    expect(await paidOf(a)).toBe(1000);
    expect(await paidOf(b)).toBe(2000);
  });

  it('ทุกใบจ่ายครบหมดแล้ว ฟ้องกลับแทนที่จะบันทึกชุดว่าง', async () => {
    const a = await invoice('IVT-001', 1000);
    await admin.query(
      `insert into payments (tenant_id, doc_id, paid_on, method, amount)
       values ($1,$2,'2026-04-01','เงินสด',1000)`,
      [tenantId, a],
    );

    await expect(run([{ docId: a, amount: 1000 }])).rejects.toThrow(/ตัดชำระครบไปแล้ว/);
  });

  it('มีใบที่ถูกยกเลิกปนมา ฟ้องกลับพร้อมเลขที่ใบนั้น', async () => {
    const a = await invoice('IVT-001', 1000);
    const bad = await invoice('IVT-009', 500, 'void');

    await expect(run([{ docId: a, amount: 1000 }, { docId: bad, amount: 500 }]))
      .rejects.toThrow(/IVT-009/);
  });

  it('ส่งเอกสารซ้ำมาสองบรรทัด ฟ้องกลับ ไม่ตัดซ้ำสองรอบ', async () => {
    const a = await invoice('IVT-001', 1000);

    await expect(run([{ docId: a, amount: 500 }, { docId: a, amount: 500 }]))
      .rejects.toThrow(/ซ้ำ/);
    expect(await paidOf(a)).toBe(0);
  });

  it('ไม่ได้เลือกใบไหนเลย ฟ้องกลับ', async () => {
    await expect(run([])).rejects.toThrow(/ยังไม่ได้เลือก/);
  });

  /**
   * ข้อสำคัญที่สุดของช่วงนี้
   *
   * ใบแรกผ่าน ใบที่สองพัง — ถ้าไม่ได้อยู่ในทรานแซกชันเดียว ใบแรกจะค้างอยู่ในฐาน
   * แล้วผู้ใช้กดซ้ำอีกรอบก็จะกลายเป็นรับเงินใบแรกสองครั้ง
   *
   * ต้องให้พัง **เฉพาะใบหลัง** ถึงจะพิสูจน์อะไรได้ ถ้าใบแรกก็พังไปด้วย
   * (เช่นกรอกวันที่ผิดซึ่งใช้ร่วมกันทุกใบ) เทสต์จะผ่านแม้โค้ด commit ทีละใบ
   * จึงต้องวางกับดักไว้ที่ใบที่สองใบเดียว
   */
  it('ทั้งชุดอยู่ในทรานแซกชันเดียว — ใบท้ายพังแล้วใบแรกต้องไม่ถูกบันทึก', async () => {
    const a = await invoice('IVT-001', 1000);
    const b = await invoice('IVT-002', 2000);

    await admin.query(`
      create or replace function trap_second() returns trigger language plpgsql as $$
      begin
        if (select doc_no from documents where id = new.doc_id) = 'IVT-002' then
          raise exception 'กับดักสำหรับเทสต์';
        end if;
        return new;
      end $$;
      create trigger trap_second before insert on payments
        for each row execute function trap_second();
    `);

    try {
      await app.query('begin');
      await expect(
        bulkPay(app, null, {
          lines: [{ docId: a, amount: 1000 }, { docId: b, amount: 2000 }],
          paidOn: '2026-04-10', method: 'เช็ค', ref: 'CHQ-0091',
        }),
      ).rejects.toThrow(/กับดัก/);
      await app.query('rollback');
    } finally {
      await admin.query('drop trigger trap_second on payments; drop function trap_second();');
    }

    expect(await paidOf(a)).toBe(0);
    expect(await paidOf(b)).toBe(0);
  });
});
