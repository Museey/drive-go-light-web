#!/usr/bin/env node
/**
 * สร้างบัญชีผู้ให้บริการคนแรก
 *
 *   node tools/ops-admin.mjs --email=you@example.com --name="ชื่อ" \
 *     --app-url=https://drivegolight.onrender.com
 *
 *   node tools/ops-admin.mjs --status     ดูสถานะทุกบัญชี ไม่แก้อะไร
 *   node tools/ops-admin.mjs --audit      ไทม์ไลน์ว่าเกิดอะไรขึ้นบ้าง
 *   node tools/ops-admin.mjs --unlock --email=you@example.com   ปลดล็อกที่ติดจากกรอกผิด
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

const wantStatus = process.argv.includes('--status');
const wantAudit = process.argv.includes('--audit');
const wantUnlock = process.argv.includes('--unlock');
const email = arg('email');
const name = arg('name') ?? '';
const appUrl = (arg('app-url') ?? 'http://localhost:3100').replace(/\/+$/, '');
const days = Number(arg('days') ?? 7);

if (!email && !wantStatus && !wantAudit) {
  console.error(
    'ใช้: node tools/ops-admin.mjs --email=you@example.com [--name="ชื่อ"] [--app-url=...]\n'
    + '     node tools/ops-admin.mjs --status\n'
    + '     node tools/ops-admin.mjs --unlock --email=you@example.com',
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

  /**
   * ดูสถานะอย่างเดียว ไม่แก้อะไร
   *
   * มีไว้ตอบคำถามว่า "ทำไมล็อกอินไม่ผ่าน" ซึ่งมีได้หลายสาเหตุที่หน้าเว็บ
   * ตั้งใจไม่บอกให้ชัด (เพื่อไม่ให้คนเดาอีเมลได้) — ผู้ดูแลที่ต่อฐานได้ควรเห็นของจริง
   */
  if (wantStatus) {
    const { rows } = await client.query(`
      select o.email, o.name, o.active,
             o.password_hash is not null as has_pw,
             o.failed_attempts, o.locked_until, o.last_login_at,
             (select count(*) from ops.sessions s
               where s.operator_id = o.id and s.expires_at > now()) as live_sessions,
             (select count(*) from ops.sessions s
               where s.operator_id = o.id) as all_sessions,
             (select max(s.expires_at) from ops.sessions s
               where s.operator_id = o.id) as last_expiry,
             (select count(*) from ops.setup_tokens t
               where t.operator_id = o.id and t.used_at is null and t.expires_at > now())
               as open_links
        from ops.operators o order by o.email`);

    if (!rows.length) {
      console.log('\nยังไม่มีบัญชีผู้ให้บริการเลย — สร้างด้วย --email=');
    }
    for (const r of rows) {
      const locked = r.locked_until && new Date(r.locked_until) > new Date();
      console.log(`\n─── ${r.email} ───`);
      console.log(`  ชื่อ                ${r.name || '—'}`);
      console.log(`  ตั้งรหัสผ่านแล้ว      ${r.has_pw ? 'ใช่' : '**ยังไม่ได้ตั้ง** — ต้องเปิดลิงก์ก่อน'}`);
      console.log(`  เปิดใช้งาน           ${r.active ? 'ใช่' : '**ถูกปิดอยู่**'}`);
      console.log(`  กรอกผิดติดกัน        ${r.failed_attempts} ครั้ง`);
      console.log(`  ถูกล็อก             ${locked
        ? `**ใช่ ถึง ${new Date(r.locked_until).toLocaleString('th-TH')}** — ปลดด้วย --unlock`
        : 'ไม่'}`);
      console.log(`  เข้าใช้ล่าสุด        ${r.last_login_at
        ? new Date(r.last_login_at).toLocaleString('th-TH') : 'ยังไม่เคย'}`);
      console.log(`  session ทั้งหมดในตาราง  ${r.all_sessions} (ยังไม่หมดอายุ ${r.live_sessions})`);
      if (Number(r.all_sessions) > 0) {
        console.log(`  อันที่หมดอายุช้าสุด    ${new Date(r.last_expiry).toLocaleString('th-TH')}`);
      }
      console.log(`  ลิงก์ตั้งรหัสผ่านที่ยังไม่ใช้ ${r.open_links}`);
    }
    console.log('');
    await client.end();
    process.exit(0);
  }

  /**
   * ไทม์ไลน์จาก ops.audit
   *
   * ตารางนี้เขียนโดยฟังก์ชันในฐานข้อมูลเอง ไม่ใช่โดยโค้ดหน้าเว็บ จึงเชื่อได้ว่าครบ
   * มีไว้ตอบว่า "เกิดอะไรขึ้นตามลำดับ" ซึ่งเดาจากสถานะปลายทางอย่างเดียวไม่ได้
   */
  if (wantAudit) {
    const { rows } = await client.query(`
      select at, operator_email, action, tenant_id, detail
        from ops.audit order by at desc limit 40`);

    if (!rows.length) {
      console.log('\nยังไม่มีบันทึกการใช้งานเลย — แปลว่ายังไม่เคยมีใครล็อกอินสำเร็จ');
    } else {
      console.log('\nใหม่สุดอยู่บนสุด\n');
      for (const r of rows) {
        const d = r.detail && Object.keys(r.detail).length ? '  ' + JSON.stringify(r.detail) : '';
        console.log(`  ${new Date(r.at).toLocaleString('th-TH').padEnd(22)} `
          + `${String(r.action).padEnd(20)} ${r.operator_email}${d}`);
      }
    }
    console.log('');
    await client.end();
    process.exit(0);
  }

  if (wantUnlock) {
    const { rowCount } = await client.query(
      `update ops.operators set failed_attempts = 0, locked_until = null
        where email = $1`, [email.trim().toLowerCase()]);
    console.log(rowCount ? `\nปลดล็อก ${email} แล้ว` : `\nไม่พบบัญชี ${email}`);
    await client.end();
    process.exit(0);
  }

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
