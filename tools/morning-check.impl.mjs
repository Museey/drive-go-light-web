/**
 * ตรวจระบบประจำเช้า — เว็บยังขึ้นไหม · ฐานข้อมูลเหลือที่เท่าไหร่ · มีข้อผิดพลาดไหม
 * · เมื่อวานอู่ใช้งานกันแค่ไหน ช่วงไหน · ลิขสิทธิ์ใกล้หมดหรือยัง
 *
 *   node tools/morning-check.mjs            อ่านง่าย
 *   node tools/morning-check.mjs --json     ให้ agent หรือโปรแกรมอื่นอ่าน
 *   node tools/morning-check.mjs --save     เก็บผลไว้ที่ ops-reports/ ไว้เทียบแนวโน้มวันถัดไป
 *
 * ตัวแปร (ใส่ไว้ใน .env.ops ที่รากของ repo ได้ — ไฟล์นี้ไม่ขึ้น git)
 *   ADMIN_URL    จำเป็น · External URL ของ Render ต่อท้าย ?sslmode=no-verify
 *   APP_URL      ค่าตั้งต้น https://app.drivegolight.com
 *   DB_QUOTA_MB  พื้นที่ฐานข้อมูลที่ซื้อไว้ · ค่าตั้งต้น 1024
 *
 * **อ่านอย่างเดียว ไม่เขียนอะไรลงฐานข้อมูล** — ไม่แม้แต่ติ๊กว่าอ่านข้อผิดพลาดแล้ว
 *
 * **ไม่พิมพ์ข้อมูลลูกค้า** — ข้อผิดพลาดออกแค่ชนิด หน้า และจำนวน ไม่ออกข้อความ
 * เพราะข้อความผิดพลาดมีข้อมูลลูกค้าติดมาเสมอ และผลของตัวนี้ถูกส่งให้ agent อ่าน
 * อยากเห็นข้อความเต็มให้ใช้ tools/errors.sh
 *
 * ใช้ ADMIN_URL และวนตั้ง app.tenant_id ทีละอู่ แบบเดียวกับ db-census.impl.mjs
 * — ดูเหตุผลเต็มที่นั่น สั้น ๆ คือนับรวดเดียวจะได้ 0 ทุกตารางโดยไม่มี error
 */
import pg from 'pg';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sslHint } from './sql-statements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = join(ROOT, 'ops-reports');
const asJson = process.argv.includes('--json');
const save = process.argv.includes('--save');

/* อ่าน .env.ops เอง ไม่ใช้ process.loadEnvFile เพราะเพิ่งมีใน Node 20.12
   ส่วน node ตัวตั้งต้นของเครื่องที่รันงานตอนเช้าเป็น 20.11 — ค่าที่ตั้งมากับคำสั่งชนะค่าในไฟล์ */
