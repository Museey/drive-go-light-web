#!/usr/bin/env node
/**
 * ตรวจความพร้อมก่อนเปิดให้คนนอกใช้
 *
 *   APP_URL=https://app.drivegolight.com ADMIN_URL='postgresql://...' \
 *     node tools/preflight.mjs
 *
 * **ทำไมเป็นสคริปต์ ไม่ใช่รายการให้ติ๊กเอง** — รายการที่ต้องเอาตาไล่มักถูกติ๊กผ่าน
 * โดยไม่ได้ดูจริง โดยเฉพาะข้อที่ผ่านมาตลอดสิบครั้งก่อนหน้า ตัวที่ตรวจเองไม่โกหก
 * และรันซ้ำได้ทุกครั้งที่ deploy ไม่ใช่แค่ครั้งเดียวก่อนเปิด
 *
 * ตรวจสองฝั่ง — เว็บที่คนนอกเข้าถึงได้ กับฐานข้อมูลที่ต้องใช้สิทธิ์ผู้ดูแล
 * ใส่มาอย่างเดียวก็ได้ อีกฝั่งจะข้ามไปพร้อมบอกว่าข้าม
 *
 * สิ่งที่ตรวจแทนคนไม่ได้ (สำรองข้อมูล การแจ้งเตือน) อยู่ใน DEPLOY.md ข้อ 8
 */
import pg from 'pg';
import { migrationFiles } from './migrate.impl.mjs';

const appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
const adminUrl = process.env.ADMIN_URL;

