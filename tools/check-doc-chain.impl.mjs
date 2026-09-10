#!/usr/bin/env node
/**
 * ตรวจว่าใบเสร็จต่อสายจากใบที่ถูกต้องหรือไม่
 *
 *   ADMIN_URL='postgresql://...' node tools/check-doc-chain.mjs
 *
 * **อ่านอย่างเดียว ไม่แก้อะไรเลย**
 *
 * กติกาที่ควรเป็น (ยกมาจาก makeRcFromQuote ของรุ่น 6.4)
 *   ใบเสนอราคาที่**มีใบส่งมอบแล้ว** → ใบเสร็จต้องต่อจากใบส่งมอบ
 *   ใบเสนอราคาที่**ไม่มีใบส่งมอบ**   → ใบเสร็จต่อจากใบเสนอราคาได้ ถูกต้องแล้ว
 *
 * ใบเสร็จที่ต่อจากใบเสนอราคาทั้งที่มีใบส่งมอบอยู่ คือใบที่ออกก่อน 10 ก.ย. 2569
 * ซึ่งเป็นวันที่แก้กติกานี้ ผลคือ**ใบส่งมอบใบนั้นไม่ถูกปิดยอด ค้างเป็นลูกหนี้
 * ตลอดไปทั้งที่เก็บเงินไปแล้ว** ยอดขายรวมไม่ผิด ผิดเฉพาะลูกหนี้คงค้าง
 *
 * ตัวตรวจนี้บอกว่ามีกี่ใบและใบไหนบ้าง เพื่อให้ตัดสินใจได้ว่าจะแก้มือหรือปล่อย
 * ไม่แก้ให้เอง เพราะแยกไม่ออกว่าใบไหนตั้งใจแยกจริง
 */
import pg from 'pg';

const url = process.env.ADMIN_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('ต้องตั้ง ADMIN_URL ก่อน เช่น');
  console.error("  ADMIN_URL='postgresql://...' node tools/check-doc-chain.mjs");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });

/* วันที่เก็บเป็นข้อความ ไม่ให้ไดรเวอร์แปลงเป็น Date แล้วเลื่อนเขตเวลา */
pg.types.setTypeParser(1082, (v) => v);

/**
 * ไล่ทีละอู่โดยตั้ง app.tenant_id ให้เหมือนที่แอปทำ
 *
 * `documents` เปิด force row level security ซึ่ง**มีผลกับเจ้าของตารางด้วย**
 * role ที่ Render ให้มาเป็นเจ้าของตาราง แต่ไม่ใช่ superuser จึงถูกกรองไปด้วย
 * ไม่ตั้ง app.tenant_id แล้วยิงคิวรีจะได้ 0 แถวทุกครั้ง โดยไม่มี error ให้เห็น
 * — เคยรายงานว่า "ไม่มีใบเสร็จในระบบ" ทั้งที่บนหน้าเว็บมีอยู่ชัด ๆ มาแล้ว
 *
 * ตาราง `tenants` ถูกปิด force ไว้ (db/012_auth_rls.sql) จึงอ่านรายชื่ออู่ได้ก่อน
 * แล้วค่อยวนตั้ง GUC ทีละตัว เป็นทางเดียวกับที่ withTenant() ของแอปใช้
 * **ไม่ใช่การปิด RLS** ซึ่งจะทำให้การแยกข้อมูลของอู่ไม่มีความหมาย
 */
async function forEachTenant(tenants, fn) {
  const out = [];
  for (const t of tenants) {
    await client.query(`select set_config('app.tenant_id', $1, false)`, [t.id]);
    out.push(...(await fn(t)));
  }
  await client.query(`select set_config('app.tenant_id', '', false)`);
  return out;
}

const LABEL = [
  ['from_invoice', 'ต่อจากใบส่งมอบ', ''],
  ['from_quote_ok', 'ต่อจากใบเสนอราคา (ถูกต้อง)', 'ใบเสนอราคานั้นไม่เคยออกใบส่งมอบ'],
  ['orphan', 'ไม่มีต้นทาง', 'ออกใบเสร็จขึ้นมาลอย ๆ ปกติของงานหน้าร้าน'],
];

