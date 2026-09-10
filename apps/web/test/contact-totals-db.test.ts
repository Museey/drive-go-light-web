/**
 * ยอดสะสมและยอดคงค้างต่อผู้ติดต่อ
 *
 * ข้อที่พลาดง่ายที่สุดคือ **นับใบเสร็จที่ออกต่อจากใบส่งมอบซ้ำ** ซึ่งทำให้ยอดสะสม
 * ของลูกค้าเป็นสองเท่าโดยที่ตัวเลขยังดูสมเหตุสมผล ไม่มีอะไรบนหน้าจอบอกว่าผิด
 * เป็นความผิดพลาดชนิดเดียวกับที่เพิ่งเจอในช่วงที่ 8
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { contactTotalsWith } from '../src/lib/contact-totals';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('ยอดสะสมและคงค้างของผู้ติดต่อ', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let otherTenant: string;

  const contact = async (code: string, kind = 'customer'): Promise<string> => {
    const { rows } = await app.query(
      `insert into contacts (tenant_id, kind, code, first_name)
       values (current_tenant_id(), $1, $2, $3) returning id`, [kind, code, code]);
    return rows[0].id;
  };

  const doc = async (opts: {
    kind: string; no: string; party: string | null; payable: number;
    parent?: string | null; status?: string;
  }): Promise<string> => {
    const { rows } = await app.query(
      /* direction เป็นคอลัมน์ที่ฐานคำนวณเองจาก kind — ใส่เองไม่ได้ */
      `insert into documents
         (tenant_id, kind, doc_no, doc_date, party_id, parent_doc_id, vat_mode, payable,
          status, voided_at)
       values (current_tenant_id(), $1, $2, current_date, $3, $4, $5, $6, $7::doc_status,
               case when $7::text = 'void' then now() else null end)
       returning id`,
      [opts.kind, opts.no, opts.party, opts.parent ?? null,
       opts.kind === 'IV' ? 'none' : 'ex', opts.payable, opts.status ?? 'issued']);
    return rows[0].id;
  };

  const pay = (docId: string, amount: number) => app.query(
    `insert into payments (tenant_id, doc_id, paid_on, amount)
     values (current_tenant_id(), $1, current_date, $2)`, [docId, amount]);

  const totals = async (id: string) =>
    (await contactTotalsWith(app)).get(id) ?? { spent: 0, owe: 0 };

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
      `insert into tenants (name) values ('อู่ยอดสะสม'), ('อู่ข้างบ้าน') returning id`);
    tenantId = t.rows[0].id;
    otherTenant = t.rows[1].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  beforeEach(async () => {
    for (const t of [otherTenant, tenantId]) {
      await app.query(`select set_config('app.tenant_id', $1, false)`, [t]);
      await app.query('delete from payments');
      await app.query('delete from documents');
      await app.query('delete from contacts');
    }
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  });

  it('ไม่มีเอกสารเลย — ไม่มีชื่ออยู่ในผลลัพธ์', async () => {
    const k = await contact('C1');
    expect((await contactTotalsWith(app)).has(k)).toBe(false);
  });

  it('ใบส่งมอบใบเดียว ยังไม่จ่าย — ยอดสะสมและคงค้างเท่ากัน', async () => {
    const k = await contact('C1');
    await doc({ kind: 'IVT', no: 'IVT-001', party: k, payable: 1000 });
    expect(await totals(k)).toEqual({ spent: 1000, owe: 1000 });
  });

  it('จ่ายบางส่วน — คงค้างลด ยอดสะสมเท่าเดิม', async () => {
    const k = await contact('C1');
    const d = await doc({ kind: 'IVT', no: 'IVT-001', party: k, payable: 1000 });
    await pay(d, 400);
    expect(await totals(k)).toEqual({ spent: 1000, owe: 600 });
  });

  /* 6.4 ใช้ max(0, …) — ใบที่รับเงินเกินต้องไม่ไปหักยอดค้างของใบอื่น */
  it('จ่ายเกิน — คงค้างเป็นศูนย์ ไม่ติดลบ และไม่ไปหักใบอื่น', async () => {
    const k = await contact('C1');
    const a = await doc({ kind: 'IVT', no: 'IVT-001', party: k, payable: 1000 });
    await pay(a, 1500);
    await doc({ kind: 'IVT', no: 'IVT-002', party: k, payable: 800 });
    expect(await totals(k)).toEqual({ spent: 1800, owe: 800 });
  });

  /*
   * ข้อสำคัญที่สุดของไฟล์นี้ — สายที่แอปสร้างจริงคือ ใบเสนอราคา → ใบส่งมอบ → ใบเสร็จ
   * ถ้านับทั้งใบส่งมอบและใบเสร็จ ยอดสะสมจะเป็นสองเท่าของงานที่ทำจริง
   */
  it('ใบเสร็จที่ออกต่อจากใบส่งมอบ ไม่ถูกนับซ้ำ', async () => {
    const k = await contact('C1');
    const qt = await doc({ kind: 'QT', no: 'QT-001', party: k, payable: 1000 });
    const ivt = await doc({ kind: 'IVT', no: 'IVT-001', party: k, payable: 1000, parent: qt });
    const rc = await doc({ kind: 'RC', no: 'RC-001', party: k, payable: 1000, parent: ivt });
    await pay(rc, 1000);

    /* นับเฉพาะใบส่งมอบ 1,000 — ไม่ใช่ 2,000 */
    expect((await totals(k)).spent).toBe(1000);
  });

  it('ใบเสร็จที่ออกต่อจากใบเสนอราคาโดยตรง ถูกนับ (อู่ที่ไม่ออกใบส่งมอบ)', async () => {
    const k = await contact('C1');
    const qt = await doc({ kind: 'QT', no: 'QT-001', party: k, payable: 900 });
    await doc({ kind: 'RC', no: 'RC-001', party: k, payable: 900, parent: qt });
    expect((await totals(k)).spent).toBe(900);
  });

  it('ใบเสนอราคาไม่ถูกนับเป็นยอดสะสม — ยังไม่ได้ขายจริง', async () => {
    const k = await contact('C1');
    await doc({ kind: 'QT', no: 'QT-001', party: k, payable: 5000 });
    expect((await contactTotalsWith(app)).has(k)).toBe(false);
  });

  it('เอกสารที่ถูกยกเลิกไม่ถูกนับ', async () => {
    const k = await contact('C1');
    await doc({ kind: 'IVT', no: 'IVT-001', party: k, payable: 1000, status: 'void' });
    expect((await contactTotalsWith(app)).has(k)).toBe(false);
  });

  it('ผู้ติดต่อที่เป็นทั้งลูกค้าและผู้ขาย ได้ยอดสองฝั่งรวมกัน', async () => {
    const k = await contact('C1');
    await doc({ kind: 'IVT', no: 'IVT-001', party: k, payable: 1000 });
    await doc({ kind: 'PO', no: 'PO-001', party: k, payable: 700 });
    expect(await totals(k)).toEqual({ spent: 1700, owe: 1700 });
  });

  it('ค่าใช้จ่ายทั่วไปไม่ถูกนับเข้ายอดผู้ขาย ตามที่ 6.4 ทำ', async () => {
    const k = await contact('V1', 'vendor');
    await doc({ kind: 'PO', no: 'PO-001', party: k, payable: 700 });
    expect((await totals(k)).spent).toBe(700);
  });

  it('แยกยอดของผู้ติดต่อแต่ละราย ไม่ปนกัน', async () => {
    const a = await contact('C1');
    const b = await contact('C2');
    await doc({ kind: 'IVT', no: 'IVT-001', party: a, payable: 1000 });
    await doc({ kind: 'IVT', no: 'IVT-002', party: b, payable: 250 });

    const m = await contactTotalsWith(app);
    expect(m.get(a)?.spent).toBe(1000);
    expect(m.get(b)?.spent).toBe(250);
  });

  it('เอกสารของอู่อื่นไม่เข้ามาปนในยอดของเรา', async () => {
    const k = await contact('C1');
    await doc({ kind: 'IVT', no: 'IVT-001', party: k, payable: 1000 });

    await app.query(`select set_config('app.tenant_id', $1, false)`, [otherTenant]);
    const m = await contactTotalsWith(app);
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

    expect(m.has(k)).toBe(false);
  });
});