if (existsSync(join(ROOT, '.env.ops'))) {
  for (const line of readFileSync(join(ROOT, '.env.ops'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const url = process.env.ADMIN_URL;
const appUrl = (process.env.APP_URL || 'https://app.drivegolight.com').replace(/\/+$/, '');
const quotaMb = Number(process.env.DB_QUOTA_MB) || 1024;

if (!url) {
  console.error('ต้องตั้ง ADMIN_URL ก่อน — ใส่ไว้ใน .env.ops ที่รากของ repo หรือส่งมากับคำสั่ง');
  process.exit(2);
}

/** เกณฑ์ที่ถือว่าผิดปกติ — ปรับตรงนี้ที่เดียว */
const LIMIT = {
  slowMs: 3000,            // /healthz ช้ากว่านี้ = เครื่องตึงหรือเพิ่งรีสตาร์ต
  dbWarn: 0.6,             // สัดส่วนพื้นที่ฐานข้อมูลที่ใช้ไป
  dbRed: 0.8,
  connWarn: 0.8,           // สัดส่วน connection ที่ใช้ไปเทียบ max_connections
  errorsRed: 20,           // ข้อผิดพลาดใน 24 ชม. มากกว่านี้ = เป็นเรื่อง ไม่ใช่เหตุบังเอิญ
  expiringDays: 14,        // ลิขสิทธิ์เหลือไม่เกินนี้ = ต้องตามต่ออายุ
  dormantDays: 7,          // อู่ที่ไม่ออกเอกสารเลยนานเท่านี้ = ควรโทรถาม
};

const out = {
  at: new Date().toISOString(),
  day: '',                 // วันที่ของ "เมื่อวาน" ตามเวลาไทย — ช่วงที่นับกิจกรรม
  flags: [],               // { level: 'red' | 'yellow', text }
  health: null,
  db: null,
  errors: null,
  usage: null,
  tenants: [],
  trend: null,
};
const flag = (level, text) => out.flags.push({ level, text });

/* ---------------------------------------------------------------------
   เว็บ — ยิงจากข้างนอกแบบเดียวกับที่ลูกค้าเข้า ไม่ใช่ถามฐานข้อมูลเอา
   --------------------------------------------------------------------- */
const t0 = performance.now();
try {
  const res = await fetch(`${appUrl}/healthz`, { signal: AbortSignal.timeout(20_000) });
  const ms = Math.round(performance.now() - t0);
  const body = await res.json().catch(() => null);
  out.health = { url: `${appUrl}/healthz`, status: res.status, ms,
    ok: res.ok && body?.ok === true, failed: body?.failed ?? null };
} catch (err) {
  out.health = { url: `${appUrl}/healthz`, status: null,
    ms: Math.round(performance.now() - t0), ok: false,
    error: err instanceof Error ? err.message : String(err) };
}
if (!out.health.ok) {
  const why = out.health.failed?.length ? `ข้อที่ไม่ผ่าน: ${out.health.failed.join(', ')}`
    : out.health.error ?? `HTTP ${out.health.status}`;
  flag('red', `เว็บตอบ /healthz ไม่ผ่าน — ${why}`);
} else if (out.health.ms > LIMIT.slowMs) {
  flag('yellow', `เว็บตอบช้า ${out.health.ms} ms (เกณฑ์ ${LIMIT.slowMs} ms)`);
}

/* ---------------------------------------------------------------------
   ฐานข้อมูล
   --------------------------------------------------------------------- */
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();

  /* "เมื่อวาน" ตามปฏิทินไทย ไม่ใช่ 24 ชม. ย้อนหลัง — รายงานตอนเช้าต้องเทียบวันต่อวันได้ */
  const { rows: [span] } = await client.query(`
    select (d - 1)::text as day,
           ((d - 1)::timestamp at time zone 'Asia/Bangkok') as since,
           (d::timestamp at time zone 'Asia/Bangkok') as until
      from (select (now() at time zone 'Asia/Bangkok')::date as d) x`);
  out.day = span.day;

  const { rows: [size] } = await client.query(
    'select pg_database_size(current_database())::float8 as bytes');
  const { rows: [conn] } = await client.query(`
    select count(*)::int as total, count(*) filter (where state = 'active')::int as active
      from pg_stat_activity where datname = current_database()`);
  const maxConn = Number((await client.query('show max_connections')).rows[0].max_connections);
  out.db = { mb: +(size.bytes / 2 ** 20).toFixed(1), quotaMb,
    connections: conn.total, activeConnections: conn.active, maxConnections: maxConn };

  const used = out.db.mb / quotaMb;
  if (used >= LIMIT.dbRed) flag('red', `ฐานข้อมูลใช้ไป ${Math.round(used * 100)}% ของ ${quotaMb} MB — ขยายพื้นที่ก่อนเต็ม`);
  else if (used >= LIMIT.dbWarn) flag('yellow', `ฐานข้อมูลใช้ไป ${Math.round(used * 100)}% ของ ${quotaMb} MB`);
  if (conn.total >= maxConn * LIMIT.connWarn) {
    flag('yellow', `connection ใช้ไป ${conn.total}/${maxConn}`);
  }

  /* ข้อผิดพลาด — ชนิด หน้า จำนวน เท่านั้น ไม่เอาข้อความ (ดูหัวไฟล์) */
  const { rows: [err24] } = await client.query(`
    select count(*)::int as n,
           (select count(*)::int from ops.errors where not seen) as unseen
      from ops.errors where at > now() - interval '24 hours'`);
  const { rows: groups } = await client.query(`
    select kind, coalesce(path, '-') as path, count(*)::int as n,
           to_char(max(at) at time zone 'Asia/Bangkok', 'DD/MM HH24:MI') as last
      from ops.errors where at > now() - interval '24 hours'
     group by kind, coalesce(path, '-'), digest
     order by n desc limit 10`);
  out.errors = { last24h: err24.n, unseenTotal: err24.unseen, groups };
  if (err24.n >= LIMIT.errorsRed) flag('red', `ข้อผิดพลาด ${err24.n} รายการใน 24 ชม.`);
  else if (err24.n > 0) flag('yellow', `ข้อผิดพลาด ${err24.n} รายการใน 24 ชม.`);

  /* การล็อกอิน — auth.sessions ไม่มี RLS อ่านรวดเดียวได้
     session ที่หมดอายุถูกเก็บกวาดทิ้ง ตัวเลขนี้จึงใช้ดูได้แค่ช่วงสั้น ๆ */
  const { rows: logins } = await client.query(`
    select tenant_id,
           count(*) filter (where created_at >= $1 and created_at < $2)::int as logins,
           count(distinct user_id) filter (where last_seen_at >= $1 and created_at < $2)::int as users
      from auth.sessions group by tenant_id`, [span.since, span.until]);
  const loginOf = new Map(logins.map((r) => [r.tenant_id, r]));

  /* รายอู่ — ต้องตั้ง app.tenant_id ก่อนทุกครั้ง และใส่ where tenant_id เองด้วย */
  const { rows: tenants } = await client.query(
    'select id, name, created_at from tenants order by name');
  const hours = Array(24).fill(0);

  for (const t of tenants) {
    await client.query(`select set_config('app.tenant_id', $1, false)`, [t.id]);
    const { rows: [d] } = await client.query(`
      select count(*) filter (where created_at >= $2 and created_at < $3)::int as yesterday,
             count(*) filter (where created_at >= $3 - interval '7 days' and created_at < $3)::int as week,
             to_char(max(created_at) at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as last_doc
        from documents where tenant_id = $1`, [t.id, span.since, span.until]);
    const { rows: byHour } = await client.query(`
      select extract(hour from created_at at time zone 'Asia/Bangkok')::int as h, count(*)::int as n
        from documents
       where tenant_id = $1 and created_at >= $2 and created_at < $3
       group by 1`, [t.id, span.since, span.until]);
    for (const r of byHour) hours[r.h] += r.n;
    const { rows: [sub] } = await client.query(`
      select max(expires_on)::text as expires, (max(expires_on) - current_date)::int as days_left
        from subscriptions where tenant_id = $1`, [t.id]);

    const ageDays = (Date.now() - new Date(t.created_at).getTime()) / 86_400_000;
    const row = {
      id: String(t.id).slice(0, 8), name: t.name,
      docsYesterday: d.yesterday, docs7d: d.week, lastDoc: d.last_doc,
      logins: loginOf.get(t.id)?.logins ?? 0, users: loginOf.get(t.id)?.users ?? 0,
      expires: sub.expires, daysLeft: sub.days_left,
      dormant: d.week === 0 && ageDays >= LIMIT.dormantDays,
    };
    out.tenants.push(row);

    if (row.daysLeft !== null && row.daysLeft < 0) {
      flag('yellow', `${t.name} — ลิขสิทธิ์หมดแล้วตั้งแต่ ${row.expires}`);
    } else if (row.daysLeft !== null && row.daysLeft <= LIMIT.expiringDays) {
      flag('yellow', `${t.name} — ลิขสิทธิ์เหลือ ${row.daysLeft} วัน (${row.expires})`);
    }
  }
  await client.query(`select set_config('app.tenant_id', '', false)`);

  out.usage = {
    docs: out.tenants.reduce((s, t) => s + t.docsYesterday, 0),
    logins: out.tenants.reduce((s, t) => s + t.logins, 0),
    users: out.tenants.reduce((s, t) => s + t.users, 0),
    activeTenants: out.tenants.filter((t) => t.docsYesterday > 0).length,
    hours,
  };
} catch (err) {
  flag('red', `ต่อหรืออ่านฐานข้อมูลไม่สำเร็จ — ${err instanceof Error ? err.message : err}`);
  const hint = sslHint(err);
  if (hint) flag('red', hint);
  /* Internal URL ของ Render (dpg-xxx-a ไม่มีโดเมนต่อท้าย) ใช้ได้เฉพาะในเครือข่ายของ Render */
  if (/ENOTFOUND dpg-[^.\s]+$/.test(String(err?.message))) {
    flag('red', 'นี่คือ Internal URL — จากเครื่องเราต้องใช้ External URL (ลงท้าย .singapore-postgres.render.com)');
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

/* ---------------------------------------------------------------------
   แนวโน้ม — เทียบกับผลที่ --save ไว้ไม่เกิน 7 ไฟล์ก่อนหน้า
   --------------------------------------------------------------------- */
const history = existsSync(REPORTS)
  ? readdirSync(REPORTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
      .map((f) => { try { return JSON.parse(readFileSync(join(REPORTS, f), 'utf8')); } catch { return null; } })
      .filter((r) => r?.day && r.day < out.day && r.usage && r.db)
      .slice(-7)
  : [];
if (history.length && out.usage && out.db) {
  const first = history[0];
  const spanDays = (Date.parse(out.day) - Date.parse(first.day)) / 86_400_000;
  out.trend = {
    days: history.length,
    avgDocs: Math.round(history.reduce((s, r) => s + r.usage.docs, 0) / history.length),
    mbPerDay: spanDays > 0 ? +((out.db.mb - first.db.mb) / spanDays).toFixed(2) : null,
  };
}

if (save && out.day) {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(join(REPORTS, `${out.day}.json`), JSON.stringify(out, null, 2) + '\n');
}

/* ---------------------------------------------------------------------
   พิมพ์ผล
   --------------------------------------------------------------------- */
if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const p = (s = '') => console.log(s);
  const bkk = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 16);
  p(`\nตรวจระบบ DriveGoLight! · ${bkk} · กิจกรรมของวันที่ ${out.day || '—'}\n`);

  if (out.flags.length === 0) p('✓ ไม่มีอะไรผิดปกติ');
  for (const f of out.flags) p(`${f.level === 'red' ? '✗ ด่วน ' : '! ดู   '} ${f.text}`);
  p();

  const h = out.health;
  p(`เว็บ         ${h.ok ? 'ปกติ' : 'ไม่ผ่าน'} · ${h.ms} ms · ${h.url}`);
  if (out.db) {
    const growth = out.trend?.mbPerDay != null ? ` · โตวันละ ~${out.trend.mbPerDay} MB` : '';
    p(`ฐานข้อมูล    ${out.db.mb} / ${out.db.quotaMb} MB${growth} · connection ${out.db.connections}/${out.db.maxConnections}`);
  }
  if (out.errors) {
    p(`ข้อผิดพลาด   24 ชม. ${out.errors.last24h} รายการ · ยังไม่ได้อ่านทั้งหมด ${out.errors.unseenTotal}`);
    for (const g of out.errors.groups) p(`             ${g.kind.padEnd(7)} ${g.path}  ${g.n} ครั้ง  ล่าสุด ${g.last}`);
    if (out.errors.groups.length) p('             ดูข้อความเต็มด้วย tools/errors.sh');
  }

  if (out.usage) {
    const avg = out.trend ? ` (เฉลี่ย ${out.trend.days} วันก่อน ${out.trend.avgDocs})` : '';
    p(`\nการใช้งาน    เอกสารใหม่ ${out.usage.docs} ใบ${avg} · อู่ที่ออกเอกสาร ${out.usage.activeTenants}/${out.tenants.length}`);
    p(`             ล็อกอิน ${out.usage.logins} ครั้ง · ผู้ใช้ ${out.usage.users} คน`);

    const peak = Math.max(...out.usage.hours);
    if (peak > 0) {
      p('\nเอกสารรายชั่วโมง');
      out.usage.hours.forEach((n, hr) => {
        if (n > 0) p(`  ${String(hr).padStart(2, '0')}:00  ${'█'.repeat(Math.max(1, Math.round((n / peak) * 30)))} ${n}`);
      });
    }

    p('\nรายอู่         เมื่อวาน  7 วัน  ผู้ใช้  ลิขสิทธิ์ถึง');
    for (const t of out.tenants) {
      p(`  ${t.id}  ${String(t.docsYesterday).padStart(6)} ${String(t.docs7d).padStart(6)} ${String(t.users).padStart(6)}   ${t.expires ?? '—'}  ${t.name}`);
    }
    const dormant = out.tenants.filter((t) => t.dormant);
    if (dormant.length) {
      p(`\nไม่ได้ออกเอกสารเลย ${LIMIT.dormantDays} วัน: ${dormant.map((t) => t.name).join(' · ')}`);
    }
  }
  p();
}
