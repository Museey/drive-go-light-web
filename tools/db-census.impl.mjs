#!/usr/bin/env node
/**
 * สำรวจว่าฐานข้อมูลมีอะไรอยู่บ้าง — ใช้เทียบก่อน/หลังกู้คืน
 *
 *   ADMIN_URL='postgresql://...' node tools/db-census.mjs           อ่านง่าย
 *   ADMIN_URL='postgresql://...' node tools/db-census.mjs --json    เอาไป diff
 *
 * **มีไว้ทำอะไร** — การซ้อมกู้คืนที่ไม่ได้เทียบตัวเลข คือการดูว่าคำสั่งรันผ่าน
 * ไม่ใช่การพิสูจน์ว่าข้อมูลกลับมาครบ ตัวนี้พิมพ์จำนวนแถวทุกตาราง ยอดเงินรวม
 * และเลขที่เอกสารล่าสุด ออกมาในรูปแบบที่เอาไป diff กันได้ตรง ๆ
 *
 * ใช้ ADMIN_URL เพราะต้องอ่านข้ามอู่ ซึ่ง role ของแอปตั้งใจให้ทำไม่ได้
 *
 * ไม่ต้องมี psql หรือ pg_dump บนเครื่อง — เป็นเหตุผลหลักที่เขียนตัวนี้ขึ้นมา
 */
import pg from 'pg';
import { sslHint } from './sql-statements.mjs';

const asJson = process.argv.includes('--json');

const url = process.env.ADMIN_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('ต้องตั้ง ADMIN_URL หรือ DATABASE_URL ก่อน');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });

/** ตัวเลขที่บอกได้ว่าข้อมูลครบจริงไหม ไม่ใช่แค่ตารางมีอยู่ */
/**
 * [ป้าย, ตาราง, สิ่งที่คำนวณ]
 *
 * เก็บชื่อตารางแยกจากสูตร เพื่อให้เติม `where tenant_id = ...` ต่อท้ายได้
 * ตอนนับทีละอู่ — ดูเหตุผลที่ tenantFilter()
 */
const TOTALS = [
  ['เอกสารทั้งหมด', 'documents', 'count(*)::int'],
  ['ยอดรวมทุกเอกสาร', 'documents', 'coalesce(sum(grand_total), 0)::float8'],
  ['รายการชำระเงิน', 'payments', 'count(*)::int'],
  ['ยอดชำระรวม', 'payments', 'coalesce(sum(amount), 0)::float8'],
  ['การเคลื่อนไหวสต๊อก', 'stock_moves', 'count(*)::int'],
  ['ผู้ติดต่อ', 'contacts', 'count(*)::int'],
  ['สินค้า', 'products', 'count(*)::int'],
  ['ผู้ใช้งาน', 'users', 'count(*)::int'],
  ['รูปสินค้า', 'product_pics', 'count(*)::int'],
  ['พื้นที่รูปรวม (ไบต์)', 'product_pics', 'coalesce(sum(bytes), 0)::bigint'],
];

