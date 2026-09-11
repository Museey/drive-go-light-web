/**
 * วิวต้องกันข้อมูลข้ามอู่ได้ **แม้เจ้าของวิวจะข้าม RLS ได้**
 *
 * วิวใน Postgres ประเมินสิทธิ์ด้วยเจ้าของวิวเป็นค่าปริยาย และเจ้าของคือ role
 * ที่รัน create view — บนบริการ Postgres แบบ managed เราไม่ได้เป็นคนเลือกว่า
 * ไมเกรชันจะถูกรันด้วย role ไหน ถ้าวันหนึ่งมันถูกรันด้วย superuser
 * วิวจะอ่านข้ามอู่ได้ทันทีโดยไม่มีอาการ — ตัวเลขยังดูสมเหตุสมผล ผิดแค่ว่ารวมของอู่อื่นมา
 *
 * เทสต์นี้จึง **จงใจย้ายเจ้าของวิวไปเป็น superuser** ซึ่งเป็นกรณีที่เลวร้ายที่สุด
 * แล้วพิสูจน์ว่ายังกันได้อยู่ ไม่ใช่ตรวจแค่ว่ามีคำว่า security_invoker อยู่ในไฟล์
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('วิวกับการแยกข้อมูลรายอู่', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let mine: string;
  let theirs: string;

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
      `insert into tenants (name) values ('อู่ของเรา'), ('อู่ข้างบ้าน') returning id`);
    mine = t.rows[0].id;
    theirs = t.rows[1].id;

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();

    /* ของอู่ละหนึ่งตัว พร้อมยอดยกมาคนละจำนวน — ถ้ารั่วจะเห็นทันทีว่าเกินมา */
    for (const [tenant, code, qty] of [[mine, 'OUR-01', 7], [theirs, 'THEIR-01', 99]] as const) {
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenant]);
      const p = await app.query(
        `insert into products (tenant_id, code, name, unit, last_cost)
         values (current_tenant_id(), $1, $1, 'ชิ้น', 10) returning id`, [code]);
      await app.query(
        `insert into stock_moves (tenant_id, product_id, moved_on, qty_delta,
                                  unit_cost, cost_amount, reason)
         values (current_tenant_id(), $1, current_date, $2::numeric, 10, $2::numeric * 10, 'opening')`,
        [p.rows[0].id, qty]);
    }
    await app.query(`select set_config('app.tenant_id', $1, false)`, [mine]);
  }, 60_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  it('ฐานทดสอบนี้มี role ที่ข้าม RLS ได้จริง — ไม่งั้นเทสต์ข้างล่างไม่ได้ทดสอบอะไร', async () => {
    const { rows } = await admin.query(
      `select rolsuper or rolbypassrls as bypass from pg_roles where rolname = current_user`);
    expect(rows[0].bypass).toBe(true);
  });

  it('product_stock ตั้ง security_invoker ไว้', async () => {
    const { rows } = await admin.query(
      `select c.reloptions from pg_class c where c.relname = 'product_stock'`);
    expect(rows[0]?.reloptions ?? []).toContain('security_invoker=true');
  });

  /** ข้อสำคัญที่สุดของไฟล์นี้ */
  it('เจ้าของวิวเป็น superuser ก็ยังอ่านข้ามอู่ไม่ได้', async () => {
    await admin.query(`alter view product_stock owner to current_user`);

    const owner = await admin.query(
      `select r.rolsuper or r.rolbypassrls as bypass
         from pg_class c join pg_roles r on r.oid = c.relowner
        where c.relname = 'product_stock'`);
    expect(owner.rows[0].bypass, 'ต้องย้ายเจ้าของไปเป็น role ที่ข้าม RLS ได้จริง').toBe(true);

    const { rows } = await app.query(
      `select s.qty_on_hand, p.code
         from product_stock s join products p on p.id = s.product_id
        order by p.code`);
    expect(rows.map((r) => r.code)).toEqual(['OUR-01']);

    /* อ่านวิวตรง ๆ โดยไม่ต่อกับ products ด้วย — ตรงนี้คือจุดที่ไม่มีอะไรมากันไว้อีกชั้น
       (lastQtyOf() ใน products.ts อ่านแบบนี้) */
    const bare = await app.query(`select tenant_id, qty_on_hand from product_stock`);
    expect(bare.rows).toHaveLength(1);
    expect(bare.rows[0].tenant_id).toBe(mine);
    expect(Number(bare.rows[0].qty_on_hand)).toBe(7);
  });
});
