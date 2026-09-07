/**
 * บันทึกข้อผิดพลาดและตรวจสุขภาพระบบ
 *
 * ข้อที่ต้องพิสูจน์หนักที่สุดคือ **ความลับไม่หลุดลงตาราง log**
 * ที่เก็บ log คือที่ที่ความลับรั่วบ่อยที่สุด เพราะไม่มีใครคิดว่ามันเป็นที่เก็บข้อมูลอ่อนไหว
 * แล้ววันหนึ่งก็เอาไปแปะในตั๋วแจ้งปัญหา
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  healthChecksWith, listErrorsWith, markSeenWith, recordErrorWith, scrub,
} from '../src/lib/ops-core';
import { freshSchema } from '../../../tools/test-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe('ลบความลับออกจากข้อความก่อนบันทึก', () => {
  it('connection string ไม่เหลือรหัสผ่าน', () => {
    const s = scrub('connect ECONNREFUSED postgresql://dgl_app:s3cr3tpass@10.0.0.5:5432/dgl');
    expect(s).not.toContain('s3cr3tpass');
    expect(s).toContain('postgresql://dgl_app:•••@');
  });

  it('คีย์ที่มีคำว่า password / token ถูกปิดค่า', () => {
    expect(scrub('password=hunter2 ต่อไม่ได้')).not.toContain('hunter2');
    expect(scrub('{"token":"abc123xyz"}')).not.toContain('abc123xyz');
    expect(scrub('Authorization: Bearer eyJhbGciOi')).not.toContain('eyJhbGciOi');
  });

  it('ยังเหลือชื่อคีย์ไว้ให้ไล่ปัญหาได้ ไม่ได้ลบทั้งบรรทัด', () => {
    const s = scrub('password=hunter2 ต่อไม่ได้');
    expect(s).toContain('password');
    expect(s).toContain('ต่อไม่ได้');
  });

  it('ข้อความปกติไม่ถูกแตะ', () => {
    const s = 'บันทึกใบเสร็จ RC-202609-001 ไม่สำเร็จ — ยอดเงินติดลบ';
    expect(scrub(s)).toBe(s);
  });
});

describe.skipIf(!DB_URL)('ตาราง ops.errors', () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    await freshSchema(admin, [
      'db/001_init.sql', 'db/002_auth.sql', 'db/008_ops.sql',
      'db/011_ops_console.sql', 'db/013_ops_grants.sql',
    ]);
    await admin.query(`
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
  }, 60_000);

  afterAll(async () => { await admin?.end(); });

  beforeEach(async () => { await admin.query('delete from ops.errors'); });

  it('บันทึกแล้วอ่านกลับได้', async () => {
    const id = await recordErrorWith(admin, {
      kind: 'server', message: 'พังตอนเปิดหน้าลูกหนี้', path: '/finance/ar',
    });
    expect(id).not.toBeNull();

    const rows = await listErrorsWith(admin);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toBe('พังตอนเปิดหน้าลูกหนี้');
    expect(rows[0]!.path).toBe('/finance/ar');
    expect(rows[0]!.seen).toBe(false);
  });

  /**
   * ข้อสำคัญที่สุดของไฟล์นี้
   */
  it('ความลับไม่ถูกบันทึกลงตาราง แม้จะอยู่ใน stack', async () => {
    await recordErrorWith(admin, {
      kind: 'server',
      message: 'ต่อฐานข้อมูลไม่ได้ postgresql://dgl_app:s3cr3tpass@db/dgl',
      stack: 'at signIn (password=hunter2)\n  at handler (token: abc123xyz)',
    });

    const { rows } = await admin.query('select message, stack from ops.errors');
    const all = JSON.stringify(rows);
    expect(all).not.toContain('s3cr3tpass');
    expect(all).not.toContain('hunter2');
    expect(all).not.toContain('abc123xyz');
  });

  it('ตัวบันทึกที่พังต้องไม่ทำให้คำขอพังตาม', async () => {
    const broken = { query: async () => { throw new Error('ฐานข้อมูลล่ม'); } } as never;
    await expect(recordErrorWith(broken, { kind: 'server', message: 'x' }))
      .resolves.toBeNull();
  });

  it('ข้อความยาวเกินไปถูกตัด ไม่ทำให้ตารางบวม', async () => {
    await recordErrorWith(admin, {
      kind: 'server', message: 'ก'.repeat(5000), stack: 'ข'.repeat(50000),
    });
    const { rows } = await admin.query('select message, stack from ops.errors');
    expect(rows[0].message.length).toBeLessThan(2100);
    expect(rows[0].stack.length).toBeLessThan(20200);
    expect(rows[0].stack).toContain('ตัดที่');
  });

  it('ทำเครื่องหมายว่าอ่านแล้วได้', async () => {
    const a = await recordErrorWith(admin, { kind: 'server', message: 'หนึ่ง' });
    await recordErrorWith(admin, { kind: 'server', message: 'สอง' });

    await markSeenWith(admin, [a!]);
    expect(await listErrorsWith(admin, { onlyUnseen: true })).toHaveLength(1);
    expect(await listErrorsWith(admin)).toHaveLength(2);
  });

  it('ลบของเกิน 90 วันทิ้ง', async () => {
    await recordErrorWith(admin, { kind: 'server', message: 'ใหม่' });
    await admin.query(
      `insert into ops.errors (at, kind, message) values (now() - interval '100 days','server','เก่า')`,
    );
    const { rows } = await admin.query('select ops.prune_errors(90) as n');
    expect(Number(rows[0].n)).toBe(1);
    expect(await listErrorsWith(admin)).toHaveLength(1);
  });

  /** ข้อผิดพลาดเกิดก่อนรู้ว่าเป็นอู่ไหนได้ และต้องอ่านข้ามอู่ได้ตอนไล่ปัญหา */
  it('ไม่ผูกกับ RLS — บันทึกได้โดยไม่ต้องตั้งรหัสอู่', async () => {
    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    const app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
    try {
      const id = await recordErrorWith(app, { kind: 'client', message: 'พังในเบราว์เซอร์' });
      expect(id).not.toBeNull();
      expect(await listErrorsWith(app)).toHaveLength(1);

      /* แต่ลบไม่ได้ — คนที่ทำระบบพังต้องลบร่องรอยไม่ได้ */
      await expect(app.query('delete from ops.errors')).rejects.toThrow(/permission denied/i);
    } finally {
      await app.end();
    }
  });
});

