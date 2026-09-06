#!/usr/bin/env node
/**
 * รันไฟล์ไมเกรชันที่ยังไม่เคยรัน แล้วจดไว้ว่ารันอะไรไปแล้ว
 *
 *   node tools/migrate.mjs --fresh      ติดตั้งใหม่ — ฐานข้อมูลยังว่างเปล่า
 *   node tools/migrate.mjs              อัปเกรดฐานเดิม — รันเฉพาะที่ค้าง
 *   node tools/migrate.mjs --dry-run    บอกว่าจะรันอะไรบ้าง แต่ไม่รัน
 *   node tools/migrate.mjs --mark-only  จดว่ารันแล้วโดยไม่รันจริง
 *   node tools/migrate.mjs --status     ดูว่ารันอะไรไปแล้วบ้าง
 *
 * ตัวแปร — ADMIN_URL หรือ DATABASE_URL (จำเป็น) · DIR (ค่าตั้งต้น db)
 *
 * **ใช้ pg ไม่ใช่ psql** เพราะอิมเมจของแพลตฟอร์มที่รัน Node ส่วนใหญ่ไม่มี Postgres client
 * ตัวเดียวนี้จึงใช้ได้ทั้งบนเครื่องพัฒนา บนเซิร์ฟเวอร์ที่เราดูแลเอง และบนแพลตฟอร์ม
 *
 * **ติดตั้งใหม่กับอัปเกรดใช้คนละคำสั่ง** เพราะ 001_init.sql เก็บสคีมาปัจจุบันไว้ครบ
 * ไฟล์ 003 เป็นต้นไปเป็น "ทางเดินจากของเก่ามาหาปัจจุบัน" ไม่ใช่ของที่ต้องรันซ้ำ
 * ฐานใหม่ที่รัน 001 แล้วไปรัน 007 ต่อจะพังทันที เพราะ 007 สั่งลบคอลัมน์ที่ 001 ไม่มีแล้ว
 *
 * ---- กติกาของไฟล์ไมเกรชัน ----
 *
 * **หนึ่งไฟล์คือหนึ่งทรานแซกชัน** ตัวรันห่อ begin/commit ให้เอง รวมถึงการจด
 * ops.migrations ด้วย ไฟล์ที่พังกลางคันจึงไม่ทิ้งอะไรไว้เลย แก้แล้วรันใหม่ได้ทันที
 * ตั้งแต่ระบบขึ้นเครื่องจริง นี่สำคัญกว่าความสะดวกทุกอย่าง เพราะฐานมีข้อมูลของอู่อยู่
 *
 * ตามมาสามข้อ — มีเทสต์บังคับไว้ใน apps/web/test/migrate-runner.test.ts ทั้งหมด
 *   1. ห้ามเขียน begin / commit เองในไฟล์ SQL
 *   2. ห้ามใช้คำสั่งที่รันในทรานแซกชันไม่ได้ (create index concurrently · vacuum ·
 *      alter system) — ตารางของเรายังเล็กพอที่ create index ธรรมดาจะล็อกสั้น
 *   3. `alter type ... add value` ต้องอยู่ไฟล์ของตัวเอง แล้วใช้ค่าใหม่ในไฟล์ถัดไป
 *      Postgres ต้อง commit ค่า enum ใหม่ก่อนถึงจะใช้ได้ (ดู 003_fifo.sql · 005_claims.sql)
 *
 * และเพราะครอบทรานแซกชันแล้ว `set local lock_timeout` ที่หัวไฟล์จึงใช้ได้ —
 * ควรใส่ทุกไฟล์ที่แตะตารางซึ่งแอปกำลังใช้งานอยู่
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runStatements, sslHint } from './sql-statements.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(ROOT, process.env.DIR ?? 'db');

/** ไฟล์ที่ต้องรันจริงตอนติดตั้งใหม่ — ที่เหลือรวมอยู่ใน 001 แล้ว จึงแค่จดว่ารันแล้ว */
export const FRESH_FILES = new Set(['001_init.sql', '002_auth.sql', '008_ops.sql']);

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** ไฟล์ไมเกรชันคือไฟล์ที่ขึ้นต้นด้วยตัวเลข — app-role.sql ไม่ใช่ เพราะต้องรันซ้ำทุกครั้งหลังกู้ */
export function migrationFiles(dir = DIR) {
  return readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
}

