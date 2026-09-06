#!/usr/bin/env node
/**
 * ตรวจว่าฐานข้อมูลที่ได้มา ทำสิ่งที่แอปต้องการได้ครบไหม
 *
 *   DATABASE_URL='postgresql://...' node tools/probe-db.mjs
 *
 * มีไว้ใช้ก่อนย้ายขึ้นแพลตฟอร์มที่เราไม่ได้เป็นเจ้าของ Postgres เอง
 * (Render · Railway · Neon และคล้ายกัน) เพราะ db/app-role.sql เขียนบนสมมติฐาน
 * ว่าเราเป็น superuser ของเซิร์ฟเวอร์ ซึ่งบนบริการแบบ managed มักไม่จริง
 *
 * **ระบบใช้ role สองบทบาท และตัวตรวจนี้บอกว่า role ที่ให้มาทำได้บทบาทไหน**
 *   ผู้ดูแล  สร้างตาราง ติดตั้ง extension รันไมเกรชัน — ใช้ตอน deploy เท่านั้น
 *   แอป      อ่านเขียนข้อมูล และ **ต้องข้าม RLS ไม่ได้** — ใช้ตอนทำงานปกติ
 *
 * บนเครื่องที่เราคุมเอง สองบทบาทนี้เป็นคนละ role (postgres กับ dgl_app)
 * บนแพลตฟอร์มมักได้ role เดียว จึงต้องดูว่ามันทำได้ทั้งสองอย่างหรือเปล่า
 *
 * **ปลอดภัยกับฐานที่มีข้อมูลจริง** — ทุกอย่างที่เขียนถูกห่อด้วยทรานแซกชันแล้ว rollback
 * ไม่มีอะไรค้างไว้ และไม่แตะข้อมูลของอู่เลย
 */
import pg from 'pg';
import { sslHint } from './sql-statements.mjs';

const url = process.env.DATABASE_URL || process.env.ADMIN_URL;
if (!url) {
  console.error('ต้องตั้ง DATABASE_URL ก่อน เช่น');
  console.error("  DATABASE_URL='postgresql://user:pass@host/db' node tools/probe-db.mjs");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });

const ok = (s) => `  ✓ ${s}`;
const no = (s) => `  ✗ ${s}`;
const dash = (s) => `  · ${s}`;

/** ลองทำอะไรบางอย่างแล้วย้อนกลับเสมอ — คืน true ถ้าทำได้ */
async function tryRollback(sql) {
  try {
    await client.query('begin');
    await client.query(sql);
    return { can: true };
  } catch (err) {
    return { can: false, why: err.message.split('\n')[0] };
  } finally {
    await client.query('rollback').catch(() => {});
  }
}

const results = {};