try {
  await client.connect();

  const out = {
    at: new Date().toISOString(), database: '', env: {},
    tenants: [], tables: {}, totals: {}, migrations: [],
  };

  out.database = (await client.query('select current_database() as d')).rows[0].d;

  /**
   * สภาพแวดล้อมของฐานข้อมูล — สิ่งที่ **ไม่ได้อยู่ในตาราง** จึงหายไปได้เงียบ ๆ ตอนกู้คืน
   *
   * บริการที่กู้คืนให้มักสร้างฐานข้อมูล **ชื่อใหม่** และค่าที่ผูกกับชื่อเดิม
   * (เช่น `alter database dgl set timezone`) อาจไม่ตามมา ซึ่งจะทำให้แอปไม่ยอมเริ่ม
   * เพราะ assertClockAgrees() ตรวจเจอว่าเขตเวลาไม่ตรง — เป็นเรื่องที่ต้องรู้
   * ตอนซ้อม ไม่ใช่ตอนกู้จริงตอนตีสาม
   *
   * role ก็เหมือนกัน — ถ้า dgl_app ไม่ตามมา แอปต่อฐานที่กู้มาไม่ได้เลย
   */
  out.env.timezone = (await client.query('show timezone')).rows[0].TimeZone;
  out.env.version = (await client.query('show server_version')).rows[0].server_version;

  const { rows: roles } = await client.query(
    `select rolname, rolsuper, rolbypassrls from pg_roles
      where rolname not like 'pg\\_%' order by rolname`);
  out.env.roles = roles.map((r) => r.rolname);
  out.env.appRolePresent = roles.some((r) => r.rolname === 'dgl_app');
  /* role ที่ข้าม RLS ได้ — ถ้ามีเพิ่มขึ้นมาโดยไม่รู้ตัว การแยกข้อมูลของอู่ไม่มีความหมาย */
  out.env.rlsBypassRoles = roles.filter((r) => r.rolsuper || r.rolbypassrls)
    .map((r) => r.rolname);

  /* รายชื่ออู่ — ตัด id ให้สั้นพอระบุตัวได้ แต่ไม่ยาวจนอ่านไม่ไหว */
  const { rows: tenants } = await client.query(
    /* ::text เพราะ pg แปลงคอลัมน์ date เป็น Date ของ JS ตามเวลาเครื่อง
       ซึ่งทำให้ผลลัพธ์ต่างกันตามเขตเวลาของคนรัน แล้ว diff ไม่ตรงทั้งที่ข้อมูลเหมือนกัน */
    'select id, name, created_at::date::text as created from tenants order by name');
  out.tenants = tenants.map((t) => ({
    id: String(t.id).slice(0, 8), name: t.name, created: String(t.created).slice(0, 10),
  }));

  /**
   * ตารางที่ผูกกับอู่และเปิด RLS ไว้ — ต้องนับทีละอู่ ไม่ใช่นับรวดเดียว
   *
   * `force row level security` มีผลกับ**เจ้าของตาราง**ด้วย และ role ที่บริการ
   * แบบ managed ให้มา (เช่น Render) เป็นเจ้าของตารางแต่ไม่ใช่ superuser
   * นับรวดเดียวโดยไม่ตั้ง app.tenant_id จึงได้ **0 ทุกตารางโดยไม่มี error**
   *
   * เคยทำให้การซ้อมกู้คืนไร้ความหมายมาแล้ว — เทียบ census ของฐานเดิมกับฐานสำเนา
   * แล้วเห็นว่า "เหมือนกันทุกตัวเลข" ทั้งที่ทั้งสองฝั่งเป็นศูนย์ ศูนย์เท่ากับศูนย์เสมอ
   *
   * หาเอาจากสคีมาโดยตรง (มีคอลัมน์ tenant_id + เปิด RLS) ไม่เขียนรายชื่อไว้
   * ตารางใหม่ที่เพิ่มทีหลังจึงถูกนับถูกเองโดยไม่ต้องมาแก้ตรงนี้
   */
  const { rows: scoped } = await client.query(`
    select n.nspname as schema, c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname = 'public' and c.relrowsecurity
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'tenant_id'
                      and a.attnum > 0 and not a.attisdropped)`);
  const perTenant = new Set(scoped.map((t) => `${t.schema}.${t.name}`));
  out.env.perTenantTables = [...perTenant].sort();

  /**
   * รวมผลของทุกอู่ โดย**ใส่เงื่อนไข tenant_id ลงในคิวรีเอง**
   *
   * ตั้ง app.tenant_id อย่างเดียวไม่พอ เพราะกันการนับซ้ำไม่ได้ —
   * ตาราง `users` กับ `tenants` ถูกปิด force ไว้ (db/012_auth_rls.sql)
   * เจ้าของตารางจึงเห็นทุกแถวในทุกรอบ วนสองอู่แล้วบวกกันได้เลขเป็นสองเท่า
   *
   * ใส่เงื่อนไขเองแล้วถูกทั้งสองทาง — RLS จะกรองให้หรือไม่ก็ไม่ต่างกัน
   * ส่วน set_config ยังต้องทำอยู่ เพราะตารางที่ force RLS ต้องมี GUC ถึงจะอ่านได้เลย
   */
  const sumOverTenants = async (table, expr) => {
    let total = 0;
    for (const t of tenants) {
      await client.query(`select set_config('app.tenant_id', $1, false)`, [t.id]);
      const { rows } = await client.query(
        `select ${expr} as v from ${table} where tenant_id = $1`, [t.id]);
      total += Number(rows[0].v ?? 0);
    }
    await client.query(`select set_config('app.tenant_id', '', false)`);
    return total;
  };

  /* จำนวนแถวของทุกตารางในสคีมา public ops และ auth — นับจริง ไม่ใช่ค่าประมาณจากสถิติ */
  const { rows: tables } = await client.query(`
    select n.nspname as schema, c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'ops', 'auth')
     order by n.nspname, c.relname`);

  for (const t of tables) {
    const full = `${t.schema}.${t.name}`;
    out.tables[full] = perTenant.has(full)
      ? await sumOverTenants(full, 'count(*)::int')
      : Number((await client.query(`select count(*)::int as v from ${full}`)).rows[0].v);
  }

  for (const [label, table, expr] of TOTALS) {
    try {
      out.totals[label] = perTenant.has(`public.${table}`)
        ? await sumOverTenants(table, expr)
        : Number((await client.query(`select ${expr} as v from ${table}`)).rows[0].v);
    } catch {
      out.totals[label] = null;          /* ตารางยังไม่มีในฐานรุ่นเก่า */
    }
  }

  const { rows: migs } = await client.query(
    'select filename from ops.migrations order by filename');
  out.migrations = migs.map((m) => m.filename);

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`\nฐานข้อมูล ${out.database} · Postgres ${out.env.version} · สำรวจเมื่อ ${out.at}`);
    console.log(`เขตเวลา ${out.env.timezone}` +
      (out.env.timezone === 'Asia/Bangkok' ? '' : '   ← ควรเป็น Asia/Bangkok แอปจะไม่ยอมเริ่ม'));
    console.log(`role ของแอป (dgl_app) ${out.env.appRolePresent ? 'มี' : 'ไม่มี   ← แอปต่อฐานนี้ไม่ได้'}`);
    if (out.env.rlsBypassRoles.length) {
      console.log(`role ที่ข้าม RLS ได้: ${out.env.rlsBypassRoles.join(', ')}`);
    }
    console.log('');

    console.log(`อู่ ${out.tenants.length} อู่`);
    for (const t of out.tenants) console.log(`  ${t.id}  ${t.created}  ${t.name}`);

    console.log('\nตัวเลขรวม');
    for (const [k, v] of Object.entries(out.totals)) {
      console.log(`  ${k.padEnd(24)} ${v === null ? '(ไม่มีตาราง)' : v.toLocaleString('en-US')}`);
    }

    console.log('\nจำนวนแถวรายตาราง');
    for (const [k, v] of Object.entries(out.tables)) {
      if (v > 0) console.log(`  ${k.padEnd(32)} ${v.toLocaleString('en-US')}`);
    }
    const empty = Object.entries(out.tables).filter(([, v]) => v === 0).map(([k]) => k);
    if (empty.length) console.log(`\n  ตารางที่ว่าง ${empty.length} ตาราง`);

    console.log(`\nไมเกรชันที่รันแล้ว ${out.migrations.length} ไฟล์ ` +
      `(ล่าสุด ${out.migrations[out.migrations.length - 1] ?? '—'})\n`);
  }
} catch (err) {
  console.error(`\nสำรวจไม่สำเร็จ`);
  console.error(err instanceof Error ? err.message : err);
  const hint = sslHint(err);
  if (hint) console.error(`\n${hint}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