const BOOTSTRAP = `
  create schema if not exists ops;
  create table if not exists ops.migrations (
    filename text primary key,
    checksum text not null,
    ran_at timestamptz not null default now(),
    ran_by text not null default current_user);
`;

/**
 * บอกทางแก้เมื่อคำสั่งนั้นรันในทรานแซกชันไม่ได้
 *
 * ข้อความดิบจาก Postgres ถูกต้องแต่ไม่ได้บอกว่าต้องทำอะไรต่อ — คนที่เจอตอนตี 4
 * ระหว่าง deploy ต้องอ่านแล้วรู้ทันทีว่าแก้ยังไง ไม่ใช่ไปเปิดคู่มือหา
 */
function txHint(err) {
  const code = err && err.code;

  /* 55P04 — เพิ่มค่า enum แล้วใช้ค่านั้นในทรานแซกชันเดียวกัน */
  if (code === '55P04') {
    return '\n\nทางแก้ — แยก `alter type ... add value` ออกไปเป็นไฟล์ไมเกรชันของตัวเอง\n' +
      'แล้วค่อยใช้ค่าใหม่ในไฟล์ถัดไป Postgres ต้อง commit ค่า enum ใหม่ก่อนถึงจะใช้ได้\n' +
      'ดู db/003_fifo.sql กับ db/005_claims.sql ที่ทำแบบนี้ไว้แล้ว';
  }

  /* 25001 — คำสั่งที่รันในทรานแซกชันไม่ได้เลย เช่น create index concurrently */
  if (code === '25001') {
    return '\n\nคำสั่งนี้รันในทรานแซกชันไม่ได้ แต่ตัวรันครอบทรานแซกชันไว้ทุกไฟล์เสมอ\n' +
      'เพื่อให้ไฟล์ที่พังกลางคันไม่ทิ้งฐานไว้ครึ่ง ๆ — หาวิธีอื่นแทน\n' +
      '(create index ธรรมดาแทน concurrently · ตารางของเรายังเล็กพอที่จะล็อกสั้น)';
  }

  return '';
}

