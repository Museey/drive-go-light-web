/**
 * ตั้งเขตเวลาและสร้าง role ของแอป บนฐานข้อมูลที่เราไม่ได้เป็น superuser
 *
 *   ADMIN_URL='postgresql://...' node tools/setup-db.mjs
 *   ADMIN_URL='postgresql://...' node tools/setup-db.mjs --password='รหัสที่อยากใช้'
 *   ADMIN_URL='postgresql://...' node tools/setup-db.mjs --show   พิมพ์ URL ลงหน้าจอ
 *
 * ค่าตั้งต้นจะ **ก๊อป URL ลงคลิปบอร์ด ไม่พิมพ์ลงหน้าจอ** เพราะการพิมพ์ออกมาเต็ม ๆ
 * เชิญให้คนก๊อปทั้งก้อนไปวางในแชท ซึ่งเกิดขึ้นจริงมาแล้วสองครั้งในโปรเจกต์นี้
 *
 * ทำสิ่งเดียวกับ db/app-role-managed.sql แต่ไม่ต้องมี psql บนเครื่อง
 * (ไฟล์ SQL ยังอยู่ สำหรับคนที่มี psql อยู่แล้ว เช่นตอนดูแลเซิร์ฟเวอร์เอง)
 *
 * รันซ้ำได้ — ถ้ามี role อยู่แล้วจะตั้งรหัสผ่านใหม่ให้
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { sslHint } from './sql-statements.mjs';
import { emitSecret } from './secret-out.mjs';

const url = process.env.ADMIN_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("ต้องตั้ง ADMIN_URL ก่อน — ใช้ connection ของผู้ดูแลที่แพลตฟอร์มให้มา");
  process.exit(2);
}

const given = process.argv.find((a) => a.startsWith('--password='))?.slice(11);
/* ตัดอักขระที่ทำให้ต้อง escape ตอนเอาไปใส่ URL ออก — เหลือ 32 ตัวก็ยังเดายากมาก */
const password = given || randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

const TZ = 'Asia/Bangkok';
const APP = 'dgl_app';

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const { rows: who } = await client.query(
    'select current_database() as db, current_user as u',
  );
  const db = who[0].db;
  console.log(`ฐานข้อมูล ${db} · ต่อในนาม ${who[0].u}\n`);

  /* ---------- เขตเวลา ---------- */
  try {
    await client.query(`alter database ${quoteIdent(db)} set timezone = '${TZ}'`);
    console.log(`  ✓ ตั้งเขตเวลาของฐานข้อมูลเป็น ${TZ}`);
  } catch (err) {
    console.log(`  · ตั้งเขตเวลาระดับฐานข้อมูลไม่ได้ — ${err.message.split('\n')[0]}`);
    console.log('    จะตั้งที่ระดับ role แทน ซึ่งพอสำหรับแอป');
  }

  /* ---------- role ของแอป ---------- */
  const { rows: had } = await client.query(
    'select 1 from pg_roles where rolname = $1', [APP],
  );
  if (had.length === 0) {
    await client.query(`create role ${quoteIdent(APP)} login password ${quoteLit(password)}`);
    console.log(`  ✓ สร้าง role ${APP}`);
  } else {
    await client.query(`alter role ${quoteIdent(APP)} password ${quoteLit(password)}`);
    console.log(`  ✓ ตั้งรหัสผ่านใหม่ให้ role ${APP} ที่มีอยู่แล้ว`);
  }

  await client.query(`alter role ${quoteIdent(APP)} set timezone = '${TZ}'`);
  console.log(`  ✓ ตั้งเขตเวลาของ role เป็น ${TZ}`);

  /* ---------- สิทธิ์ ----------
     ไม่ให้เป็นเจ้าของตาราง จึงสั่งปิด force row level security ของตัวเองไม่ได้ */
  const grants = [
    `grant usage on schema public to ${APP}`,
    `grant select, insert, update, delete on all tables in schema public to ${APP}`,
    `grant usage, select on all sequences in schema public to ${APP}`,
    `grant execute on all functions in schema public to ${APP}`,
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${APP}`,
    `alter default privileges in schema public grant usage, select on sequences to ${APP}`,
    `alter default privileges in schema public grant execute on functions to ${APP}`,
    `grant usage on schema auth to ${APP}`,
    `grant execute on all functions in schema auth to ${APP}`,
    `alter default privileges in schema auth grant execute on functions to ${APP}`,
    `grant usage on schema ops to ${APP}`,
    `grant select, insert, update on ops.errors to ${APP}`,
    `grant usage, select on sequence ops.errors_id_seq to ${APP}`,
    `grant select on ops.migrations to ${APP}`,
  ];
  for (const g of grants) await client.query(g);
  console.log(`  ✓ ให้สิทธิ์อ่านเขียนข้อมูล แต่ไม่ได้เป็นเจ้าของตาราง`);

  /* ---------- ประกอบ URL ให้เลย ---------- */
  const u = new URL(url);
  u.username = APP;
  u.password = password;
  if (!u.searchParams.get('sslmode')) u.searchParams.set('sslmode', 'no-verify');

  emitSecret(u.toString(), {
    title: 'ตั้ง DATABASE_URL ของเว็บเป็นค่านี้',
    show: process.argv.includes('--show'),
  });
  console.log('  เก็บไว้ให้ดี — คำสั่งนี้ไม่แสดงรหัสผ่านซ้ำอีก');
  console.log('  ถ้าทำหาย ให้รันคำสั่งนี้ใหม่ จะได้รหัสใหม่มาแทน');
  console.log('');
  console.log('  ค่านี้ใช้โฮสต์เดียวกับ ADMIN_URL ที่ใส่มา — ถ้าจะเอาไปตั้งบนเครื่องจริง');
  console.log('  ที่แอปกับฐานข้อมูลอยู่ที่เดียวกัน ให้เปลี่ยนเป็นที่อยู่ภายในของผู้ให้บริการ\n');
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : err}`);
  const hint = sslHint(err);
  if (hint) console.error(`\n${hint}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

function quoteIdent(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
function quoteLit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