if (!appUrl && !adminUrl) {
  console.error(
    'ต้องใส่อย่างน้อยหนึ่งอย่าง\n'
    + "  APP_URL=https://<โดเมน> ADMIN_URL='postgresql://...' node tools/preflight.mjs",
  );
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

/**
 * ตรวจหนึ่งข้อโดยไม่ให้ข้อที่พังไปหยุดข้ออื่น
 *
 * เครื่องมือตรวจความพร้อมที่หยุดกลางทางแล้วสรุปว่า "ผ่านครบ" อันตรายกว่าไม่มีเลย
 * ทุกข้อจึงถูกห่อไว้ และข้อที่ตรวจไม่ได้นับเป็น **ไม่ผ่าน** ไม่ใช่ข้าม
 */
async function step(name, fn) {
  try {
    const [ok, detail] = await fn();
    check(name, ok, detail ?? '');
  } catch (err) {
    check(name, false, `ตรวจไม่ได้ — ${(err instanceof Error ? err.message : String(err)).slice(0, 70)}`);
  }
}

/* ---------- ฝั่งเว็บ ---------- */

async function head(path, opts = {}) {
  const res = await fetch(appUrl + path, { redirect: 'manual', ...opts });
  return { status: res.status, location: res.headers.get('location') ?? '', res };
}

async function checkWeb() {
  /* 1. เข้าด้วย http ต้องถูกส่งไป https — ไม่งั้นคุกกี้ session วิ่งแบบไม่เข้ารหัสได้ */
  const host = new URL(appUrl).hostname;
  if (['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.log('  ข้ามการตรวจ https — APP_URL ชี้ไปที่เครื่องตัวเอง');
  } else if (!appUrl.startsWith('https:')) {
    check('APP_URL เป็น https', false, 'ตรวจเครื่องจริงต้องใช้ https ไม่ใช่ http');
  } else {
    try {
      const plain = appUrl.replace(/^https:/, 'http:');
      const res = await fetch(plain + '/login', { redirect: 'manual' });
      const to = res.headers.get('location') ?? '';
      check('http ถูกส่งต่อไป https',
        res.status >= 300 && res.status < 400 && to.startsWith('https:'),
        `ได้ ${res.status} → ${to || '(ไม่มี location)'}`);
    } catch (err) {
      check('http ถูกส่งต่อไป https', false, String(err).slice(0, 60));
    }
  }

  /* 2. ระบบพร้อมจริง — ต่อฐานได้ เขตเวลาตรง ไมเกรชันครบ */
  try {
    const res = await fetch(appUrl + '/healthz');
    const body = await res.json();
    check('/healthz เขียว', res.ok && body.ok === true && (body.failed?.length ?? 0) === 0,
      JSON.stringify(body));
  } catch (err) {
    check('/healthz เขียว', false, String(err).slice(0, 60));
  }

  /* 3. หน้านโยบายต้องเปิดได้โดยไม่ต้องล็อกอิน — เป็นข้อกำหนดของ PDPA */
  try {
    const r = await head('/privacy');
    check('/privacy เปิดได้โดยไม่ต้องล็อกอิน', r.status === 200, `ได้ ${r.status}`);
  } catch (err) {
    check('/privacy เปิดได้โดยไม่ต้องล็อกอิน', false, String(err).slice(0, 60));
  }

  /**
   * 4. หน้าที่มีข้อมูลของอู่ ต้องไม่เปิดได้โดยไม่ล็อกอิน
   *
   * ไล่หลายเส้นทางเพราะแต่ละอันกันด้วยกลไกคนละตัว — หน้าอู่ใช้ requireSession
   * หน้าคอนโซลใช้ requireOperator และ route ส่งไฟล์ใช้ requireExport
   */
  const GUARDED = [
    ['/', 'หน้าแรกของอู่'],
    ['/stock', 'ทะเบียนสินค้า'],
    ['/settings/export', 'ดาวน์โหลดไฟล์สำรอง'],
    ['/finance/csv', 'ส่งออกการเงิน'],
    ['/ops', 'คอนโซลผู้ให้บริการ'],
    ['/ops/new', 'เปิดอู่ใหม่'],
    ['/ops/audit', 'บันทึกการใช้งานคอนโซล'],
  ];
  const open = [];
  for (const [path, label] of GUARDED) {
    try {
      const r = await head(path);
      if (r.status === 200) open.push(`${label} (${path})`);
    } catch { /* ต่อไม่ได้ = เข้าไม่ได้ ถือว่าผ่าน */ }
  }
  /* /privacy ที่ผ่านไปข้างบนคือตัวคุมว่าเราเห็นสถานะ 200 ได้จริง
     ถ้าเน็ตพังทุกเส้นทาง ข้อนั้นจะแดงก่อน ข้อนี้จึงไม่ผ่านแบบว่างเปล่า */
  check('หน้าที่มีข้อมูลของอู่ปิดไว้ครบ ตอนยังไม่ล็อกอิน', open.length === 0,
    open.length ? `เปิดได้: ${open.join(' · ')}` : `ตรวจ ${GUARDED.length} เส้นทาง`);
}

/* ---------- ฝั่งฐานข้อมูล ---------- */

async function checkDb() {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  try {
    /* เขตเวลา — ผิดแล้ววันที่บนเอกสารกับสต๊อกจะเพี้ยนโดยไม่มีอาการ */
    await step('เขตเวลาของฐานข้อมูลเป็น Asia/Bangkok', async () => {
      const tz = (await q('show timezone'))[0].TimeZone;
      return [tz === 'Asia/Bangkok', tz];
    });

    /* ไมเกรชันครบตามไฟล์ในโฟลเดอร์ db/ ของโค้ดชุดที่กำลังตรวจ */
    await step('ไมเกรชันรันครบ', async () => {
      const ran = (await q('select filename from ops.migrations order by filename'))
        .map((r) => r.filename);
      const missing = migrationFiles().filter((f) => !ran.includes(f));
      return [missing.length === 0,
        missing.length ? `ยังไม่ได้รัน ${missing.join(', ')}` : `${ran.length} ไฟล์`];
    });

    const app = await q(
      'select rolsuper, rolbypassrls from pg_roles where rolname = $1', ['dgl_app']);
    check('มี role dgl_app', app.length > 0);

    await step('dgl_app ไม่ใช่ superuser และไม่มี BYPASSRLS', async () => {
      if (!app.length) return [false, 'ไม่มี role นี้'];
      return [!app[0].rolsuper && !app[0].rolbypassrls,
        `superuser=${app[0].rolsuper} bypassrls=${app[0].rolbypassrls}`];
    });

    /**
     * dgl_app ต้องไม่เป็นเจ้าของตารางที่ปิด force
     *
     * users กับ tenants ปิด force เพื่อให้ฟังก์ชัน auth ทำงานได้ (ดู 012)
     * ถ้าแอปต่อด้วย role ที่เป็นเจ้าของตารางพวกนั้น RLS จะถูกข้ามทันที
     */
    await step('dgl_app ไม่ได้เป็นเจ้าของตารางที่ปิด force', async () => {
      const owned = await q(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and c.relrowsecurity and not c.relforcerowsecurity
           and pg_get_userbyid(c.relowner) = 'dgl_app'`);
      return [owned.length === 0, owned.map((r) => r.relname).join(', ')];
    });

    const NO_FORCE = ['tenants', 'users'];
    const rlsRows = async () => q(`
      select c.relname, c.relrowsecurity as on, c.relforcerowsecurity as forced
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and (c.relname = 'tenants' or exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = c.relname
              and column_name = 'tenant_id'))
       order by c.relname`);

    await step('ทุกตารางที่ผูกกับอู่เปิด RLS', async () => {
      const rls = await rlsRows();
      const off = rls.filter((r) => !r.on).map((r) => r.relname);
      return [rls.length > 10 && off.length === 0,
        off.length ? `ปิดอยู่: ${off.join(', ')}` : `${rls.length} ตาราง`];
    });

    await step('ปิด force เฉพาะสองตารางที่ auth ต้องใช้', async () => {
      const rls = await rlsRows();
      const off = rls.filter((r) => !r.forced).map((r) => r.relname).sort();
      return [JSON.stringify(off) === JSON.stringify(NO_FORCE), off.join(', ') || '(ไม่มี)'];
    });

    /*
     * วิวต้องประเมินสิทธิ์ด้วยคนเรียก ไม่ใช่เจ้าของวิว
     *
     * ค่าปริยายของ Postgres คือใช้สิทธิ์ของเจ้าของวิว ซึ่งคือ role ที่รันไมเกรชัน —
     * บนบริการแบบ managed เราไม่ได้เป็นคนเลือกว่าจะเป็น role ไหน
     * ถ้าเป็น role ที่ข้าม RLS ได้ วิวจะอ่านข้ามอู่ทันทีโดยไม่มีอาการให้เห็น
     */
    await step('ทุกวิวตั้ง security_invoker', async () => {
      const bad = await q(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public','auth','ops') and c.relkind = 'v'
           and not coalesce('security_invoker=true' = any(c.reloptions), false)`);
      return [bad.length === 0, bad.map((r) => r.relname).join(', ') || 'ครบทุกวิว'];
    });

    /*
     * ฟังก์ชันสร้างเจ้าของอู่ต้องเป็นรุ่นที่เขียน perms เป็นออบเจกต์
     *
     * ไฟล์ 002_auth.sql เป็นภาพรวมสคีมาที่ไม่ได้ถูกรันซ้ำ ตอนที่ไมเกรชัน 007
     * เปลี่ยน users.perms เป็น jsonb ฐานที่ติดตั้งไปแล้วจึงค้างฟังก์ชันรุ่นเก่าไว้
     * แล้วพังทันทีที่เรียก — แปลว่า **เปิดอู่ใหม่ไม่ได้เลย** ทั้งจากคอนโซล
     * และจากตัวนำเข้าไฟล์สำรอง โดยที่อู่เดิมใช้งานได้ทุกอย่างตามปกติ
     * ไมเกรชัน 019 แก้แล้ว ข้อนี้เฝ้าไม่ให้กลับมาอีก
     */
    await step('ฟังก์ชันสร้างเจ้าของอู่เป็นรุ่นปัจจุบัน', async () => {
      const [fn] = await q(
        `select pg_get_functiondef('auth.create_owner(uuid,citext,text)'::regprocedure) as def`);
      const ok = String(fn?.def ?? '').includes('jsonb_build_object');
      return [ok, ok ? 'เขียน perms เป็นออบเจกต์' : 'ยังเป็นรุ่นเก่า — รันไมเกรชัน 019'];
    });

    /* ฟังก์ชัน SECURITY DEFINER ที่เป็นของ role ซึ่งข้าม RLS ได้
       จะมองเห็นข้อมูลทุกอู่โดยไม่มีอะไรกั้น */
    await step('ไม่มีฟังก์ชัน SECURITY DEFINER ที่เป็นของ role ซึ่งข้าม RLS ได้', async () => {
      const fns = await q(`
        select n.nspname || '.' || p.proname as fn, pg_get_userbyid(p.proowner) as owner
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          join pg_roles r on r.oid = p.proowner
         where n.nspname in ('public','auth','ops') and p.prosecdef
           and (r.rolsuper or r.rolbypassrls)`);
      return [fns.length === 0,
        fns.map((r) => `${r.fn} (${r.owner})`).slice(0, 5).join(', ')];
    });

    /* แอปต้องแตะตารางของ auth ตรง ๆ ไม่ได้ — ต้องผ่านฟังก์ชันเท่านั้น
       ไม่งั้นอ่าน session และ hash ของทุกอู่ได้ */
    await step('dgl_app แตะตารางในสคีมา auth ตรง ๆ ไม่ได้', async () => {
      const reach = await q(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'auth' and c.relkind = 'r'
           and has_table_privilege('dgl_app', c.oid, 'select, insert, update, delete')`);
      return [reach.length === 0, reach.map((r) => r.relname).join(', ')];
    });

    /* แอปที่ลบ log ของตัวเองได้ คือแอปที่ลบหลักฐานตอนมีปัญหาได้ด้วย */
    await step('แอปบันทึกข้อผิดพลาดได้ แต่ลบไม่ได้', async () => {
      const p = (await q(
        `select has_table_privilege('dgl_app','ops.errors','insert') as w,
                has_table_privilege('dgl_app','ops.errors','delete') as d`))[0];
      return [p.w === true && p.d === false, `เขียนได้=${p.w} ลบได้=${p.d}`];
    });

    await step('มีบัญชีผู้ให้บริการที่ตั้งรหัสผ่านแล้วอย่างน้อยหนึ่งบัญชี', async () => {
      const n = (await q(
        `select count(*)::int as n from ops.operators
          where active and password_hash is not null`))[0].n;
      return [n > 0, `${n} บัญชี`];
    });

    await step('อ่านจำนวนอู่ในระบบได้', async () => {
      const n = (await q('select count(*)::int as n from tenants'))[0].n;
      return [true, `${n} อู่`];
    });
  } finally {
    await client.end().catch(() => {});
  }
}

/* ---------- รัน ---------- */

try {
  if (appUrl) await checkWeb();
  else console.log('  ข้ามการตรวจฝั่งเว็บ — ไม่ได้ตั้ง APP_URL');

  if (adminUrl) await checkDb();
  else console.log('  ข้ามการตรวจฝั่งฐานข้อมูล — ไม่ได้ตั้ง ADMIN_URL');
} catch (err) {
  /* ถึงตรงนี้แปลว่าต่อไม่ติดเลย ไม่ใช่แค่ข้อใดข้อหนึ่งพัง */
  check('ตรวจได้จนจบ', false, err instanceof Error ? err.message : String(err));
}

console.log('');
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length) {
  console.log(`  ไม่ผ่าน ${failed.length} จาก ${results.length} ข้อ — แก้ก่อนเปิดให้คนนอกใช้\n`);
  process.exitCode = 1;
} else {
  console.log(`  ผ่านครบ ${results.length} ข้อ`);
  console.log('  ที่เหลือคือข้อที่ตรวจแทนกันไม่ได้ — ดู DEPLOY.md ข้อ 8\n');
}
