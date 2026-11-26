/**
 * แยกรายได้ งานซ่อม / ขายหน้าร้าน · ค่าแรง / ค่าอะไหล่ (24 พ.ย. 2569)
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { salesSplitWith } from '../src/lib/sales-split';
import { freshSchema } from '../../../tools/test-schema.mjs';

pg.types.setTypeParser(1082, (v) => v);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('แยกรายได้', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;

  /** เอกสารขายหนึ่งใบ — net คือมูลค่าก่อนภาษีหลังส่วนลดท้ายบิล · lines = [ราคา, เป็นค่าแรง] */
  const doc = async (kind: string, no: string, date: string, net: number, lines: [number, boolean][],
                     o: { status?: string; parent?: string | null } = {}) => {
    const { rows } = await admin.query(
      `insert into documents (tenant_id, kind, doc_no, doc_date, status, party_name, vat_mode,
                              subtotal, net_amount, grand_total, payable, parent_doc_id, voided_at)
       values ($1,$2::doc_kind,$3,$4,$5::doc_status,'ลูกค้า','none',$6,$6,$6,$6,$7,
               case when $5::text = 'void' then now() end)
       returning id`,
      [tenantId, kind, no, date, o.status ?? 'issued', net, o.parent ?? null]);
    let n = 0;
    for (const [price, svc] of lines) {
      await admin.query(
        `insert into doc_items (tenant_id, doc_id, line_no, name, qty, unit_price, is_service)
         values ($1,$2,$3,'รายการ',1,$4,$5)`, [tenantId, rows[0].id, ++n, price, svc]);
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
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่แยกรายได้') returning id`)).rows[0].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);

    /* งานซ่อม: ใบส่งมอบ 1,000 (แรง 400 · อะไหล่ 600) และใบเสร็จที่ออกต่อ — ต้องไม่ถูกนับซ้ำ */
    const iv = await doc('IV', 'IV-1', '2026-03-05', 1000, [[400, true], [600, false]]);
    await doc('RC', 'RC-1', '2026-03-05', 1000, [[400, true], [600, false]], { parent: iv });

    /* งานซ่อม: ใบเสร็จออกต่อจากใบเสนอราคา · มีส่วนลดท้ายบิล 10% — บรรทัดรวม 2,000 แต่ net 1,800 */
    const qt = await doc('QT', 'QT-1', '2026-03-06', 1800, [[500, true], [1500, false]], { status: 'billed' });
    await doc('RC', 'RC-2', '2026-03-06', 1800, [[500, true], [1500, false]], { parent: qt });

    /* ขายหน้าร้าน: อะไหล่ล้วน 700 · และใบที่มีค่าแรงปน 300 (แรง 100) */
    await doc('RC', 'RC-3', '2026-03-07', 700, [[700, false]]);
    await doc('RC', 'RC-4', '2026-03-08', 300, [[100, true], [200, false]]);

    /* ใบที่ยกเลิกไม่นับ · ใบนอกช่วงเป็นใบหัวเปล่าไม่มีบรรทัด = อะไหล่ทั้งใบ */
    await doc('RC', 'RC-5', '2026-03-09', 9999, [[9999, false]], { status: 'void' });
    await doc('RC', 'RC-6', '2026-01-10', 250, []);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  it('แยกช่องทาง — ใบเสร็จไม่มีใบต้นทางคือขายหน้าร้าน ที่เหลือคืองานซ่อม', async () => {
    const s = await salesSplitWith(app, '2026-03-01', '2026-03-31');
    expect(s.job.count).toBe(2);
    expect(s.job.net).toBe(2800);
    expect(s.walkin.count).toBe(2);
    expect(s.walkin.net).toBe(1000);
    expect(s.total.net).toBe(3800);
  });

  it('ค่าแรงแบ่งตามสัดส่วนบรรทัด — ส่วนลดท้ายบิลถูกกระจายให้ค่าแรงและค่าอะไหล่เท่ากัน', async () => {
    const s = await salesSplitWith(app, '2026-03-01', '2026-03-31');
    /* IV-1: 400 · RC-2: 1,800 × 500/2,000 = 450 */
    expect(s.job.labour).toBe(850);
    expect(s.job.parts).toBe(1950);
    expect(s.walkin.labour).toBe(100);
    expect(s.walkin.parts).toBe(900);
  });

  it('ค่าแรง + ค่าอะไหล่ เท่ากับยอดรวมของทุกแถวเสมอ และตรงกับยอดขายก่อนภาษีของเอกสารที่นับ', async () => {
    const s = await salesSplitWith(app);
    for (const r of [s.job, s.walkin, s.total]) {
      expect(Math.round((r.labour + r.parts) * 100)).toBe(Math.round(r.net * 100));
    }

    const { rows } = await admin.query(
      `select coalesce(sum(d.net_amount), 0) as v from documents d
        where d.tenant_id = $1 and d.status <> 'void'
          and (d.kind in ('IV','IVT') or (d.kind = 'RC' and (d.parent_doc_id is null
               or (select p.kind from documents p where p.id = d.parent_doc_id) = 'QT')))`, [tenantId]);
    expect(s.total.net).toBe(Number(rows[0].v));
  });

  it('ใบที่ไม่มีบรรทัดนับเป็นค่าอะไหล่ทั้งใบ · ช่วงที่ไม่มีเอกสารได้ศูนย์', async () => {
    const jan = await salesSplitWith(app, '2026-01-01', '2026-01-31');
    expect(jan.walkin).toEqual({ count: 1, labour: 0, parts: 250, net: 250 });
    const none = await salesSplitWith(app, '2020-01-01', '2020-01-31');
    expect(none.total).toEqual({ count: 0, labour: 0, parts: 0, net: 0 });
  });
});
