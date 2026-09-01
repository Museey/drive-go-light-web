/**
 * ส่งออกแล้วนำกลับเข้าใหม่ ยอดต้องเท่าเดิมทุกบาท
 *
 * ไฟล์สำรองคือสัญญาที่ให้ไว้กับลูกค้าว่าข้อมูลเป็นของเขา ไม่ใช่ของเรา
 * ถ้าส่งออกแล้วนำกลับเข้าไม่ได้ หรือได้ตัวเลขไม่ตรง สัญญานั้นก็ไม่มีความหมาย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { importBackup } from '@drivegolight/importer';
import { exportBackupWith } from '../src/lib/backup';
import { openInvoices, saveBillnote } from '../src/lib/billnotes';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const n = (v: unknown) => Number(v);

describe.skipIf(!DB_URL)('ส่งออกแล้วนำกลับเข้า', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let firstTenant: string;
  let secondTenant: string;
  let billnoteTotal = 0;
  let billnoteDocNos: string[] = [];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(ROOT, 'db/002_auth.sql'), 'utf8'));
    await admin.query(`
      -- role อยู่ระดับคลัสเตอร์ จึงค้างข้ามการรันเทสต์และอาจถูกใช้โดยฐานข้อมูลอื่นอยู่
      -- ล้างเฉพาะสิทธิ์ในฐานข้อมูลนี้ แล้วให้ app-role.sql สร้างกลับ (รันซ้ำได้)
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

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    /* อู่แรก: นำเข้าจากไฟล์ชุดทดสอบ */
    const fixture = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/demo-backup.json'), 'utf8'));
    const first = await importBackup(app, fixture, { openingStockDate: '2026-08-28' });
    firstTenant = first.tenantId;

    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);

    /* วางบิลลูกค้าที่ค้างมากที่สุดไว้หนึ่งใบ ไฟล์สำรองจะได้มีใบวางบิลให้พิสูจน์ */
    const open = await openInvoices(app);
    const topParty = open[0]!.partyId ?? null;
    const picked = open
      .filter((v) => (v.partyId ?? null) === topParty)
      .slice(0, 4);
    billnoteTotal = Math.round(picked.reduce((t, v) => t + v.outstanding, 0) * 100) / 100;
    billnoteDocNos = picked.map((v) => v.docNo).sort();
    await saveBillnote(app, {
      billDate: '2026-08-28', dueDate: '2026-09-15',
      partyId: topParty, partyName: picked[0]!.partyName,
      partyTaxId: '', partyAddrText: '', byWhom: 'สมชาย', note: '',
      docIds: picked.map((v) => v.id),
    }, null);

    /* ส่งออกจากอู่แรก แล้วนำเข้าเป็นอู่ที่สอง */
    const exported = await exportBackupWith(app);

    const second = await importBackup(app, exported as never, { openingStockDate: '2026-08-28' });
    secondTenant = second.tenantId;
  }, 180_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  /** ยอดสรุปของอู่หนึ่งราย อ่านด้วยสิทธิ์ผู้ดูแลเพื่อข้าม RLS ในการเทียบ */
  async function summary(tenantId: string) {
    const { rows } = await admin.query(
      `select
         (select count(*) from products where tenant_id = $1)::int as products,
         (select count(*) from contacts where tenant_id = $1)::int as contacts,
         (select count(*) from vehicles where tenant_id = $1)::int as vehicles,
         (select count(*) from documents where tenant_id = $1)::int as documents,
         (select count(*) from doc_items where tenant_id = $1)::int as items,
         (select count(*) from payments where tenant_id = $1)::int as payments,
         (select coalesce(sum(grand_total), 0) from documents
           where tenant_id = $1 and direction = 'sell' and kind <> 'QT') as sell_total,
         (select coalesce(sum(wht_amount), 0) from documents
           where tenant_id = $1 and direction = 'sell') as sell_wht,
         (select coalesce(sum(payable), 0) from documents
           where tenant_id = $1 and direction = 'buy') as buy_total,
         (select coalesce(sum(amount), 0) from payments where tenant_id = $1) as paid,
         (select coalesce(sum(qty_delta), 0) from stock_moves where tenant_id = $1) as stock`,
      [tenantId],
    );
    return rows[0];
  }

  it('จำนวนแถวเท่ากันทุกตาราง', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);

    expect(b.products).toBe(a.products);
    expect(b.contacts).toBe(a.contacts);
    expect(b.vehicles).toBe(a.vehicles);
    expect(b.documents).toBe(a.documents);
    expect(b.items).toBe(a.items);
    expect(b.payments).toBe(a.payments);
    expect(a.documents).toBeGreaterThan(700);
  });

  it('ยอดเงินเท่ากันทุกบาท', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);

    expect(n(b.sell_total)).toBe(n(a.sell_total));
    expect(n(b.sell_wht)).toBe(n(a.sell_wht));
    expect(n(b.buy_total)).toBe(n(a.buy_total));
    expect(n(b.paid)).toBe(n(a.paid));
    expect(n(a.sell_total)).toBeGreaterThan(0);
  });

  it('ยอดสต๊อกรวมเท่ากัน', async () => {
    const a = await summary(firstTenant);
    const b = await summary(secondTenant);
    expect(n(b.stock)).toBe(n(a.stock));
  });

  it('สายเอกสารยังผูกครบเหมือนเดิม', async () => {
    const count = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select count(*)::int as c from documents d
         join documents p on p.id = d.parent_doc_id
         where d.tenant_id = $1`,
        [tenantId],
      );
      return rows[0].c;
    };
    const a = await count(firstTenant);
    expect(await count(secondTenant)).toBe(a);
    expect(a).toBeGreaterThan(40);
  });

  it('เลขที่เอกสารชุดเดิมถูกยกมาด้วย ออกใบใหม่แล้วไม่ซ้ำของเก่า', async () => {
    const seqs = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select kind::text as kind, last_no from doc_sequences where tenant_id = $1 order by kind`,
        [tenantId],
      );
      return Object.fromEntries(rows.map((r) => [r.kind, n(r.last_no)]));
    };
    expect(await seqs(secondTenant)).toEqual(await seqs(firstTenant));
  });

  /**
   * ใบวางบิลถูกถอดออกจากรายการ "ยังรองรับไม่ได้" แล้ว แปลว่าตัวนำเข้าต้องรับได้จริง
   * ถ้ารับไม่ได้ อู่ที่ย้ายเข้ามาจะเสียใบวางบิลไปเงียบ ๆ โดยไม่มีคำเตือนใด ๆ
   */
  it('ใบวางบิลตามมาครบ ทั้งยอดที่แจ้งและใบที่รวมไว้', async () => {
    const read = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select b.no, b.bill_date::text as bill_date, b.due_date::text as due_date,
                b.by_whom, b.total_snapshot,
                (select array_agg(d.doc_no order by d.doc_no)
                   from billnote_docs bd join documents d on d.id = bd.doc_id
                  where bd.billnote_id = b.id) as docs
         from billnotes b where b.tenant_id = $1 order by b.no`,
        [tenantId],
      );
      return rows;
    };

    const a = await read(firstTenant);
    const b = await read(secondTenant);

    expect(a).toHaveLength(1);
    expect(n(a[0].total_snapshot)).toBe(billnoteTotal);
    expect(a[0].docs.slice().sort()).toEqual(billnoteDocNos);

    expect(b).toHaveLength(1);
    expect(b[0].no).toBe(a[0].no);
    expect(b[0].bill_date).toBe(a[0].bill_date);
    expect(b[0].due_date).toBe(a[0].due_date);
    expect(b[0].by_whom).toBe(a[0].by_whom);
    expect(n(b[0].total_snapshot)).toBe(n(a[0].total_snapshot));
    expect(b[0].docs.slice().sort()).toEqual(billnoteDocNos);
  });

  it('ตัวนับเลขที่ใบวางบิลตามมาด้วย ออกใบใหม่แล้วไม่ซ้ำของเก่า', async () => {
    const last = async (tenantId: string) => {
      const { rows } = await admin.query(
        `select last_no from billnote_sequences where tenant_id = $1`, [tenantId],
      );
      return rows[0] ? n(rows[0].last_no) : null;
    };
    expect(await last(secondTenant)).toBe(await last(firstTenant));
    expect(await last(firstTenant)).toBeGreaterThan(0);
  });

  it('ไฟล์สำรองไม่มีรหัสผ่านติดไปด้วย', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app);
    const text = JSON.stringify(exported);

    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('passwordHash');
  });

  it('ไฟล์ที่ส่งออกผ่านการตรวจของตัวนำเข้าเอง', async () => {
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
    const exported = await exportBackupWith(app);

    const { validateBackup } = await import('@drivegolight/importer');
    expect(validateBackup(exported)).toEqual([]);
  });
});
