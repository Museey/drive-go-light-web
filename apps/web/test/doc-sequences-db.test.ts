/**
 * ระบบรันเลขที่เอกสาร — อัตโนมัติ และเริ่มนับใหม่ทุกเดือน
 *
 * เดิมมีแค่เทสต์รูปแบบตัวอักษร (doc-no.test.ts) ไม่มีข้อไหนยืนยันกับฐานข้อมูลจริงว่า
 * เปลี่ยนเดือนแล้วลำดับกลับไป 0001 — ถ้าวันหนึ่งมีคนส่งคีย์เดือนผิด (เช่นส่ง period ว่างแบบของเดิม)
 * เลขจะนับต่อข้ามเดือนโดยที่รูปแบบยังดูถูกทุกอย่าง
 *
 * ใช้ docNoPeriod ตัวเดียวกับที่โค้ดจริงส่งเข้าฟังก์ชันลำดับ ไม่ได้พิมพ์คีย์เอง
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { docNoPeriod, formatDocNo } from '../src/lib/doc-no';
import { freshSchema } from '../../../tools/test-schema.mjs';

const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('เลขที่เอกสารรันอัตโนมัติ เริ่มใหม่ทุกเดือน', () => {
  let admin: pg.Client;
  let shopA: string;
  let shopB: string;

  const nextDoc = async (tenant: string, kind: string, iso: string) =>
    Number((await admin.query(`select next_doc_no($1, $2::doc_kind, $3) as n`, [tenant, kind, docNoPeriod(iso)])).rows[0].n);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบเลขที่ ก'), ('อู่ทดสอบเลขที่ ข') returning id`);
    shopA = t.rows[0].id;
    shopB = t.rows[1].id;
  }, 60_000);

  afterAll(async () => { await admin?.end(); });

  beforeEach(async () => {
    for (const tbl of ['doc_sequences', 'billnote_sequences', 'claim_sequences', 'stock_count_sequences']) {
      await admin.query(`delete from ${tbl} where tenant_id = any($1)`, [[shopA, shopB]]);
    }
  });

  it('ใบเสนอราคาในเดือนเดียวกันนับต่อ 1, 2, 3 แม้วันที่ต่างกัน', async () => {
    const got = [
      await nextDoc(shopA, 'QT', '2026-09-01'),
      await nextDoc(shopA, 'QT', '2026-09-13'),
      await nextDoc(shopA, 'QT', '2026-09-30'),
    ];
    expect(got).toEqual([1, 2, 3]);
    expect(formatDocNo('QT', '2026-09-30', got[2]!)).toBe('QT6909300003');
  });

  it('เปลี่ยนเดือน → เริ่มที่ 0001 ใหม่ · ออกย้อนเดือนก่อนนับต่อจากเลขของเดือนนั้น', async () => {
    for (const d of ['2026-09-05', '2026-09-20', '2026-09-28']) await nextDoc(shopA, 'RC', d);

    const firstOct = await nextDoc(shopA, 'RC', '2026-10-01');
    expect(firstOct).toBe(1);
    expect(formatDocNo('RC', '2026-10-01', firstOct)).toBe('RC6910010001');

    expect(await nextDoc(shopA, 'RC', '2026-09-30')).toBe(4);   /* ย้อนวันที่ของ ก.ย. */
    expect(await nextDoc(shopA, 'RC', '2026-10-02')).toBe(2);
  });

  it('ข้ามปี: ธ.ค. 2569 → ม.ค. 2570 เริ่มใหม่', async () => {
    await nextDoc(shopA, 'IVT', '2026-12-31');
    await nextDoc(shopA, 'IVT', '2026-12-31');
    const jan = await nextDoc(shopA, 'IVT', '2027-01-01');
    expect(jan).toBe(1);
    expect(formatDocNo('IVT', '2027-01-01', jan)).toBe('IVT7001010001');
  });

  it('ชนิดเอกสารนับแยกกัน — QT IVT IV RC PO EX ต่างเริ่มที่ 1 ในเดือนเดียวกัน', async () => {
    await nextDoc(shopA, 'QT', '2026-09-10');
    await nextDoc(shopA, 'QT', '2026-09-10');
    for (const k of ['IVT', 'IV', 'RC', 'PO', 'EX']) {
      expect(await nextDoc(shopA, k, '2026-09-10'), k).toBe(1);
    }
    expect(await nextDoc(shopA, 'QT', '2026-09-10')).toBe(3);
  });

  it('อู่คนละอู่นับแยกกัน', async () => {
    await nextDoc(shopA, 'QT', '2026-09-10');
    await nextDoc(shopA, 'QT', '2026-09-10');
    expect(await nextDoc(shopB, 'QT', '2026-09-10')).toBe(1);
  });

  it('ใบวางบิล · ใบเคลม · ใบตรวจนับ เริ่มใหม่ทุกเดือนเหมือนกัน', async () => {
    const bill = async (iso: string) =>
      Number((await admin.query(`select next_billnote_no($1, $2) as n`, [shopA, docNoPeriod(iso)])).rows[0].n);
    const claim = async (iso: string) =>
      Number((await admin.query(`select next_claim_no($1, 'customer'::claim_side, $2) as n`, [shopA, docNoPeriod(iso)])).rows[0].n);
    const count = async (iso: string) =>
      Number((await admin.query(`select next_count_no($1, $2) as n`, [shopA, docNoPeriod(iso)])).rows[0].n);

    for (const next of [bill, claim, count]) {
      expect([await next('2026-09-03'), await next('2026-09-25')]).toEqual([1, 2]);
      expect(await next('2026-10-01')).toBe(1);
    }
  });

  it('ใบเคลมฝั่งลูกค้ากับฝั่งผู้ขายนับแยกกัน', async () => {
    const claim = async (side: string) =>
      Number((await admin.query(`select next_claim_no($1, $2::claim_side, $3) as n`, [shopA, side, docNoPeriod('2026-09-10')])).rows[0].n);
    await claim('customer');
    await claim('customer');
    expect(await claim('vendor')).toBe(1);
  });
});
