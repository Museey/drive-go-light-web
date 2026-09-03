/**
 * สิทธิ์บนฐานข้อมูลจริง — **พิสูจน์ว่าไม่มีทางลอด**
 *
 * ช่วงนี้พลาดแล้วเจ็บเงียบ ระบบยังทำงานได้ปกติทุกอย่าง แค่ช่างคนหนึ่ง
 * เห็นต้นทุนอะไหล่ทั้งร้าน แล้วไม่มีใครรู้จนกว่าจะสาย
 * การซ่อนปุ่มจึงไม่พอ ต้องไล่ทุกทางที่ข้อมูลออกจากระบบได้แล้วยืนยันว่าปิดครบ
 *
 * รายชื่อเส้นทางอ่านจากไฟล์จริงในโปรเจกต์ ไม่ใช่รายการที่พิมพ์ไว้ —
 * หน้าใหม่ที่ลืมกันจะทำให้เทสต์แดงเอง แบบเดียวกับ tenant-isolation.test.ts
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { canCost, canEdit, canExport, canTab, type Perms } from '../src/lib/perms';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const APP = resolve(here, '../src/app');
const DB_URL = process.env.DATABASE_URL;

/** พนักงานที่ถูกซ่อนต้นทุน แต่เปิดเมนูอื่นให้หมด */
const NO_COST: Perms = {
  menus: {
    customer: true, income: true, expense: true, stock: true, finance: true, settings: true,
  },
  cost: false,
};

const staff = (perms: Perms) => ({ role: 'staff' as const, perms });

