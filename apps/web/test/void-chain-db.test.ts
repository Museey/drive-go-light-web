/**
 * ยกเลิกทั้งสายเอกสาร (ผู้ใช้กำหนด 19 ก.ย. 2569 — "ลูกค้ายกเลิกงาน ใบที่เกี่ยวข้องต้องขึ้นยกเลิกด้วย")
 *
 * กติกาเดิม 17 ก.ย. ยังอยู่: ยกเลิกใบเดียวได้และใบต้นสายไม่หาย — ผู้ใช้เลือกในแผงยืนยันว่าจะเอาแบบไหน
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { docChainWith, voidSalesChainWith } from '../src/lib/sales-void';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ยกเลิกทั้งสายเอกสาร', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
      .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่ยกเลิกสาย') returning id`)).rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    for (const t of ['billnote_docs', 'billnotes', 'payments', 'stock_moves', 'doc_items', 'documents']) {
      await admin.query(`delete from ${t} where tenant_id = $1`, [tenantId]);
    }
  });

  /** สายเอกสาร A→B→C: ใบเสนอราคา → ใบส่งมอบ → ใบเสร็จ */
  async function chain(): Promise<{ qt: string; ivt: string; rc: string }> {
    const mk = async (kind: string, no: string, parent: string | null, status = 'issued') => {
      const vat = kind === 'IVT' || kind === 'RC' ? 70 : 0;
      const { rows } = await admin.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name, vat_mode, vat_rate,
                                subtotal, net_amount, vat_amount, grand_total, payable, parent_doc_id)
         values ($1,$2,$3,current_date,$4,'ลูกค้ายกเลิกงาน',
                 (case when $5::numeric > 0 then 'ex' else 'none' end)::vat_mode,
                 case when $5::numeric > 0 then 7 else 0 end,
                 1000,1000,$5,1000+$5,1000+$5,$6)
         returning id`,
        [tenantId, kind, no, status, vat, parent]);
      return rows[0].id as string;
    };
    const qt = await mk('QT', 'QT-CHAIN-1', null, 'billed');
    const ivt = await mk('IVT', 'IVT-CHAIN-1', qt);
    const rc = await mk('RC', 'RC-CHAIN-1', ivt);
    return { qt, ivt, rc };
  }

  const statusOf = async (id: string) =>
    (await admin.query(`select status::text as s from documents where id = $1`, [id])).rows[0].s;

  it('สายเอกสารของใบเสร็จ = ใบส่งมอบต้นทาง + ใบเสนอราคาต้นสาย', async () => {
    const { qt, ivt, rc } = await chain();
    const info = await docChainWith(app, rc);

    expect(info.self.docNo).toBe('RC-CHAIN-1');
    expect(info.related.map((d) => d.docNo).sort()).toEqual(['IVT-CHAIN-1', 'QT-CHAIN-1']);
    expect(info.related.map((d) => d.id).sort()).toEqual([ivt, qt].sort());
    expect(info.blocked).toEqual([]);
  });

  it('ใบที่ไม่มีสาย ไม่มีใบเกี่ยวข้อง — ไม่ต้องขึ้นให้เลือก', async () => {
    const { rows } = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name, vat_mode,
                              subtotal, net_amount, grand_total, payable)
       values ($1,'RC','RC-SOLO-1',current_date,'issued','ขาจร','none',500,500,500,500) returning id`, [tenantId]);
    const info = await docChainWith(app, rows[0].id);
    expect(info.related).toEqual([]);
  });

  it('ยกเลิกทั้งสาย — ทุกใบเป็นยกเลิก ไม่เหลือใบไหนใช้งานอยู่', async () => {
    const { qt, ivt, rc } = await chain();
    await voidSalesChainWith(app, [rc, ivt, qt], 'ลูกค้ายกเลิกงาน', null);

    expect(await statusOf(rc)).toBe('void');
    expect(await statusOf(ivt)).toBe('void');
    expect(await statusOf(qt)).toBe('void');

    const { rows } = await admin.query(
      `select count(*)::int as n from documents where tenant_id=$1 and status <> 'void'`, [tenantId]);
    expect(rows[0].n).toBe(0);
  });

  it('ยกเลิกเฉพาะใบเดียว — ใบต้นสายยังอยู่ตามกติกาเดิม (17 ก.ย. 2569)', async () => {
    const { qt, ivt, rc } = await chain();
    await voidSalesChainWith(app, [rc], 'ออกผิดใบ', null);

    expect(await statusOf(rc)).toBe('void');
    expect(await statusOf(ivt)).toBe('issued');
    /* ใบเสนอราคากลับเป็นค้างส่งมอบเมื่อไม่เหลือใบต่อ — ที่นี่ยังมีใบส่งมอบอยู่ จึงยังเป็น billed */
    expect(await statusOf(qt)).toBe('billed');
  });

  /* ยกเลิกเฉพาะใบเสร็จกับใบส่งมอบ ใบเสนอราคาต้องกลับขึ้นกระดานงานค้างส่งมอบ
     ไม่ใช่ค้างเป็น "ออกใบต่อแล้ว" ตลอดกาลทั้งที่ไม่มีใบต่อเหลืออยู่ */
  it('ยกเลิกใบเสร็จกับใบส่งมอบ — ใบเสนอราคากลับเป็นค้างส่งมอบ', async () => {
    const { qt, ivt, rc } = await chain();
    await voidSalesChainWith(app, [rc, ivt], 'ลูกค้ายกเลิกงาน', null);

    expect(await statusOf(rc)).toBe('void');
    expect(await statusOf(ivt)).toBe('void');
    expect(await statusOf(qt), 'กลับขึ้นกระดานงานค้าง').toBe('issued');
  });

  /* หน้าเอกสารเรียกตัวหาสายทุกครั้งที่เปิด — ใบที่ยกเลิกไปแล้วต้องยังเปิดดูได้ ไม่ใช่พัง */
  it('ใบที่ยกเลิกไปแล้ว ยังหาสายได้ (หน้าเอกสารต้องเปิดดูได้)', async () => {
    const { rc } = await chain();
    await voidSalesChainWith(app, [rc], 'ออกผิดใบ', null);

    const info = await docChainWith(app, rc);
    expect(info.self.docNo).toBe('RC-CHAIN-1');
    expect(info.related.map((d) => d.docNo).sort(), 'ใบที่ยังไม่ยกเลิกในสายยังขึ้นครบ')
      .toEqual(['IVT-CHAIN-1', 'QT-CHAIN-1']);
  });

  it('เหตุผลที่ยกเลิกติดไปทุกใบในสาย', async () => {
    const { qt, ivt, rc } = await chain();
    await voidSalesChainWith(app, [rc, ivt, qt], 'ลูกค้ายกเลิกงาน', null);
    const { rows } = await admin.query(
      `select distinct voided_reason from documents where tenant_id = $1`, [tenantId]);
    expect(rows.map((r) => r.voided_reason)).toEqual(['ลูกค้ายกเลิกงาน']);
  });

  it('ใบในสายที่ถูกวางบิลแล้ว — บอกว่าติดใบไหน และไม่ยกเลิกอะไรเลย', async () => {
    const { qt, ivt, rc } = await chain();
    const bn = await admin.query(
      `insert into billnotes (tenant_id, no, bill_date, party_name) values ($1,'BN-1',current_date,'ลูกค้า') returning id`,
      [tenantId]);
    await admin.query(`insert into billnote_docs (tenant_id, billnote_id, doc_id) values ($1,$2,$3)`,
      [tenantId, bn.rows[0].id, ivt]);

    const info = await docChainWith(app, rc);
    expect(info.blocked.map((d) => d.docNo), 'ต้องบอกว่าใบส่งมอบติดใบวางบิล').toEqual(['IVT-CHAIN-1']);

    await expect(voidSalesChainWith(app, [rc, ivt, qt], 'ลูกค้ายกเลิก', null))
      .rejects.toThrow(/ใบวางบิล/);
    /* ล้มทั้งชุด — ห้ามยกเลิกไปครึ่งเดียว */
    expect(await statusOf(rc)).toBe('issued');
    expect(await statusOf(ivt)).toBe('issued');
    expect(await statusOf(qt)).toBe('billed');
  });
});
