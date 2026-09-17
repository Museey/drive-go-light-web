/**
 * ใบที่บันทึกล่าสุดอยู่บนสุด (ผู้ใช้กำหนด 17 ก.ย. 2569) — ทุกประวัติเอกสาร · เจ้าหนี้ · ลูกหนี้
 *
 * เดิมเรียงตามวันที่บนเอกสาร (เจ้าหนี้/ลูกหนี้เรียงครบกำหนดก่อน) ใบที่ออกย้อนวันที่จึงไปอยู่กลางหรือล่าง
 * ผู้ใช้ทดลองซื้อสินค้าแล้วหาใบที่เพิ่งบันทึกไม่เจอ
 *
 * ชุดข้อมูลเดียวกันทุกตาราง:
 *   B  บันทึกล่าสุด แต่วันที่ย้อนหลังสุด       → ต้องอยู่บนสุด
 *   C  บันทึกก่อน B หนึ่งชั่วโมง
 *   A  บันทึกก่อน B สองชั่วโมง
 *   D E F  บันทึกพร้อมกัน (นำเข้า/กู้คืนจากไฟล์สำรองทั้งชุด) → วันที่ใหม่ก่อน · วันเดียวกันเลขที่มากก่อน
 *   ลำดับที่ถูก: B C A F E D
 *
 * ประวัติรายรับ · รายจ่าย · หน้าลูกค้า เป็นฟังก์ชันที่ผูก session — ตรวจใน e2e/newest-first.spec.ts
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';
import { listBillnotes } from '../src/lib/billnotes';
import { listClaims } from '../src/lib/claims';
import { listCounts } from '../src/lib/stock-counts';
import { salesDocsWith } from '../src/lib/home-report';
import { payablesWith, receivablesWith } from '../src/lib/ar-ap';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

const EXPECTED = ['B', 'C', 'A', 'F', 'E', 'D'];
/** [ชื่อ, วันที่บนเอกสาร, บันทึกเมื่อ (นาทีก่อนตอนนี้)] */
const SET: [string, string, number][] = [
  ['A', '2026-09-10', 120],
  ['B', '2026-09-01', 0],
  ['C', '2026-09-15', 60],
  ['D', '2026-08-01', 300],
  ['E', '2026-08-05', 300],
  ['F', '2026-08-05', 300],
];

describe.skipIf(!DB_URL)('ใบที่บันทึกล่าสุดอยู่บนสุด', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  /** เวลาอ้างอิงเดียวกันทั้งชุด — D E F ต้องได้ created_at เท่ากันจริง ไม่ใช่ต่างกันระดับไมโครวินาที */
  let base: string;

  const at = (minutesAgo: number) => `(${app.escapeLiteral(base)}::timestamptz - interval '${minutesAgo} minutes')`;
  const tail = (s: string) => s.slice(-1);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่ทดสอบลำดับ') returning id`)).rows[0].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
    base = (await app.query(`select now()::text as t`)).rows[0].t;
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    for (const t of ['payments', 'documents', 'billnotes', 'claims', 'stock_counts']) await app.query(`delete from ${t}`);
  });

  /** เอกสารขาย/ซื้อชุด A–F — ครบกำหนดสวนทางกับลำดับที่บันทึก (A ครบก่อนสุด B ครบหลังสุด) */
  const addDocs = async (kind: string, prefix: string) => {
    for (const [name, date, ago] of SET) {
      const due = name === 'B' ? '2027-01-01' : name === 'A' ? '2026-01-01' : date;
      await app.query(
        `insert into documents (tenant_id, kind, doc_no, doc_date, due_date, status, party_name, vat_mode,
                                subtotal, net_amount, grand_total, payable, created_at)
         values (current_tenant_id(), $1, $2, $3, $4, 'issued', 'ทดสอบ', $5, 100, 100, 100, 100, ${at(ago)})`,
        [kind, `${prefix}-${name}`, date, due, kind === 'IV' ? 'none' : 'ex']);
    }
  };

  it('เอกสารขายรายใบ (หน้ายอดขาย)', async () => {
    await addDocs('IVT', 'IVT');
    const { rows } = await salesDocsWith(app, { pageSize: 50 });
    expect(rows.map((r) => tail(r.docNo))).toEqual(EXPECTED);
  });

  it('ลูกหนี้ — ใบล่าสุดบน ไม่ใช่ครบกำหนดก่อน', async () => {
    await addDocs('IV', 'IV');
    const { rows } = await receivablesWith(app);
    expect(rows.map((r) => tail(r.docNo))).toEqual(EXPECTED);
  });

  it('เจ้าหนี้ — ใบเครดิตที่เพิ่งบันทึกอยู่บนสุด ไม่ใช่ล่างสุด', async () => {
    await addDocs('PO', 'PO');
    const { rows } = await payablesWith(app);
    expect(rows.map((r) => tail(r.docNo))).toEqual(EXPECTED);
  });

  it('เจ้าหนี้เฉพาะเกินกำหนด — ใช้ลำดับเดียวกัน', async () => {
    await addDocs('PO', 'PO');
    await app.query(`update documents set due_date = '2026-01-01'`);
    const { rows } = await payablesWith(app, { onlyOverdue: true });
    expect(rows.map((r) => tail(r.docNo))).toEqual(EXPECTED);
  });

  it('ใบวางบิล', async () => {
    for (const [name, date, ago] of SET) {
      await app.query(
        `insert into billnotes (tenant_id, no, bill_date, party_name, created_at)
         values (current_tenant_id(), $1, $2, 'ทดสอบ', ${at(ago)})`, [`BN-${name}`, date]);
    }
    const { rows } = await listBillnotes(app, { pageSize: 50 });
    expect(rows.map((r) => tail(r.no))).toEqual(EXPECTED);
  });

  it('ใบเคลมสินค้า', async () => {
    for (const [name, date, ago] of SET) {
      await app.query(
        `insert into claims (tenant_id, no, side, kind, reason, party_name, claim_date, created_at)
         values (current_tenant_id(), $1, 'customer', 'warranty', 'ทดสอบ', 'ทดสอบ', $2, ${at(ago)})`,
        [`CL-${name}`, date]);
    }
    const { rows } = await listClaims(app, { side: 'customer' });
    expect(rows.map((r) => tail(r.no))).toEqual(EXPECTED);
  });

  it('ใบตรวจนับสต๊อก', async () => {
    for (const [name, date, ago] of SET) {
      await app.query(
        `insert into stock_counts (tenant_id, no, count_date, created_at)
         values (current_tenant_id(), $1, $2, ${at(ago)})`, [`CT-${name}`, date]);
    }
    const { rows } = await listCounts(app, {});
    expect(rows.map((r) => tail(r.no))).toEqual(EXPECTED);
  });
});