export async function migrate(client, { mode = 'run', dir = DIR, log = console.log } = {}) {
  await runStatements(client, BOOTSTRAP);

  const files = migrationFiles(dir);
  const { rows } = await client.query('select filename, checksum from ops.migrations');
  const ran = new Map(rows.map((r) => [r.filename, r.checksum]));

  if (mode === 'status') {
    log('รันไปแล้ว:');
    for (const [f, c] of [...ran].sort()) log(`  ${f}  ${c.slice(0, 12)}`);
    const pending = files.filter((f) => !ran.has(f));
    log(pending.length ? `\nยังไม่ได้รัน:\n${pending.map((f) => '  ' + f).join('\n')}`
                       : '\nไม่มีไมเกรชันค้าง');
    return { pending: pending.length, changed: [] };
  }

  if (mode === 'fresh') {
    const { rows: t } = await client.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema = 'public' and table_name = 'tenants'`,
    );
    if (t[0].n !== 0) {
      throw new Error(
        'ฐานข้อมูลนี้มีตารางอยู่แล้ว — --fresh ใช้กับฐานว่างเท่านั้น\n' +
        'ถ้าตั้งใจจะอัปเกรดของเดิม ให้รันโดยไม่ใส่ --fresh',
      );
    }
  }

  /* ไฟล์ที่ขึ้นเครื่องจริงแล้วห้ามแก้ — ถ้าแก้แปลว่าโค้ดกับฐานข้อมูลไม่ตรงกันโดยไม่มีใครรู้ */
  const changed = [];
  for (const f of files) {
    const before = ran.get(f);
    if (before && before !== sha(readFileSync(join(dir, f), 'utf8'))) changed.push(f);
  }
  if (changed.length) {
    throw new Error(
      `ไฟล์ที่รันไปแล้วถูกแก้เนื้อหา: ${changed.join(', ')}\n` +
      'ไฟล์ไมเกรชันที่ขึ้นเครื่องจริงแล้วห้ามแก้ — ให้เขียนไฟล์ใหม่ต่อท้ายแทน',
    );
  }

  let pending = 0;
  for (const f of files) {
    if (ran.has(f)) continue;
    pending++;
    const text = readFileSync(join(dir, f), 'utf8');

    if (mode === 'dry') { log(`จะรัน  ${f}`); continue; }

    /**
     * หนึ่งไฟล์คือหนึ่งทรานแซกชัน — รวมการจด ops.migrations เข้าไปด้วย
     *
     * ถ้าไม่ครอบไว้ ไฟล์ที่มีหกคำสั่งแล้วพังที่คำสั่งที่สี่ จะทิ้งฐานไว้ครึ่ง ๆ
     * โดยที่ ops.migrations ไม่มีแถวของมัน — deploy รอบหน้าจึงรันไฟล์เดิมซ้ำ
     * แล้วไปตายที่คำสั่งแรกเพราะตารางมีอยู่แล้ว กลายเป็นสภาพที่แก้ได้ด้วยมือเท่านั้น
     * บนฐานที่มีข้อมูลของอู่อยู่จริง
     *
     * และเพราะจดไว้ในทรานแซกชันเดียวกัน สิ่งที่ ops.migrations บอกจึงตรงกับ
     * สิ่งที่เกิดขึ้นจริงเสมอ ไม่มีทางเหลื่อมกันได้เลย
     *
     * ผลพลอยได้คือ `set local` ในไฟล์ SQL ใช้ได้ ซึ่งจำเป็นสำหรับ lock_timeout
     */
    await client.query('begin');
    try {
      if (mode === 'run' || (mode === 'fresh' && FRESH_FILES.has(f))) {
        log(`รัน  ${f}`);
        await runStatements(client, text);
      } else if (mode === 'fresh') {
        log(`ข้าม (รวมอยู่ใน 001 แล้ว)  ${f}`);
      }

      await client.query(
        'insert into ops.migrations (filename, checksum) values ($1, $2)', [f, sha(text)],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw new Error(
        `ไมเกรชัน ${f} ล้มเหลว — ย้อนกลับหมดแล้ว ` +
        'ฐานข้อมูลอยู่ในสภาพเดียวกับก่อนรันไฟล์นี้ แก้ไฟล์แล้วรันใหม่ได้เลย\n' +
        (err instanceof Error ? err.message : String(err)) +
        txHint(err),
        { cause: err },
      );
    }
  }

  if (pending === 0) log('ไม่มีไมเกรชันค้าง — ฐานข้อมูลตรงกับโค้ดแล้ว');
  else if (mode === 'dry') log(`ค้างอยู่ ${pending} ไฟล์ (ยังไม่ได้รัน เพราะสั่ง --dry-run)`);
  else if (mode === 'mark') log(`จดไปแล้ว ${pending} ไฟล์`);
  else if (mode === 'fresh') log(`ติดตั้งใหม่เสร็จ — จดไว้ ${pending} ไฟล์`);
  else log(`รันเสร็จ ${pending} ไฟล์`);

  return { pending, changed };
}

/* ---------- เรียกจากบรรทัดคำสั่ง ----------
   เทียบกับ argv[1] ไม่ใช่ import.meta.url เพราะไฟล์นี้ถูกโหลดผ่าน migrate.mjs
   ซึ่งเป็นตัวตรวจรุ่น Node — สองค่านั้นจึงไม่ตรงกัน */
if (/migrate(\.impl)?\.mjs$/.test(process.argv[1] ?? '')) {
  const modes = { '--fresh': 'fresh', '--dry-run': 'dry', '--mark-only': 'mark', '--status': 'status' };
  let mode = 'run';
  for (const a of process.argv.slice(2)) {
    if (!modes[a]) { console.error(`ไม่รู้จักตัวเลือก ${a}`); process.exit(2); }
    mode = modes[a];
  }

  const url = process.env.ADMIN_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('ต้องตั้ง ADMIN_URL หรือ DATABASE_URL ก่อน');
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await migrate(client, { mode });
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : err}`);
    const hint = sslHint(err);
    if (hint) console.error(`\n${hint}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
