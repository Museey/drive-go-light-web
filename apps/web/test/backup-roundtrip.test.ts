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

    /* ส่งออกจากอู่แรก แล้วนำเข้าเป็นอู่ที่สอง */
    await app.query(`select set_config('app.tenant_id', $1, false)`, [firstTenant]);
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
