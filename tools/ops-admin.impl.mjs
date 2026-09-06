#!/usr/bin/env node
/**
 * สร้างบัญชีผู้ให้บริการคนแรก
 *
 *   node tools/ops-admin.mjs --email=you@example.com --name="ชื่อ" \
 *     --app-url=https://drivegolight.onrender.com
 *
 * ตัวแปร — ADMIN_URL หรือ DATABASE_URL (จำเป็น)
 *
 * **ไก่กับไข่** คอนโซลต้องล็อกอินก่อนถึงจะใช้ได้ แต่ยังไม่มีใครในระบบที่มีสิทธิ์
 * สร้างบัญชีแรกให้ จึงต้องมีคำสั่งเปิดหัวหนึ่งครั้ง หลังจากนั้นเพิ่มคนอื่นได้จากในคอนโซล
 *
 * **ไม่รับรหัสผ่านทางบรรทัดคำสั่ง** — รหัสผ่านที่พิมพ์ในเทอร์มินัลไปค้างอยู่ใน
 * ประวัติคำสั่งเสมอ ตัวนี้พิมพ์ลิงก์ตั้งรหัสผ่านออกมาแทน ใช้กลไกเดียวกับที่อู่ใช้
 */
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { sslHint } from './sql-statements.mjs';

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
};

const email = arg('email');
const name = arg('name') ?? '';
const appUrl = (arg('app-url') ?? 'http://localhost:3100').replace(/\/+$/, '');
const days = Number(arg('days') ?? 7);

if (!email) {
  console.error(
    'ใช้: node tools/ops-admin.mjs --email=you@example.com [--name="ชื่อ"] [--app-url=...]',
  );
  process.exit(2);
}

const url = process.env.ADMIN_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('ต้องตั้ง ADMIN_URL หรือ DATABASE_URL ก่อน');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const { rows: exists } = await client.query(
    'select id, password_hash is not null as has_pw from ops.operators where email = $1',
    [email.trim().toLowerCase()],
  );

  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest();
  const expires = new Date(Date.now() + days * 86400_000);

  let id;
  if (exists[0]) {
    id = exists[0].id;
    console.log(`\nมีบัญชี ${email} อยู่แล้ว — ออกลิงก์ตั้งรหัสผ่านใหม่ให้`);
    if (exists[0].has_pw) {
      console.log('  (บัญชีนี้ตั้งรหัสผ่านไว้แล้ว ลิงก์ใหม่จะทับของเดิม)');
    }
  } else {
    const { rows } = await client.query(
      'insert into ops.operators (email, name) values ($1, $2) returning id',
      [email.trim().toLowerCase(), name],
    );
    id = rows[0].id;
    console.log(`\nสร้างบัญชีผู้ให้บริการแล้ว`);
  }

  await client.query('select ops.issue_setup_token($1, $2, $3)', [id, hash, expires]);

  console.log('\n─── บัญชีผู้ให้บริการ ───');
  console.log(`  อีเมล      ${email}`);
  console.log(`  ลิงก์ตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว หมดอายุ ${expires.toLocaleDateString('th-TH')})`);
  console.log(`  ${appUrl}/ops/setup/${token}`);
  console.log('\n  รหัสผ่านต้องยาวอย่างน้อย 14 ตัวอักษร');
  console.log('  ใครถือลิงก์ก็ตั้งรหัสผ่านได้ — เปิดเองทันที อย่าส่งต่อ');
} catch (err) {
  console.error(`\nทำงานไม่สำเร็จ`);
  console.error(err instanceof Error ? err.message : err);
  const hint = sslHint(err);
  if (hint) console.error(`\n${hint}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
