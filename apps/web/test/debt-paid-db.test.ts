/**
 * ยอดค้างชำระต้องตรงกันทุกหน้า (24 พ.ย. 2569)
 *
 * ใบส่งมอบกับใบเสร็จที่ออกต่อจากมันคือหนี้ก้อนเดียวกัน เงินรับได้ทั้งสองที่
 * เดิมแต่ละหน้านับเฉพาะเงินที่ผูกกับใบของตัวเอง จึงตอบไม่ตรงกัน:
 * ใบที่จ่ายครบผ่านใบเสร็จแล้วยังถูกเสนอให้วางบิล และเงินที่รับบางส่วนไว้ที่ใบส่งมอบ
 * หายจากหน้าลูกหนี้ทันทีที่ออกใบเสร็จ — นิยามเดียวอยู่ที่ src/lib/debt-paid.ts
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { receivablesWith } from '../src/lib/ar-ap';
import { openInvoices, unbilledSummary } from '../src/lib/billnotes';
import { recordPaymentWith } from '../src/lib/bulk-pay';
import { contactTotalsWith } from '../src/lib/contact-totals';
import { DEBT_PAID_SQL, RECEIPT_MIRROR_PREFIX } from '../src/lib/debt-paid';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ยอดค้างชำระของคู่ใบส่งมอบ–ใบเสร็จ', () => {
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
      end $$;`);
    await admin.query(
      readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบยอดค้าง') returning id`);
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
    for (const t of ['billnote_docs', 'billnotes', 'payments', 'doc_edits', 'documents', 'contacts']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
    const c = await admin.query(
      `insert into contacts (tenant_id, code, kind, type, org_name)
       values ($1,'CUS-0001','customer','company','บริษัท ลูกค้า จำกัด') returning id`, [tenantId]);
    custId = c.rows[0].id;
  });

  async function sellDoc(kind: 'IV' | 'RC', no: string, payable: number, parent?: string): Promise<string> {
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_id, party_name,
                              subtotal, net_amount, grand_total, payable, vat_mode, vat_rate,
                              parent_doc_id, due_date)
       values ($1,$2,$3,'2026-03-01','issued',$4,'บริษัท ลูกค้า จำกัด',$5,$5,$5,$5,'none',0,$6,'2026-03-31')
       returning id`, [tenantId, kind, no, custId, payable, parent ?? null]);
    return d.rows[0].id;
  }

  const pay = (docId: string, amount: number) => admin.query(
    `insert into payments (tenant_id, doc_id, paid_on, amount, method)
     values ($1,$2,'2026-03-02',$3,'เงินสด')`, [tenantId, docId, amount]);

  it('ใบส่งมอบที่จ่ายครบผ่านใบเสร็จ — ไม่ค้างในหน้าไหนเลย และไม่ถูกเสนอให้วางบิล', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 1000);

    expect((await receivablesWith(app)).total).toBe(0);
    expect(await openInvoices(app, { partyId: custId })).toEqual([]);
    expect((await unbilledSummary(app)).owed).toBe(0);
    expect((await contactTotalsWith(app)).get(custId)).toEqual({ spent: 1000, owe: 0 });
  });

  it('รับบางส่วนไว้ที่ใบส่งมอบ แล้วออกใบเสร็จ — หน้าลูกหนี้ยังจำเงินก้อนนั้นได้', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await pay(iv, 300);
    await sellDoc('RC', 'RC-001', 1000, iv);

    const ar = await receivablesWith(app);
    /* หนี้ก้อนเดียว นับที่ใบเสร็จใบเดียว และยอดค้างคือ 700 ไม่ใช่ 1,000 */
    expect(ar.rows.map((r) => [r.docNo, r.paid, r.outstanding])).toEqual([['RC-001', 300, 700]]);
    expect(ar.total).toBe(700);

    /* ใบวางบิลเสนอใบเสร็จใบเดียว ยอดเดียวกับหน้าลูกหนี้ */
    const open = await openInvoices(app, { partyId: custId });
    expect(open.map((o) => [o.docNo, o.outstanding])).toEqual([['RC-001', 700]]);
    expect((await contactTotalsWith(app)).get(custId)).toEqual({ spent: 1000, owe: 700 });
  });

  it('ใบเสร็จถูกยกเลิก — หนี้กลับมาอยู่ที่ใบส่งมอบ และเงินที่รับที่ใบเสร็จไม่ถูกนับ', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 1000);
    await admin.query(`update documents set status = 'void', voided_at = now() where id = $1`, [rc]);

    const ar = await receivablesWith(app);
    expect(ar.rows.map((r) => [r.docNo, r.outstanding])).toEqual([['IV-001', 1000]]);
  });

  it('รับชำระที่ใบเสร็จเกินยอดค้างของทั้งคู่ไม่ได้', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await pay(iv, 300);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);

    await expect(recordPaymentWith(app, null, {
      docId: rc, paidOn: '2026-03-03', amount: 1000, method: 'เงินสด', ref: '',
    })).rejects.toThrow();

    await recordPaymentWith(app, null, {
      docId: rc, paidOn: '2026-03-03', amount: 700, method: 'เงินสด', ref: '',
    });
    expect((await receivablesWith(app)).total).toBe(0);
  });

  /* ---------- ข้อมูลที่นำเข้าจากรุ่น 6.4 — เงินตามใบเสร็จถูกคัดลอกไว้ที่ใบส่งมอบด้วย ---------- */

  const mirror = (ivId: string, rcNo: string, amount: number) => admin.query(
    `insert into payments (tenant_id, doc_id, paid_on, amount, method, ref)
     values ($1,$2,'2026-03-02',$3,'เงินโอน',$4)`, [tenantId, ivId, amount, `${RECEIPT_MIRROR_PREFIX}${rcNo}`]);

  const paidOf = async (docId: string): Promise<number> => {
    const { rows } = await app.query(
      `select coalesce((select dp.paid from ${DEBT_PAID_SQL} dp where dp.doc_id = $1), 0)::float8 as paid`, [docId]);
    return rows[0].paid;
  };

  it('ข้อมูลจาก 6.4: จ่ายครบตามใบเสร็จ มีสำเนาที่ใบส่งมอบ — ยอดชำระไม่เป็นสองเท่า', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 1000);
    await mirror(iv, 'RC-001', 1000);

    expect(await paidOf(iv)).toBe(1000);
    expect(await paidOf(rc)).toBe(1000);
    expect((await receivablesWith(app)).total).toBe(0);
    expect((await contactTotalsWith(app)).get(custId)).toEqual({ spent: 1000, owe: 0 });
  });

  it('ข้อมูลจาก 6.4: รับมาครึ่งเดียว — ยังค้างอีกครึ่ง ไม่ใช่ดูเหมือนจ่ายครบ', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 500);
    await mirror(iv, 'RC-001', 500);

    expect(await paidOf(iv)).toBe(500);
    expect(await paidOf(rc)).toBe(500);
    const ar = await receivablesWith(app);
    expect(ar.rows.map((r) => [r.docNo, r.paid, r.outstanding])).toEqual([['RC-001', 500, 500]]);
    expect(ar.total).toBe(500);
    const open = await openInvoices(app, { partyId: custId });
    expect(open.map((o) => [o.docNo, o.outstanding])).toEqual([['RC-001', 500]]);
    expect((await contactTotalsWith(app)).get(custId)).toEqual({ spent: 1000, owe: 500 });
  });

  it('ข้อมูลจาก 6.4: เงินที่รับที่ใบส่งมอบเองก่อนออกใบเสร็จ ยังนับ — ตัดเฉพาะแถวสำเนา', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await pay(iv, 300);                       // รับจริงที่ใบส่งมอบ
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 200);                       // รับจริงที่ใบเสร็จ
    await mirror(iv, 'RC-001', 200);          // สำเนาของ 200 ข้างบน

    expect(await paidOf(iv)).toBe(500);
    expect(await paidOf(rc)).toBe(500);
    expect((await receivablesWith(app)).total).toBe(500);
  });

  it('อ้างอิงหน้าตาคล้ายสำเนาแต่ไม่ตรงกับใบเสร็จของใบนั้น — เป็นเงินจริง ต้องนับ', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await mirror(iv, 'RC-999', 400);          // ไม่มีใบเสร็จเลขนี้ต่อจากใบนี้
    expect(await paidOf(iv)).toBe(400);
    expect((await receivablesWith(app)).total).toBe(600);
  });

  it('ข้อมูลจาก 6.4: ใบเสร็จถูกยกเลิก — สำเนาที่ค้างอยู่ที่ใบส่งมอบไม่ทำให้หนี้หาย', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 1000);
    await mirror(iv, 'RC-001', 1000);
    await admin.query(`update documents set status = 'void', voided_at = now() where id = $1`, [rc]);

    expect(await paidOf(iv)).toBe(0);
    expect((await receivablesWith(app)).total).toBe(1000);
  });

  /* ---------- เงินก้อนเดียวที่ผู้ใช้บันทึกรับสองครั้งในเว็บ — ไม่มีอ้างอิงให้แยก ใช้เพดานของคู่ ---------- */

  it('บันทึกรับเต็มจำนวนทั้งที่ใบส่งมอบและใบเสร็จ — ยอดชำระไม่เกินยอดใบ', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 1000);
    await pay(iv, 1000);

    expect(await paidOf(iv)).toBe(1000);
    expect(await paidOf(rc)).toBe(1000);
    expect((await receivablesWith(app)).total).toBe(0);
    expect((await contactTotalsWith(app)).get(custId)).toEqual({ spent: 1000, owe: 0 });
  });

  it('แบ่งจ่ายจริงสองที่ รวมไม่เกินยอดใบ — เพดานไม่ตัดอะไร', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await pay(iv, 300);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 500);

    expect(await paidOf(iv)).toBe(800);
    expect(await paidOf(rc)).toBe(800);
    expect((await receivablesWith(app)).total).toBe(200);
  });

  it('ข้อจำกัดที่รู้: รับบางส่วนแล้วบันทึกซ้ำ (600 + 600 ของใบ 1,000) — เห็นเป็นจ่ายครบ ไม่เกินยอดใบ', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);
    await pay(rc, 600);
    await pay(iv, 600);

    expect(await paidOf(iv)).toBe(1000);
    expect(await paidOf(rc)).toBe(1000);
  });

  it('ใบเดี่ยวที่รับเกินยอด — ไม่อยู่ในคู่ ได้ค่าเท่าเดิม ไม่ถูกตัด', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await pay(iv, 1200);
    expect(await paidOf(iv)).toBe(1200);
  });

  it('ใบส่งมอบที่รับเงินไว้ ใบเสร็จยังไม่มีเงิน — ใบส่งมอบได้ค่าเท่าเดิม ใบเสร็จได้เท่ากันแต่ไม่เกินยอด', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await pay(iv, 400);
    const rc = await sellDoc('RC', 'RC-001', 1000, iv);

    expect(await paidOf(iv)).toBe(400);
    expect(await paidOf(rc)).toBe(400);
  });

  it('ใบส่งมอบเดี่ยวและใบเสร็จขายหน้าร้าน — ได้ยอดเท่าเดิมทุกประการ', async () => {
    const iv = await sellDoc('IV', 'IV-001', 1000);
    await pay(iv, 400);
    const walk = await sellDoc('RC', 'RC-002', 500);
    await pay(walk, 500);

    const ar = await receivablesWith(app);
    expect(ar.rows.map((r) => [r.docNo, r.paid, r.outstanding])).toEqual([['IV-001', 400, 600]]);
  });
});