describe.skipIf(!DB_URL)('ตรวจสุขภาพระบบ', () => {
  let admin: pg.Client;
  let app: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();
    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
  }, 30_000);

  afterAll(async () => { await app?.end(); await admin?.end(); });

  it('role ของแอปผ่านทุกข้อ', async () => {
    const checks = await healthChecksWith(app, ['001_init.sql']);
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName.db!.ok).toBe(true);
    expect(byName.clock!.ok).toBe(true);
  });

  /** superuser ข้าม RLS ได้ ซึ่งแปลว่าทุกอู่เห็นข้อมูลของกันและกัน */
  it('role ที่ข้าม RLS ได้ต้องตก', async () => {
    const checks = await healthChecksWith(admin, []);
    expect(checks.find((c) => c.name === 'db')!.ok).toBe(false);
  });

  it('ไมเกรชันที่ยังไม่ได้รันทำให้ตก และบอกชื่อไฟล์', async () => {
    await admin.query(`insert into ops.migrations (filename, checksum)
                       values ('001_init.sql','x') on conflict do nothing`);
    const checks = await healthChecksWith(app, ['001_init.sql', '999_ยังไม่มี.sql']);
    const m = checks.find((c) => c.name === 'migrations')!;
    expect(m.ok).toBe(false);
    expect(m.detail).toContain('999_ยังไม่มี.sql');
  });
});
