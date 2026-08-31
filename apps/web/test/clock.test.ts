/**
 * ฐานข้อมูลกับแอปต้องเห็นวันที่ตรงกัน
 *
 * ค่าตั้งต้นของหลายคอลัมน์เป็น current_date และรายงานหลายตัวเทียบกับ current_date
 * ส่วนแอปคิดวันที่ตามเวลาไทยเสมอ ถ้าฐานข้อมูลเป็น UTC ซึ่งเป็นค่าตั้งต้นของ Docker
 * ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าสองฝั่งจะต่างกันหนึ่งวัน แล้วเอกสารกับการเคลื่อนไหวสต๊อก
 * ของงานเดียวกันจะลงคนละวันโดยไม่มีอาการให้เห็นเลย
 *
 *   DATABASE_URL=postgresql://postgres:x@localhost:5433/dgl npm test -w @drivegolight/web
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { SHOP_TZ, today } from '@drivegolight/core';

pg.types.setTypeParser(1082, (v) => v);

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../../..');
const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!DB_URL)('เขตเวลาของฐานข้อมูล', () => {
  let admin: pg.Client;
  let app: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB_URL });
    await admin.connect();

    await admin.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;');
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
        .replace('เปลี่ยนรหัสนี้ก่อนใช้จริง', 'apppass'),
    );

    const u = new URL(DB_URL!);
    u.username = 'dgl_app';
    u.password = 'apppass';
    app = new pg.Client({ connectionString: u.toString() });
    await app.connect();
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
  });

  it('role ของแอปต่อมาแล้วได้เขตเวลาไทย ไม่ว่าเครื่องฐานข้อมูลตั้งเป็นอะไร', async () => {
    const { rows } = await app.query(`select current_setting('timezone') as tz`);
    expect(rows[0].tz).toBe(SHOP_TZ);
  });

  it('current_date ของฐานข้อมูลตรงกับวันที่ที่แอปคิด', async () => {
    const { rows } = await app.query(`select current_date::text as d`);
    expect(rows[0].d).toBe(today());
  });

  it('ผู้ดูแลที่ไม่ได้ตั้งเขตเวลาอาจเห็นคนละวัน — เป็นเหตุผลที่ต้องตั้งให้ role ของแอป', async () => {
    /* เทสต์นี้ไม่ได้บังคับว่าต้องต่างกัน แค่ยืนยันว่าค่าของ role แอปมาจากการตั้งค่า
       ไม่ใช่บังเอิญตรงเพราะเครื่องที่รันเทสต์ตั้งเป็นไทยอยู่แล้ว */
    await admin.query(`set timezone = 'UTC'`);
    const { rows } = await admin.query(`select current_setting('timezone') as tz`);
    expect(rows[0].tz).toBe('UTC');

    const appTz = await app.query(`select current_setting('timezone') as tz`);
    expect(appTz.rows[0].tz).toBe(SHOP_TZ);
  });
});
