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
const TOTALS = [
  ['เอกสารทั้งหมด', 'select count(*)::int as v from documents'],
  ['ยอดรวมทุกเอกสาร', 'select coalesce(sum(grand_total), 0)::float8 as v from documents'],
  ['รายการชำระเงิน', 'select count(*)::int as v from payments'],
  ['ยอดชำระรวม', 'select coalesce(sum(amount), 0)::float8 as v from payments'],
  ['การเคลื่อนไหวสต๊อก', 'select count(*)::int as v from stock_moves'],
  ['ผู้ติดต่อ', 'select count(*)::int as v from contacts'],
  ['สินค้า', 'select count(*)::int as v from products'],
  ['ผู้ใช้งาน', 'select count(*)::int as v from users'],
  ['รูปสินค้า', 'select count(*)::int as v from product_pics'],
  ['พื้นที่รูปรวม (ไบต์)', 'select coalesce(sum(bytes), 0)::bigint as v from product_pics'],
];

try {
  await client.connect();

  const out = { at: new Date().toISOString(), database: '', tenants: [], tables: {}, totals: {}, migrations: [] };

  out.database = (await client.query('select current_database() as d')).rows[0].d;

  /* จำนวนแถวของทุกตารางในสคีมา public และ ops — นับจริง ไม่ใช่ค่าประมาณจากสถิติ */
  const { rows: tables } = await client.query(`
    select n.nspname as schema, c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'ops', 'auth')
     order by n.nspname, c.relname`);

  for (const t of tables) {
    const { rows } = await client.query(
      `select count(*)::int as n from ${t.schema}.${t.name}`);
    out.tables[`${t.schema}.${t.name}`] = rows[0].n;
  }

  /* รายชื่ออู่ — ตัด id ให้สั้นพอระบุตัวได้ แต่ไม่ยาวจนอ่านไม่ไหว */
  const { rows: tenants } = await client.query(
    /* ::text เพราะ pg แปลงคอลัมน์ date เป็น Date ของ JS ตามเวลาเครื่อง
       ซึ่งทำให้ผลลัพธ์ต่างกันตามเขตเวลาของคนรัน แล้ว diff ไม่ตรงทั้งที่ข้อมูลเหมือนกัน */
    'select id, name, created_at::date::text as created from tenants order by name');
  out.tenants = tenants.map((t) => ({
    id: String(t.id).slice(0, 8), name: t.name, created: String(t.created).slice(0, 10),
  }));

  for (const [label, sql] of TOTALS) {
    try {
      const { rows } = await client.query(sql);
      out.totals[label] = Number(rows[0].v);
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
    console.log(`\nฐานข้อมูล ${out.database} · สำรวจเมื่อ ${out.at}\n`);

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
