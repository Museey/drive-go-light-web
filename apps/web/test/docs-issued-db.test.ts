/**
 * การ์ด "เอกสารที่ออก" ของหน้าแรก — ตัวเลขต่อชนิดเอกสาร (24 พ.ย. 2569)
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DOC_GROUPS, docsIssuedWith, isDocGroup } from '../src/lib/docs-issued';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('เอกสารที่ออก', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;

  const doc = async (kind: string, no: string, date: string, payable: number,
                     o: { status?: string; parent?: string | null; due?: string | null; paid?: number } = {}) => {
    const { rows } = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name, vat_mode,
                              subtotal, net_amount, grand_total, payable, parent_doc_id, due_date, expense_cat,
                              voided_at)
       values ($1,$2::doc_kind,$3,$4,$5::doc_status,'คู่ค้า','none',$6,$6,$6,$6,$7,$8,
               case when $2::text = 'EX' then 'other'::expense_cat end,
               case when $5::text = 'void' then now() end)
       returning id`,
      [tenantId, kind, no, date, o.status ?? 'issued', payable, o.parent ?? null, o.due ?? null]);
    if (o.paid) {
      await admin.query(
        `insert into payments (tenant_id, doc_id, method, amount, paid_on) values ($1,$2,'เงินสด',$3,$4)`,
        [tenantId, rows[0].id, o.paid, date]);
    }
    return rows[0].id as string;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`do $$ begin
      if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
    end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8')
      .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่เอกสารที่ออก') returning id`)).rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

    /* ใบเสนอราคา: รอ 1 · ออกใบต่อแล้ว 1 · ยกเลิก 1 · นอกช่วง 1 */
    await doc('QT', 'QT-1', '2026-03-05', 1000);
    const qt2 = await doc('QT', 'QT-2', '2026-03-06', 2000, { status: 'billed' });
    await doc('QT', 'QT-3', '2026-03-07', 4000, { status: 'void' });
    await doc('QT', 'QT-0', '2026-01-15', 9000);

    /* ใบส่งมอบ: จ่ายครบผ่านใบเสร็จ 1 · ค้างและเกินกำหนด 1 */
    const iv = await doc('IV', 'IV-1', '2026-03-08', 2000, { parent: qt2 });
    await doc('IV', 'IV-2', '2026-03-09', 3000, { due: '2026-03-10', paid: 500 });

    /* ใบเสร็จ: ต่อจากใบส่งมอบ (รับครบ) 1 · ขายหน้าร้าน 2 (ใบหนึ่งยังไม่รับเงิน) */
    await doc('RC', 'RC-1', '2026-03-08', 2000, { parent: iv, paid: 2000 });
    await doc('RC', 'RC-2', '2026-03-10', 700, { paid: 700 });
    await doc('RC', 'RC-3', '2026-03-11', 300);

    await doc('PO', 'PO-1', '2026-03-12', 5000, { paid: 5000 });
    await doc('PO', 'PO-2', '2026-03-13', 1500, { due: '2099-01-01' });
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  const row = (r: Awaited<ReturnType<typeof docsIssuedWith>>, key: string) => r.rows.find((x) => x.key === key)!;
  const march = ['2026-03-01', '2026-03-31'] as const;

  it('ใบเสนอราคา — แยกรอลูกค้าตอบรับ ออกใบต่อแล้ว และยกเลิก · ยอดรวมไม่นับใบที่ยกเลิก', async () => {
    const r = await docsIssuedWith(app, 'QT', ...march);
    expect(r.total).toEqual({ count: 2, amount: 3000 });
    expect(row(r, 'wait')).toMatchObject({ count: 1, amount: 1000 });
    expect(row(r, 'next')).toMatchObject({ count: 1, amount: 2000 });
    expect(row(r, 'void')).toMatchObject({ count: 1, amount: 4000 });
  });

  it('ไม่ใส่ช่วงวันที่ = ทุกใบ · ใส่ช่วงแล้วใบนอกช่วงไม่ถูกนับ', async () => {
    expect((await docsIssuedWith(app, 'QT')).total.count).toBe(3);
    expect((await docsIssuedWith(app, 'QT', '2026-01-01', '2026-01-31')).total).toEqual({ count: 1, amount: 9000 });
  });

  it('ใบส่งมอบ — เงินที่รับผ่านใบเสร็จนับว่าใบส่งมอบจ่ายครบ · ยอดค้างเป็นยอดที่เหลือจริง', async () => {
    const r = await docsIssuedWith(app, 'IV', ...march);
    expect(r.total).toEqual({ count: 2, amount: 5000 });
    expect(row(r, 'paid')).toMatchObject({ count: 1, amount: 2000 });
    expect(row(r, 'open')).toMatchObject({ count: 1, amount: 2500 });
    expect(row(r, 'late')).toMatchObject({ count: 1, amount: 2500, partOf: true });
  });

  it('ใบเสร็จ — แยกขายหน้าร้านกับงานที่มีใบต้นทาง', async () => {
    const r = await docsIssuedWith(app, 'RC', ...march);
    expect(r.total).toEqual({ count: 3, amount: 3000 });
    expect(row(r, 'walkin')).toMatchObject({ count: 2, amount: 1000 });
    expect(row(r, 'job')).toMatchObject({ count: 1, amount: 2000 });
    expect(row(r, 'open')).toMatchObject({ count: 1, amount: 300 });
  });

  it('ใบซื้อ — จ่ายครบกับค้างจ่าย · ยังไม่ถึงกำหนดไม่นับว่าเกิน', async () => {
    const r = await docsIssuedWith(app, 'PO', ...march);
    expect(row(r, 'paid')).toMatchObject({ count: 1, amount: 5000 });
    expect(row(r, 'open')).toMatchObject({ count: 1, amount: 1500 });
    expect(row(r, 'late').count).toBe(0);
  });

  it('ชนิดที่ไม่มีเอกสารเลยได้ศูนย์ ไม่พัง — ทุกชนิดในรายการเรียกได้', async () => {
    for (const g of DOC_GROUPS) {
      const r = await docsIssuedWith(app, g.key, '2020-01-01', '2020-01-31');
      expect(r.total).toEqual({ count: 0, amount: 0 });
    }
    expect(isDocGroup('QT')).toBe(true);
    expect(isDocGroup('XX')).toBe(false);
  });
});