async function main() {
  await client.connect();

  const { rows: tenants } = await client.query(`select id, name from tenants order by name`);

  const u = new URL(url);
  console.log('\n  ══ ต่ออยู่กับอะไร ══\n');
  console.log(`  โฮสต์      ${u.hostname}`);
  console.log(`  ฐานข้อมูล   ${u.pathname.slice(1)}`);
  console.log(`  ผู้ใช้      ${u.username}`);
  console.log(`  อู่ที่พบ     ${tenants.length}\n`);

  if (tenants.length === 0) {
    console.log('  ไม่มีอู่ในฐานนี้เลย — ต่อถูกฐานหรือเปล่า\n');
    process.exitCode = 1;
    return;
  }

  const summary = await forEachTenant(tenants, async (t) => {
    const { rows } = await client.query(`
      select $1::text as tenant,
             count(*) filter (where rc.parent_kind is null)                      as orphan,
             count(*) filter (where rc.parent_kind in ('IV','IVT'))              as from_invoice,
             count(*) filter (where rc.parent_kind = 'QT' and not rc.qt_has_inv) as from_quote_ok,
             count(*) filter (where rc.parent_kind = 'QT' and rc.qt_has_inv)     as mischained
        from (
          select p.kind::text as parent_kind,
                 exists (select 1 from documents x
                          where x.parent_doc_id = p.id and x.status <> 'void'
                            and x.kind in ('IV','IVT')) as qt_has_inv
            from documents d
            left join documents p on p.id = d.parent_doc_id and p.status <> 'void'
           where d.kind = 'RC' and d.status <> 'void'
        ) rc`, [t.name]);
    return rows;
  });

  console.log('  ══ ใบเสร็จแยกตามต้นทางที่ต่อไว้ ══\n');
  let totalBad = 0;
  let totalRc = 0;
  for (const r of summary) {
    const n = LABEL.reduce((a, [k]) => a + Number(r[k] ?? 0), 0) + Number(r.mischained ?? 0);
    totalRc += n;
    if (n === 0) { console.log(`  ${r.tenant}   (ยังไม่มีใบเสร็จ)\n`); continue; }

    console.log(`  ${r.tenant}`);
    for (const [key, label, note] of LABEL) {
      console.log(`    ${label.padEnd(28)}${String(r[key] ?? 0).padStart(4)}` + (note ? `   ← ${note}` : ''));
    }
    const bad = Number(r.mischained ?? 0);
    totalBad += bad;
    console.log(`  ${bad > 0 ? '⚠️' : '  '}  ${'ต่อผิด ควรต่อจากใบส่งมอบ'.padEnd(28)}${String(bad).padStart(4)}`);
    console.log('');
  }

  if (totalRc === 0) {
    console.log('  ยังไม่มีใบเสร็จในระบบ — ไล่ครบทุกอู่แล้ว ไม่ใช่มองไม่เห็น\n');
    return;
  }
  if (totalBad === 0) {
    console.log('  ✓ ทุกอู่ต่อสายถูกหมด — ไม่มีใบไหนต้องแก้\n');
    return;
  }

  const bad = await forEachTenant(tenants, async (t) => {
    const { rows } = await client.query(`
      select $1::text as tenant, d.doc_no as "ใบเสร็จ", d.doc_date as "วันที่",
             p.doc_no as "ต่อจาก", inv.doc_no as "ควรต่อจาก",
             (inv.payable - coalesce(pay.paid, 0))::float8 as "ลูกหนี้ค้างของใบส่งมอบ"
        from documents d
        join documents p on p.id = d.parent_doc_id and p.kind = 'QT' and p.status <> 'void'
        join lateral (
          select x.id, x.doc_no, x.payable from documents x
           where x.parent_doc_id = p.id and x.status <> 'void' and x.kind in ('IV','IVT')
           order by x.doc_date, x.doc_no limit 1
        ) inv on true
        left join (select doc_id, sum(amount) as paid from payments group by doc_id) pay
               on pay.doc_id = inv.id
       where d.kind = 'RC' and d.status <> 'void'
       order by d.doc_date, d.doc_no`, [t.name]);
    return rows;
  });

  console.log(`  ══ ใบที่ต่อผิด ${bad.length} ใบ ══\n`);
  console.table(bad);
  console.log('  แก้ได้ด้วยการชี้ parent_doc_id ของใบเสร็จไปที่ใบส่งมอบ');
  console.log('  แต่ตรวจก่อนทุกใบว่าเป็นการเก็บเงินของงานเดียวกันจริง ไม่ใช่คนละงาน\n');
}

main()
  .catch((err) => { console.error('\n  ตรวจไม่สำเร็จ —', err.message, '\n'); process.exitCode = 1; })
  .finally(() => client.end());
