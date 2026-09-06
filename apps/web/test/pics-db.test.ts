/**
 * รูปสินค้าบนฐานข้อมูลจริง
 *
 * ข้อที่ต้องพิสูจน์หนักที่สุดคือ **โควตาบังคับที่ฐานข้อมูล ไม่ใช่ที่โค้ดแอป**
 * ถ้าตรวจในโค้ดแอป จะมีช่องแข่งกันเขียนเสมอ และอู่เดียวที่อัปรูปรัว ๆ
 * ทำให้พื้นที่เต็มจนอู่อื่นบันทึกอะไรไม่ได้เลย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { deletePic, getPicMeta, picShaOf, picUsage, readPic, savePic, sha256 } from '../src/lib/pics';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;
const load = (n: string) => new Uint8Array(readFileSync(join(here, 'fixtures/pics', n)));

describe.skipIf(!DB_URL)('รูปสินค้า', () => {
  let admin: pg.Client;
  let app: pg.Client;
  let tenantId: string;
  let brake: string;
  let oil: string;

  const full = () => load('small.jpg');
  const thumb = () => load('small.png');

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query(
      'drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
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
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));

    const t = await admin.query(
      `insert into tenants (name) values ('อู่ทดสอบรูป') returning id`);
    tenantId = t.rows[0].id;

    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
    await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query('delete from product_pics where tenant_id = $1', [tenantId]);
    await admin.query('delete from products where tenant_id = $1', [tenantId]);
    const p = await admin.query(
      `insert into products (tenant_id, code, name, unit, price_a)
       values ($1,'BRK-001','ผ้าเบรกหน้า','ชุด',500),
              ($1,'OIL-001','น้ำมันเครื่อง','ลิตร',220)
       returning id, code`, [tenantId]);
    brake = p.rows.find((r) => r.code === 'BRK-001').id;
    oil = p.rows.find((r) => r.code === 'OIL-001').id;
  });

  const ok = async (fn: Promise<any>) => {
    const r = await fn;
    if (!r.ok) throw new Error(`ควรผ่าน แต่ได้: ${r.error}`);
    return r.meta;
  };

  /* ---------------------------------------------------------------- */

  it('บันทึกแล้วอ่านกลับได้ไบต์เดิมเป๊ะ', async () => {
    const meta = await ok(savePic(app, brake, full(), thumb()));
    expect(meta.sha).toBe(sha256(full()));

    const back = await readPic(app, brake, meta.sha, 'full');
    expect(back).not.toBeNull();
    expect(new Uint8Array(back!.bytes), 'รูปที่อ่านกลับต้องเท่าเดิมทุกไบต์')
      .toEqual(full());
    expect(back!.mime).toBe('image/jpeg');
  });

  it('รูปย่อกับรูปเต็มเป็นคนละก้อน', async () => {
    const meta = await ok(savePic(app, brake, full(), thumb()));
    const t = await readPic(app, brake, meta.sha, 'thumb');
    expect(new Uint8Array(t!.bytes)).toEqual(thumb());
    expect(t!.mime, 'ชนิดมาจากรูปเต็ม เพราะ URL ใช้ sha ของรูปเต็ม').toBe('image/jpeg');
  });

  it('หนึ่งรูปต่อสินค้าหนึ่งรายการ — อัปใหม่ทับของเดิม ไม่ค้างเป็นขยะ', async () => {
    await ok(savePic(app, brake, full(), thumb()));
    await ok(savePic(app, brake, thumb(), full()));   /* สลับกัน = รูปคนละใบ */

    const { rows } = await app.query(
      'select count(*)::int as n from product_pics where product_id = $1', [brake]);
    expect(rows[0].n).toBe(1);

    const meta = await getPicMeta(app, brake);
    expect(meta!.sha).toBe(sha256(thumb()));
  });

  it('URL ที่ชี้ไปหารูปเก่าต้องไม่ได้รูปใหม่', async () => {
    const first = await ok(savePic(app, brake, full(), thumb()));
    await ok(savePic(app, brake, thumb(), full()));

    expect(await readPic(app, brake, first.sha, 'full'),
      'ถ้าไม่เช็ค sha เบราว์เซอร์จะเก็บรูปผิดไว้ตลอดกาล เพราะหัวแคชเป็น immutable')
      .toBeNull();
  });

  it('ปฏิเสธไฟล์ที่ไม่ใช่รูป โดยไม่เขียนอะไรลงฐาน', async () => {
    const evil = new TextEncoder().encode('<script>alert(1)</script>');
    const r = await savePic(app, brake, evil, thumb());
    expect(r.ok).toBe(false);

    const { rows } = await app.query('select count(*)::int as n from product_pics');
    expect(rows[0].n).toBe(0);
  });

  it('รูปย่อที่ไม่ใช่รูป ก็ต้องปฏิเสธ ไม่ใช่ตรวจแต่รูปเต็ม', async () => {
    const r = await savePic(app, brake, full(), new TextEncoder().encode('nope'));
    expect(r.ok, 'รูปย่อคือก้อนที่ถูกเสิร์ฟบ่อยที่สุด ตรวจแค่รูปเต็มไม่พอ').toBe(false);
    expect(r.ok === false && r.error).toMatch(/รูปย่อ/);
  });

  /** ข้อสำคัญที่สุด */
  it('โควตาถูกบังคับจากฐานข้อมูล ไม่ใช่จากโค้ดแอป', async () => {
    /* เขียนตรงเข้าตารางโดยไม่ผ่าน savePic เลย — ยังต้องโดนปฏิเสธ */
    await expect(app.query(
      `insert into product_pics
         (product_id, tenant_id, sha, mime, full_bytes, thumb_bytes, bytes)
       values ($1, current_tenant_id(), repeat('a', 64), 'image/jpeg',
               '\\x00'::bytea, '\\x00'::bytea, $2)`,
      [brake, 300 * 1024 * 1024],
    )).rejects.toThrow(/พื้นที่รูปของอู่นี้เต็ม/);
  });

  it('รูปเดิมที่กำลังถูกแทนที่ ไม่ถูกนับซ้ำในโควตา', async () => {
    /* ใส่รูปที่กินเกือบเต็มโควตาไว้ก่อน แล้วเขียนทับด้วยขนาดเท่ากัน — ต้องผ่าน */
    const nearly = 199 * 1024 * 1024;
    await admin.query(
      `insert into product_pics
         (product_id, tenant_id, sha, mime, full_bytes, thumb_bytes, bytes)
       values ($1, $2, repeat('b', 64), 'image/jpeg', '\\x00'::bytea, '\\x00'::bytea, $3)`,
      [brake, tenantId, nearly]);

    await expect(app.query(
      `update product_pics set bytes = $2 where product_id = $1`, [brake, nearly],
    )).resolves.toBeTruthy();
  });

  it('อู่เต็มแล้ว ไม่กระทบอู่อื่น', async () => {
    const other = await admin.query(
      `insert into tenants (name) values ('อู่อื่น') returning id`);
    const otherTenant = other.rows[0].id;
    const op = await admin.query(
      `insert into products (tenant_id, code, name) values ($1,'X','สินค้าอู่อื่น') returning id`,
      [otherTenant]);

    await admin.query(
      `insert into product_pics
         (product_id, tenant_id, sha, mime, full_bytes, thumb_bytes, bytes)
       values ($1, $2, repeat('c', 64), 'image/jpeg', '\\x00'::bytea, '\\x00'::bytea, $3)`,
      [brake, tenantId, 199 * 1024 * 1024]);

    await expect(admin.query(
      `insert into product_pics
         (product_id, tenant_id, sha, mime, full_bytes, thumb_bytes, bytes)
       values ($1, $2, repeat('d', 64), 'image/jpeg', '\\x00'::bytea, '\\x00'::bytea, 1000)`,
      [op.rows[0].id, otherTenant],
    )).resolves.toBeTruthy();

    await admin.query('delete from product_pics where tenant_id = $1', [otherTenant]);
    await admin.query('delete from products where tenant_id = $1', [otherTenant]);
    await admin.query('delete from tenants where id = $1', [otherTenant]);
  });

  it('ลบสินค้า รูปหายตาม ไม่ค้างกินพื้นที่', async () => {
    await ok(savePic(app, brake, full(), thumb()));
    await admin.query('delete from products where id = $1', [brake]);

    const { rows } = await admin.query(
      'select count(*)::int as n from product_pics where product_id = $1', [brake]);
    expect(rows[0].n).toBe(0);
  });

  it('ลบรูปแล้วสินค้ายังอยู่', async () => {
    await ok(savePic(app, brake, full(), thumb()));
    await deletePic(app, brake);
    expect(await getPicMeta(app, brake)).toBeNull();

    const { rows } = await app.query('select count(*)::int as n from products where id = $1',
      [brake]);
    expect(rows[0].n).toBe(1);
  });

  it('ดึงรูปย่อของหลายสินค้ารวดเดียว', async () => {
    await ok(savePic(app, brake, full(), thumb()));
    const map = await picShaOf(app, [brake, oil]);
    expect(map.get(brake)).toBe(sha256(full()));
    expect(map.get(oil), 'สินค้าที่ไม่มีรูปต้องไม่อยู่ในผลลัพธ์').toBeUndefined();
  });

  it('นับพื้นที่ที่ใช้ไปได้', async () => {
    await ok(savePic(app, brake, full(), thumb()));
    const u = await picUsage(app);
    expect(u.count).toBe(1);
    expect(u.bytes).toBe(full().length + thumb().length);
  });

  it('อู่หนึ่งอ่านรูปของอีกอู่ไม่ได้', async () => {
    const other = await admin.query(
      `insert into tenants (name) values ('อู่อื่น') returning id`);
    const op = await admin.query(
      `insert into products (tenant_id, code, name) values ($1,'Y','ของอู่อื่น') returning id`,
      [other.rows[0].id]);
    await admin.query(
      `insert into product_pics
         (product_id, tenant_id, sha, mime, full_bytes, thumb_bytes, bytes)
       values ($1, $2, repeat('e', 64), 'image/jpeg', '\\x01'::bytea, '\\x01'::bytea, 2)`,
      [op.rows[0].id, other.rows[0].id]);

    expect(await readPic(app, op.rows[0].id, 'e'.repeat(64), 'full')).toBeNull();
    expect(await picShaOf(app, [op.rows[0].id])).toEqual(new Map());

    await admin.query('delete from product_pics where tenant_id = $1', [other.rows[0].id]);
    await admin.query('delete from products where tenant_id = $1', [other.rows[0].id]);
    await admin.query('delete from tenants where id = $1', [other.rows[0].id]);
  });
});
