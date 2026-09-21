/**
 * pool ของฐานข้อมูลต้องไม่ตันจนเซิร์ฟเวอร์ค้างทั้งตัว (เจอจริง 21 ก.ย. 2569)
 *
 * ยิงรับชำระพร้อมกัน 10 เครื่องผ่านแอปจริงบนโค้ด main — ทุกคำขอค้าง 59 วินาทีแล้วไม่มีรายการไหนถูกบันทึก
 * ฐานข้อมูลมี connection "idle in transaction" 5 เส้นค้างอยู่ เพราะโค้ดรับชำระเรียก requireEdit
 * ข้างในทรานแซกชัน ซึ่งไปโหลดเซสชันด้วย connection เส้นที่สอง pool มี 5 เส้น (DB_POOL_MAX บนเครื่องจริง)
 * ห้าคำขอถือคนละเส้นแล้วรอเส้นที่สอง ไม่มีวันว่าง และ pg ตั้งต้นให้รอไม่มีกำหนด
 * **ทุกหน้าของทุกอู่บนเครื่องเดียวกันค้างตามไปด้วย** จนกว่าจะรีสตาร์ต
 *
 * กันสองชั้น (db.ts)
 *   1. ขอ connection ซ้อนในคำขอเดียวกัน → ตอนพัฒนาและเทสต์โยนทันที ให้ชุดทดสอบกวาดหาจุดที่หลุด
 *   2. รอ connection ว่างได้ไม่เกิน 10 วินาที → เครื่องจริงล้มแล้วบอกผู้ใช้ แทนการแขวนทุกคน
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { freshSchema } from '../../../tools/test-schema.mjs';

/* db.ts กัน server-only ไว้ — ในเทสต์ไม่มี bundler ของ Next ให้แยกฝั่ง */
vi.mock('server-only', () => ({}));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('pool ของฐานข้อมูล', () => {
  let admin: pg.Client;
  let tenantId: string;
  let db: typeof import('../src/lib/db');

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, ['db/001_init.sql', 'db/002_auth.sql']);
    await admin.query(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'dgl_app') then execute 'drop owned by dgl_app'; end if;
      end $$;`);
    await admin.query(readFileSync(resolve(ROOT, 'db/app-role.sql'), 'utf8').replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'));
    tenantId = (await admin.query(`insert into tenants (name) values ('อู่ทดสอบ pool') returning id`)).rows[0].id;

    /* ต่อในนาม role ของแอปจริง และ pool เล็กเท่าที่ต้องใช้ให้ตันได้ในเทสต์ */
    const url = new URL(DB_URL!);
    url.username = 'dgl_app';
    url.password = 'apppass';
    process.env.DATABASE_URL = url.toString();
    process.env.DB_POOL_MAX = '2';
    db = await import('../src/lib/db');
  }, 60_000);

  afterAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    await globalThis.__dglPool?.end();
    globalThis.__dglPool = undefined;
    await admin?.end();
  });

  it('ขอ connection ซ้อนขณะถืออยู่แล้ว → โยนทันที ไม่รอ', async () => {
    const got = await db.withTenant(tenantId, async () =>
      db.withoutTenant(async () => 'ไม่ควรมาถึง').then(() => null, (e: Error) => e));
    expect(got).toBeInstanceOf(db.NestedConnectionError);
  });

  it('ขอพร้อมกันแบบไม่ซ้อน (Promise.all ในหน้าเดียว) ยังใช้ได้ตามปกติ', async () => {
    const r = await Promise.all([1, 2, 3, 4].map((i) =>
      db.withTenant(tenantId, async (c) => (await c.query('select $1::int as n', [i])).rows[0].n)));
    expect(r).toEqual([1, 2, 3, 4]);
  });

  it('รูปแบบที่ทำให้เครื่องจริงค้าง — ล้มภายใน 10 วินาทีพร้อมข้อความ ไม่แขวนไปตลอด', async () => {
    /* บนเครื่องจริงตัวจับข้อ 1 แค่บันทึกแล้วปล่อยผ่าน — จำลองสภาพนั้น แล้วยิงซ้อนพร้อมกันเท่าขนาด pool */
    const env = process.env.NODE_ENV;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      const t0 = Date.now();
      const nested = () => db.withTenant(tenantId, async () => {
        await new Promise((r) => setTimeout(r, 200));      // ให้ทั้งสองคำขอถือคนละเส้นก่อน
        return db.withoutTenant(async () => 'ok');
      }).then(() => 'ผ่าน', (e: Error) => e.message);

      const got = await Promise.all([nested(), nested()]);
      const took = Date.now() - t0;

      expect(got).toEqual([
        'ระบบกำลังมีคนใช้งานพร้อมกันมาก รอบนี้จึงยังไม่ได้บันทึก — รอสักครู่แล้วลองอีกครั้ง',
        'ระบบกำลังมีคนใช้งานพร้อมกันมาก รอบนี้จึงยังไม่ได้บันทึก — รอสักครู่แล้วลองอีกครั้ง',
      ]);
      expect(took, 'ต้องล้มเองภายในเวลาที่ตั้งไว้').toBeLessThan(15_000);
      expect(log, 'เครื่องจริงต้องบันทึกการขอซ้อนไว้ให้ไล่ย้อนได้').toHaveBeenCalled();

      /* ล้มแล้ว pool ต้องกลับมาใช้ได้ ไม่ใช่เสียทั้งโพรเซส */
      await expect(db.withTenant(tenantId, async () => 'หายแล้ว')).resolves.toBe('หายแล้ว');
    } finally {
      (process.env as Record<string, string>).NODE_ENV = env!;
      log.mockRestore();
    }
  }, 30_000);
});
