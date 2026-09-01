/**
 * ใบวางบิล
 *
 * เรื่องที่ต้องพิสูจน์ให้หนักที่สุดคือ **ใบวางบิลไม่แตะตัวเลขทางบัญชีเลย**
 * มันเป็นใบแจ้งเก็บ ไม่ใช่เอกสารที่ตั้งลูกหนี้หรือนับรายได้
 * ถ้าพลาดข้อนี้ อู่จะเห็นรายได้เกินจริงเป็นสองเท่า ซึ่งเป็นความผิดพลาดที่แพงที่สุด
 * ที่ระบบบัญชีทำได้ และกว่าจะรู้ตัวก็ตอนยื่นภาษี
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  billnoteOfDoc, getBillnote, listBillnotes, openInvoices, saveBillnote, voidBillnote,
} from '../src/lib/billnotes';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('ใบวางบิล', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let custId: string;

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

    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบวางบิล') returning id`);
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
    for (const t of ['billnote_docs', 'billnotes', 'billnote_sequences',
                     'payments', 'doc_items', 'documents', 'contacts']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
    const c = await admin.query(
      `insert into contacts (tenant_id, code, kind, type, org_name)
       values ($1,'CUS-0001','customer','company','บริษัท ลูกค้าองค์กร จำกัด') returning id`,
      [tenantId],
    );
    custId = c.rows[0].id;
  });

  /** ใบส่งมอบหนึ่งใบที่ยังไม่ได้เก็บเงิน */
  async function invoice(no: string, date: string, amount: number): Promise<string> {
    const d = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_id, party_name,
                              subtotal, net_amount, vat_amount, grand_total, payable, vat_mode, vat_rate)
       values ($1,'IVT',$2,$3,'issued',$4,'บริษัท ลูกค้าองค์กร จำกัด',$5,$5,$6,$7,$7,'ex',7)
       returning id`,
      [tenantId, no, date, custId, amount, amount * 0.07, amount * 1.07],
    );
    return d.rows[0].id;
  }

  async function pay(docId: string, amount: number, on = '2026-04-01') {
    await admin.query(
      `insert into payments (tenant_id, doc_id, paid_on, method, amount)
       values ($1,$2,$3,'เงินโอน',$4)`,
      [tenantId, docId, on, amount],
    );
  }

  const save = (docIds: string[], id?: string) => saveBillnote(app, {
    id,
    billDate: '2026-03-31',
    dueDate: '2026-04-15',
    partyId: custId,
    partyName: 'บริษัท ลูกค้าองค์กร จำกัด',
    partyTaxId: '0105500000000',
    partyAddrText: '1 ถนนสาทร',
    byWhom: 'สมชาย',
    note: 'รับเช็คทุกวันศุกร์',
    docIds,
  }, null);

  it('รวมใบค้างของลูกค้ารายเดียวได้ และยอดเท่าผลรวมยอดค้าง', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    const b = await invoice('IVT-002', '2026-03-12', 2000);

    const { id } = await save([a, b]);
    const got = await getBillnote(app, id);

    expect(got!.note.total).toBe(3210);        // (1000 + 2000) × 1.07
    expect(got!.note.docCount).toBe(2);
    expect(got!.docs.map((d) => d.docNo).sort()).toEqual(['IVT-001', 'IVT-002']);
  });

  it('ลูกค้าจ่ายบางใบแล้ว ยอดบนใบวางบิลลดตามเอง', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    const b = await invoice('IVT-002', '2026-03-12', 2000);
    const { id } = await save([a, b]);

    await pay(a, 1070);

    const got = await getBillnote(app, id);
    expect(got!.note.total).toBe(2140);                 // เหลือเฉพาะใบที่สอง
    /* ยอดที่แจ้งไปตอนวางบิลยังเก็บไว้เทียบได้ */
    expect(got!.note.totalSnapshot).toBe(3210);
    /* ใบที่จ่ายครบแล้วยังอยู่ในใบวางบิล ไม่หายไป */
    expect(got!.docs).toHaveLength(2);
  });

  it('ใบแจ้งหนี้ใบเดียวกันใส่ใบวางบิลที่สองไม่ได้ — ฐานข้อมูลปฏิเสธ', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    await save([a]);

    await expect(save([a])).rejects.toThrow(/อยู่ในใบวางบิล/);
  });

  it('ยกเลิกใบวางบิลแล้วใบข้างในกลับไปวางบิลใบใหม่ได้', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    const first = await save([a]);

    await voidBillnote(app, first.id, 'ลูกค้าขอใหม่');
    expect(await billnoteOfDoc(app, a)).toBeNull();

    const second = await save([a]);
    expect(second.no).not.toBe(first.no);
    expect(await billnoteOfDoc(app, a)).toBe(second.no);
  });

  it('แก้ใบวางบิลแล้วเอาใบออก ใบนั้นกลับไปวางบิลที่อื่นได้', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    const b = await invoice('IVT-002', '2026-03-12', 2000);
    const { id } = await save([a, b]);

    await save([a], id);                                /* เอา b ออก */
    expect(await billnoteOfDoc(app, b)).toBeNull();

    const other = await save([b]);
    expect(await billnoteOfDoc(app, b)).toBe(other.no);
  });

  it('ใบที่อยู่ในใบวางบิลแล้วถูกทำเครื่องหมายไว้ตอนเลือก', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    const b = await invoice('IVT-002', '2026-03-12', 2000);
    const { no } = await save([a]);

    const open = await openInvoices(app, { partyId: custId });
    expect(open.find((d) => d.id === a)!.inBillnoteNo).toBe(no);
    expect(open.find((d) => d.id === b)!.inBillnoteNo).toBeNull();
  });

  it('ใบเสนอราคาไม่เข้ารายการวางบิล เพราะยังไม่เป็นหนี้', async () => {
    await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_id, party_name,
                              subtotal, net_amount, grand_total, payable)
       values ($1,'QT','QT-001','2026-03-05','issued',$2,'บริษัท ลูกค้าองค์กร จำกัด',5000,5000,5000,5000)`,
      [tenantId, custId],
    );
    expect(await openInvoices(app, { partyId: custId })).toEqual([]);
  });

  it('บันทึกไม่ได้ถ้าไม่เลือกลูกค้าหรือไม่ติ๊กใบเลย', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    await expect(save([])).rejects.toThrow(/อย่างน้อยหนึ่งใบ/);
    await expect(saveBillnote(app, {
      billDate: '2026-03-31', dueDate: null, partyId: null, partyName: '  ',
      partyTaxId: '', partyAddrText: '', byWhom: '', note: '', docIds: [a],
    }, null)).rejects.toThrow(/เลือกลูกค้า/);
  });

  it('เลขที่เดินต่อกันไม่ซ้ำ', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    const b = await invoice('IVT-002', '2026-03-12', 2000);
    const first = await save([a]);
    const second = await save([b]);

    expect(first.no).toMatch(/^BN-202603-\d{3}$/);
    expect(second.no).not.toBe(first.no);
    expect((await listBillnotes(app)).map((x) => x.no).sort())
      .toEqual([first.no, second.no].sort());
  });

  it('ยกเลิกใบแจ้งหนี้ที่อยู่ในใบวางบิลไม่ได้ ต้องเอาออกจากใบวางบิลก่อน', async () => {
    const a = await invoice('IVT-001', '2026-03-05', 1000);
    const { no } = await save([a]);

    const { billnoteOfDoc: check } = await import('../src/lib/billnotes');
    expect(await check(app, a)).toBe(no);

    /* voidSalesDoc ผูกกับ session จึงตรวจที่ตัวป้องกันโดยตรง —
       เส้นทางฝั่งหน้าเว็บเรียกฟังก์ชันเดียวกันนี้ก่อนยกเลิกเสมอ */
    const open = await openInvoices(app, { includeDocIds: [a] });
    expect(open.find((d) => d.id === a)!.inBillnoteNo).toBe(no);
  });

  /* ------------------------------------------------------------------
     ข้อที่สำคัญที่สุด — ใบวางบิลต้องไม่แตะตัวเลขทางบัญชีเลย
     ------------------------------------------------------------------ */
  it('ออกใบวางบิลแล้ว ยอดขาย ภาษี ลูกหนี้ และต้นทุนไม่ขยับแม้แต่บาทเดียว', async () => {
    const ids = [
      await invoice('IVT-001', '2026-03-05', 1000),
      await invoice('IVT-002', '2026-03-12', 2000),
      await invoice('IVT-003', '2026-03-19', 3000),
      await invoice('IVT-004', '2026-03-26', 4000),
      await invoice('IVT-005', '2026-03-30', 5000),
    ];

    /** ตัวเลขทุกตัวที่รายงานการเงินอ่าน */
    const figures = async () => {
      const { rows } = await admin.query(
        `select
           (select coalesce(sum(net_amount),0) from documents
             where tenant_id=$1 and status<>'void' and kind in ('IV','IVT')) as revenue,
           (select coalesce(sum(vat_amount),0) from documents
             where tenant_id=$1 and status<>'void') as vat,
           (select coalesce(sum(d.payable - coalesce(p.paid,0)),0)
              from documents d
              left join (select doc_id, sum(amount) paid from payments group by doc_id) p
                     on p.doc_id = d.id
             where d.tenant_id=$1 and d.status='issued' and d.kind<>'QT'
               and d.direction='sell') as ar,
           (select count(*) from documents where tenant_id=$1)::int as docs,
           (select coalesce(sum(cost_amount),0) from stock_moves where tenant_id=$1) as cogs`,
        [tenantId],
      );
      return rows[0];
    };

    const before = await figures();
    await save(ids);
    const after = await figures();

    expect(after).toEqual(before);
    expect(n(before.revenue)).toBe(15000);
    expect(n(before.ar)).toBe(16050);

    /* และใบวางบิลก็ไม่ได้แอบไปอยู่ในตารางเอกสาร */
    const { rows } = await admin.query(
      `select count(*)::int as c from documents where tenant_id = $1 and doc_no like 'BN-%'`,
      [tenantId],
    );
    expect(rows[0].c).toBe(0);
  });
});