try {
  await client.connect();

  /* ---------- ข้อมูลพื้นฐาน ---------- */
  const ver = await client.query('select version() as v, current_database() as db, current_user as u');
  const major = Number(/PostgreSQL (\d+)/.exec(ver.rows[0].v)?.[1] ?? 0);
  results.major = major;

  console.log('\n─── ฐานข้อมูล ───');
  console.log(dash(`${ver.rows[0].v.split(',')[0]}`));
  console.log(dash(`ฐานข้อมูล ${ver.rows[0].db} · ต่อในนาม ${ver.rows[0].u}`));
  console.log(major >= 14
    ? ok('รุ่นใหม่พอ (แอปพัฒนาบน 16 · ต้องการอย่างน้อย 14)')
    : no(`รุ่น ${major} เก่าเกินไป — แอปใช้ไวยากรณ์ที่ต้องการอย่างน้อย 14`));

  /* ---------- สิทธิ์ของ role ---------- */
  const role = await client.query(
    `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
     from pg_roles where rolname = current_user`,
  );
  const r = role.rows[0] ?? {};
  results.super = !!r.rolsuper;
  results.bypass = !!r.rolbypassrls;
  results.createrole = !!r.rolcreaterole;

  console.log('\n─── สิทธิ์ของ role ที่ได้มา ───');
  console.log(dash(`superuser      ${r.rolsuper ? 'ใช่' : 'ไม่'}`));
  console.log(dash(`bypassrls      ${r.rolbypassrls ? 'ใช่' : 'ไม่'}`));
  console.log(dash(`สร้าง role ได้  ${r.rolcreaterole ? 'ใช่' : 'ไม่'}`));

  /* ข้อบังคับของแอป — ต่อด้วย role ที่ข้าม RLS ได้ = แอปปฏิเสธไม่ยอมเริ่มทำงาน */
  if (results.super || results.bypass) {
    console.log(no('role นี้ข้าม Row Level Security ได้ — แอปจะปฏิเสธไม่ยอมเริ่มทำงาน'));
    console.log('    (เป็นพฤติกรรมที่ถูกต้อง ไม่ใช่บั๊ก — ข้อมูลจะรั่วข้ามอู่ถ้ายอมให้ใช้)');
  } else {
    console.log(ok('ไม่ข้าม RLS — แอปต่อด้วย role นี้ได้ตรง ๆ'));
  }

  /* ---------- เจ้าของฐานข้อมูล ---------- */
  const owner = await client.query(
    `select pg_get_userbyid(d.datdba) = current_user as is_owner
     from pg_database d where d.datname = current_database()`,
  );
  results.owner = !!owner.rows[0]?.is_owner;
  console.log(results.owner
    ? ok('เป็นเจ้าของฐานข้อมูล')
    : dash('ไม่ได้เป็นเจ้าของฐานข้อมูล (บางคำสั่งอาจทำไม่ได้)'));

  /* ---------- สร้าง role ได้ไหม ---------- */
  console.log('\n─── บทบาทผู้ดูแล: สร้าง role แยกให้แอปได้ไหม ───');
  const mk = await tryRollback(`create role dgl_probe_tmp login password 'x'`);
  results.canCreateRole = mk.can;
  console.log(mk.can ? ok('สร้าง role ใหม่ได้') : no(`สร้าง role ไม่ได้ — ${mk.why}`));

  const attr = mk.can
    ? await tryRollback(
        `create role dgl_probe_tmp2 login password 'x';
         alter role dgl_probe_tmp2 nosuperuser nobypassrls nocreatedb nocreaterole`)
    : { can: false, why: 'ข้ามเพราะสร้าง role ไม่ได้' };
  results.canSetAttrs = attr.can;
  console.log(attr.can
    ? ok('ตั้งคุณสมบัติ nosuperuser / nobypassrls ให้ role ได้')
    : no(`ตั้งคุณสมบัติไม่ได้ — ${attr.why}`));

  /* ---------- extension ---------- */
  console.log('\n─── extension ที่สคีมาต้องใช้ ───');
  for (const ext of ['pgcrypto', 'citext']) {
    const have = await client.query(
      'select count(*)::int as n from pg_extension where extname = $1', [ext],
    );
    if (have.rows[0].n > 0) { console.log(ok(`${ext} ติดตั้งไว้แล้ว`)); results[ext] = true; continue; }
    const t = await tryRollback(`create extension "${ext}"`);
    results[ext] = t.can;
    console.log(t.can ? ok(`${ext} ติดตั้งได้`) : no(`${ext} ติดตั้งไม่ได้ — ${t.why}`));
  }

  /* ---------- เขตเวลา ---------- */
  console.log('\n─── เขตเวลา ───');
  const tz = await client.query(
    `select current_setting('timezone') as tz, current_date::text as d`,
  );
  const appDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  results.tzMatches = tz.rows[0].d === appDate;

  /* เทียบ "ชดเชยจาก UTC" ไม่ใช่เทียบวันที่วันนี้
     เพราะ UTC กับไทยเป็นวันเดียวกันตลอด 17 ชั่วโมงของทุกวัน — เทียบวันที่เฉย ๆ
     จะผ่านเกือบตลอด แล้วไปพังจริงตอนตีหนึ่งถึงเจ็ดโมงเช้าซึ่งไม่มีใครนั่งดู */
  const off = await client.query(
    `select extract(epoch from (now() at time zone current_setting('timezone')
                              - now() at time zone 'UTC')) / 3600 as h`,
  );
  const hours = Number(off.rows[0].h);
  results.tzMatches = Math.abs(hours - 7) < 0.01;

  console.log(dash(`เขตเวลาของฐานข้อมูล ${tz.rows[0].tz} (UTC${hours >= 0 ? '+' : ''}${hours})`));
  console.log(results.tzMatches
    ? ok('ชดเชยตรงกับเวลาไทย (UTC+7)')
    : no(`ชดเชยไม่ตรง — ไทยคือ UTC+7 แต่ฐานข้อมูลเป็น UTC${hours >= 0 ? '+' : ''}${hours}`));
  if (!results.tzMatches) {
    console.log(`    ตอนนี้ฐานข้อมูลว่า ${tz.rows[0].d} เวลาไทยว่า ${appDate}`);
    console.log('    วันนี้อาจตรงกันบังเอิญ แต่ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าจะต่างกันหนึ่งวัน');
  }

  const alterDb = await tryRollback(
    `alter database ${JSON.stringify(ver.rows[0].db).replace(/"/g, '"')} set timezone = 'Asia/Bangkok'`
      .replace(/"/g, '"'),
  );
  results.canAlterDb = alterDb.can;
  console.log(alterDb.can
    ? ok('ตั้งเขตเวลาระดับฐานข้อมูลได้')
    : dash(`ตั้งเขตเวลาระดับฐานข้อมูลไม่ได้ — ${alterDb.why}`));

  const alterRole = await tryRollback(`alter role current_user set timezone = 'Asia/Bangkok'`);
  results.canAlterRole = alterRole.can;
  console.log(alterRole.can
    ? ok('ตั้งเขตเวลาระดับ role ได้')
    : dash(`ตั้งเขตเวลาระดับ role ไม่ได้ — ${alterRole.why}`));

  /* ---------- RLS ใช้ได้จริงไหม ---------- */
  console.log('\n─── บทบาทผู้ดูแล: สร้างตารางที่บังคับ RLS ได้ไหม ───');
  const rls = await tryRollback(`
    create table dgl_probe_rls (tenant_id uuid not null, v text);
    alter table dgl_probe_rls enable row level security;
    alter table dgl_probe_rls force row level security;
    create policy p on dgl_probe_rls using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  `);
  results.canRls = rls.can;
  console.log(rls.can
    ? ok('สร้างตารางที่บังคับ RLS ได้ (รวม force ซึ่งกันแม้เจ้าของตาราง)')
    : dash(`สร้างตารางไม่ได้ — ${rls.why}`));
  if (!rls.can) {
    console.log('    ถ้าตั้งใจให้ role นี้เป็นบทบาทแอปอย่างเดียว แบบนี้ถูกต้องแล้ว');
    console.log('    แต่ต้องมี role อื่นที่สร้างตารางได้ไว้รันไมเกรชัน');
  }

  /* ---------- สรุป ---------- */
  console.log('\n═══ สรุป ═══');

  /* บทบาทแอป — ข้อเดียวที่ห้ามพลาดคือห้ามข้าม RLS */
  const appOk = !results.super && !results.bypass;
  console.log(appOk
    ? ok('บทบาทแอป — ใช้ role นี้เป็น DATABASE_URL ของแอปได้')
    : no('บทบาทแอป — ใช้ไม่ได้ เพราะ role นี้ข้าม RLS ได้ แอปจะปฏิเสธไม่ยอมเริ่มทำงาน'));

  /* บทบาทผู้ดูแล — ต้องสร้างตารางและติดตั้ง extension ได้ */
  const adminOk = results.canRls && results.pgcrypto && results.citext && results.major >= 14;
  console.log(adminOk
    ? ok('บทบาทผู้ดูแล — ใช้ role นี้รันไมเกรชันได้')
    : dash('บทบาทผู้ดูแล — role นี้รันไมเกรชันไม่ได้ ต้องใช้ role อื่น'));

  console.log('');
  if (results.major < 14) {
    console.log(no('Postgres รุ่นเก่าเกินไป — ใช้กับแอปนี้ไม่ได้'));
    process.exitCode = 1;
  } else if (appOk && adminOk) {
    console.log('ใช้ role เดียวนี้ได้ทั้งสองบทบาท — ตั้ง DATABASE_URL ชี้มาที่นี่ได้เลย');
    console.log(dash('ไม่ต้องรัน db/app-role.sql เพราะ role นี้ไม่ข้าม RLS อยู่แล้ว'));
  } else if (!appOk && results.canCreateRole && results.canSetAttrs) {
    console.log('role นี้ข้าม RLS ได้ ห้ามให้แอปใช้ — แต่สร้าง role แยกให้แอปได้');
    console.log(dash('รัน db/app-role-managed.sql แล้วให้ DATABASE_URL ชี้ไปที่ dgl_app'));
    console.log(dash('ส่วนไมเกรชันรันด้วย role นี้ตามเดิม'));
  } else if (!appOk) {
    console.log(no('role นี้ข้าม RLS ได้ และสร้าง role แยกให้แอปไม่ได้'));
    console.log('   ใช้กับแอปนี้ไม่ได้ — แนะนำให้กลับไปทาง VPS (ดู DEPLOY.md ข้อ 0)');
    process.exitCode = 1;
  } else {
    console.log('role นี้เป็นบทบาทแอปได้ แต่รันไมเกรชันไม่ได้');
    console.log(dash('ต้องหา role ที่สร้างตารางได้มารันไมเกรชันก่อน แล้วค่อยให้แอปใช้ role นี้'));
    console.log(dash('บนแพลตฟอร์มมักเป็น role เดียวกัน ให้ลองรัน probe ด้วย connection string ของผู้ดูแล'));
  }

  if (!results.tzMatches) {
    console.log('\nเรื่องเขตเวลา — ต้องแก้ก่อน ไม่งั้นแอปจะปฏิเสธไม่ยอมทำงาน');
    if (results.canAlterDb) console.log(dash("alter database ... set timezone = 'Asia/Bangkok'"));
    else if (results.canAlterRole) console.log(dash("alter role ... set timezone = 'Asia/Bangkok'"));
    else console.log(dash('ตั้งที่ฐานไม่ได้ — ต้องส่งเขตเวลาไปกับ connection แทน (แอปรองรับ)'));
  }
  console.log('');
} catch (err) {
  const hint = sslHint(err);
  console.error(`\nต่อฐานข้อมูลไม่ได้ — ${err instanceof Error ? err.message : err}`);
  if (hint) console.error(`\n${hint}`);
  process.exitCode = 2;
} finally {
  await client.end().catch(() => {});
}