/** ไล่หาไฟล์ตามชื่อในต้นไม้ของ app router */
function walk(dir: string, hit: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, hit));
    else if (hit(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(APP.length).replace(/\\/g, '/');

describe('ทุกเส้นทางที่ส่งข้อมูลออกต้องกันไว้ครบ', () => {
  /**
   * ข้อสำคัญที่สุดของช่วงนี้
   *
   * ไฟล์สำรองมีต้นทุนของสินค้าทุกตัวและทุกใบซื้ออยู่ในนั้น
   * CSV สินค้ามีคอลัมน์ต้นทุน CSV การเงินมีต้นทุนขาย
   * ทั้งสามต้องเรียก requireCost() ไม่ใช่แค่ตรวจสิทธิ์เมนู
   */
  it('route ที่มีต้นทุนอยู่ในไฟล์ ต้องเรียก requireCost()', () => {
    const MUST_COST = ['/settings/export/route.ts', '/stock/csv/route.ts', '/finance/csv/route.ts'];
    for (const r of MUST_COST) {
      const src = readFileSync(join(APP, r), 'utf8');
      expect(src, `${r} ต้องกันด้วย requireCost()`).toContain('requireCost(');
    }
  });

  /**
   * ไล่จากไฟล์จริง ไม่ใช่รายชื่อที่พิมพ์ไว้ — route ใหม่ที่ลืมกันจะแดงเอง
   */
  it('ทุก route ที่ส่งไฟล์ออก ต้องตรวจสิทธิ์ส่งออกหรือสิทธิ์ต้นทุน', () => {
    const routes = walk(APP, (p) => p.endsWith('route.ts'));
    expect(routes.length).toBeGreaterThan(3);

    const missing: string[] = [];
    for (const p of routes) {
      const src = readFileSync(p, 'utf8');
      /* ยกเว้นได้เฉพาะที่ไม่ได้ส่งข้อมูลของอู่ออกไปเลย — เพิ่มเข้ารายการนี้
         ต้องมีเหตุผลกำกับเสมอ ไม่ใช่เพิ่มเพื่อให้เทสต์เขียว
           logout   แค่ลบ session
           healthz  ตอบ ok/ไม่ ok กับชื่อการตรวจที่ตก ไม่มีข้อมูลของอู่
                    และต้องเรียกได้โดยไม่ล็อกอิน เพราะระบบเฝ้าระวังเรียกจากข้างนอก */
      const EXEMPT = ['/logout/route.ts', '/healthz/route.ts'];
      if (EXEMPT.includes(rel(p))) continue;
      if (!/require(Export|Cost)\(/.test(src)) missing.push(rel(p));
    }
    expect(missing, 'route เหล่านี้ยังไม่ได้กันการส่งออก').toEqual([]);
  });

  /**
   * หน้าที่พิมพ์ "ทั้งชุด" ต้องกันด้วยสิทธิ์ส่งออก
   * ส่วนใบรายฉบับ (เช่น ใบเสร็จของลูกค้า) ทำได้เสมอตามสิทธิ์เมนู — กติกาของรุ่น 6.4
   */
  it('หน้าพิมพ์ทั้งชุดต้องเรียก requireExport()', () => {
    const WHOLE_LIST = [
      '/stock/print/page.tsx',
      '/stock/pending/print/page.tsx',
      '/customers/print/page.tsx',
      '/expense/print/page.tsx',
      '/stock/sheet/page.tsx',
    ];
    for (const r of WHOLE_LIST) {
      const src = readFileSync(join(APP, r), 'utf8');
      expect(src, `${r} ต้องกันด้วย requireExport()`).toContain('requireExport(');
    }
  });

  /** หน้าที่แสดงต้นทุนต้องอ่านสิทธิ์ต้นทุนจริง ไม่ใช่แสดงให้ทุกคน */
  it('หน้าที่แสดงต้นทุนต้องเรียก canCost()', () => {
    const COST_PAGES = [
      '/stock/page.tsx',
      '/stock/print/page.tsx',
      '/stock/[id]/page.tsx',
    ];
    for (const r of COST_PAGES) {
      const src = readFileSync(join(APP, r), 'utf8');
      expect(src, `${r} ต้องอ่านสิทธิ์ต้นทุน`).toMatch(/canCost\(/);
    }
  });
});

describe('กติกาที่ห้ามพลาด', () => {
  it('ซ่อนต้นทุนแล้วเข้าหน้ากำไรขาดทุนไม่ได้ ทั้งดูและส่งออก', () => {
    const s = staff(NO_COST);
    expect(canTab(s, 'finance', 'pl')).toBe(false);
    expect(canExport(s, 'finance', 'pl')).toBe(false);
    expect(canCost(s)).toBe(false);
    /* แต่แท็บอื่นในเมนูเดียวกันยังเข้าได้ */
    expect(canTab(s, 'finance', 'ar')).toBe(true);
  });

  /**
   * กติกาที่รุ่น 6.4 ย้ำไว้ชัด — คนที่ดูสต๊อกได้อย่างเดียวยังออกใบเสร็จได้
   * เพราะการดึงสินค้าเข้าเอกสารขายไม่นับเป็นการแก้ทะเบียนสินค้า
   */
  it('ดูสต๊อกได้อย่างเดียว แต่ยังออกใบเสร็จได้', () => {
    const s = staff({
      menus: { stock: true, income: true },
      edit: { 'stock.list': false },
    });
    expect(canTab(s, 'stock', 'list')).toBe(true);
    expect(canEdit(s, 'stock', 'list')).toBe(false);
    expect(canEdit(s, 'income', 'receipt')).toBe(true);
  });
});

describe.skipIf(!DB_URL)('ฐานข้อมูล', () => {
  let admin: pg.Client;
  let tenantId: string;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
    await admin.query(readFileSync(resolve(ROOT, 'db/001_init.sql'), 'utf8'));
    await admin.query(readFileSync(resolve(ROOT, 'db/002_auth.sql'), 'utf8'));
    const t = await admin.query(`insert into tenants (name) values ('อู่ทดสอบสิทธิ์') returning id`);
    tenantId = t.rows[0].id;
  }, 60_000);

  afterAll(async () => { await admin?.end(); });

  it('เจ้าของที่ auth.create_owner สร้างให้ ได้ menus ครบทุกเมนู', async () => {
    await admin.query(`select auth.create_owner($1, 'o@x.com', 'เจ้าของ')`, [tenantId]);
    const { rows } = await admin.query(
      `select role::text as role, perms from users where tenant_id = $1`, [tenantId],
    );
    expect(rows[0].role).toBe('owner');
    expect(Object.keys(rows[0].perms.menus).sort()).toEqual(
      ['customer', 'expense', 'finance', 'income', 'settings', 'stock'],
    );
  });

  it('perms ต้องเป็นออบเจกต์เสมอ — อาเรย์หรือ null ถูกปฏิเสธที่ฐาน', async () => {
    await expect(admin.query(
      `insert into users (tenant_id, code, name, role, perms)
       values ($1, 'U9', 'x', 'staff', '[]'::jsonb)`, [tenantId],
    )).rejects.toThrow(/users_perms_object/);
  });

  it('max_users ติดลบหรือศูนย์ตั้งไม่ได้', async () => {
    await expect(admin.query(
      `insert into subscriptions (tenant_id, expires_on, max_users)
       values ($1, current_date + 365, 0)`, [tenantId],
    )).rejects.toThrow(/max_users/);
  });

  /**
   * ไมเกรชันต้องไม่ทำให้ใครเสียสิทธิ์ — ของเดิมไม่เคยซ่อนต้นทุน
   * คนที่ใช้อยู่ตอนนี้จึงต้องได้ cost:true ทุกคนหลังอัปเกรด
   */
  it('ไมเกรชันแปลงอาเรย์เดิมเป็น menus และเปิดสิทธิ์ต้นทุนให้ทุกคน', async () => {
    const sql = readFileSync(resolve(ROOT, 'db/007_perms.sql'), 'utf8');
    expect(sql).toContain("'cost', true");
    expect(sql).toContain("'homeReport', true");
    expect(sql).toMatch(/jsonb_object_agg\(k, true\)/);
  });
});
