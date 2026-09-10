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
 * ดูก่อนว่าเรามองเห็นอะไรบ้าง
 *
 * "ไม่มีใบเสร็จ" กับ "มองไม่เห็นใบเสร็จ" เป็นคนละเรื่องกัน แต่หน้าตาเหมือนกันเป๊ะ
 * ถ้าไม่ตรวจแยก — เคยรายงานว่าไม่มีใบเสร็จทั้งที่บนหน้าจอมีอยู่ชัด ๆ
 *
 * สาเหตุที่ทำให้มองไม่เห็นมีสองอย่าง
 *   1. ต่อไปผิดฐาน (เช่นฐานสำเนาที่กู้ไว้ซ้อม ซึ่งเป็นภาพก่อนหน้านี้)
 *   2. role ที่ใช้ถูก RLS กรอง — documents เปิด force row level security ไว้
 *      ซึ่งมีผลกับเจ้าของตารางด้วย ถ้าไม่ได้ตั้ง app.tenant_id จะได้ 0 แถวเงียบ ๆ
 */
async function survey() {
  const q = async (sql) => Number((await client.query(sql)).rows[0].v);
  const tenants = await q('select count(*)::int as v from tenants');
  const docs = await q(`select count(*)::int as v from documents`);
  const receipts = await q(`select count(*)::int as v from documents where kind = 'RC'`);

  const u = new URL(url);
  console.log('\n  ══ ต่ออยู่กับอะไร ══\n');
  console.log(`  โฮสต์      ${u.hostname}`);
  console.log(`  ฐานข้อมูล   ${u.pathname.slice(1)}`);
  console.log(`  ผู้ใช้      ${u.username}`);
  console.log(`  อู่ ${tenants} · เอกสาร ${docs} · ใบเสร็จ ${receipts}\n`);

  if (tenants > 0 && docs === 0) {
    console.log('  ⚠️  เห็นอู่แต่ไม่เห็นเอกสารเลยสักใบ — ผิดปกติ');
    console.log('     ถ้าบนหน้าเว็บมีเอกสารอยู่ แปลว่าอ่านไม่ได้ ไม่ใช่ไม่มี');
    console.log('     เช็คสองอย่าง');
    console.log('       · ต่อถูกฐานไหม — ฐานสำเนาที่กู้ไว้ซ้อมเป็นภาพของอดีต');
    console.log(`       · role "${u.username}" ถูก RLS กรองอยู่หรือเปล่า`);
    console.log('         (documents เปิด force row level security ซึ่งมีผลกับเจ้าของตารางด้วย)\n');
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function main() {
  await client.connect();
  if (!(await survey())) return;

  const { rows: summary } = await client.query(`
    select t.name as tenant,
           count(*) filter (where rc.parent_kind is null)                      as orphan,
           count(*) filter (where rc.parent_kind in ('IV','IVT'))              as from_invoice,
           count(*) filter (where rc.parent_kind = 'QT' and not rc.qt_has_inv) as from_quote_ok,
           count(*) filter (where rc.parent_kind = 'QT' and rc.qt_has_inv)     as mischained
      from (
        select d.tenant_id, d.id,
               p.kind::text as parent_kind,
               exists (select 1 from documents x
                        where x.parent_doc_id = p.id and x.status <> 'void'
                          and x.kind in ('IV','IVT')) as qt_has_inv
          from documents d
          left join documents p on p.id = d.parent_doc_id and p.status <> 'void'
         where d.kind = 'RC' and d.status <> 'void'
      ) rc
      join tenants t on t.id = rc.tenant_id
     group by t.name
     order by t.name`);

  if (summary.length === 0) {
    console.log('  ยังไม่มีใบเสร็จในระบบ — ตัวเลขข้างบนยืนยันว่าอ่านได้จริง ไม่ใช่มองไม่เห็น\n');
    return;
  }

  /* ชื่อคอลัมน์ใน SQL เป็น ASCII แล้วค่อยแปลตรงนี้ — ชื่อไทยใน alias เคยคืนมาไม่ตรงคีย์
     แล้วสรุปกลายเป็น undefined กับ NaN โดยที่ตัวเลขในตารางรายละเอียดยังถูกอยู่ */
  const LABEL = [
    ['from_invoice',  'ต่อจากใบส่งมอบ', ''],
    ['from_quote_ok', 'ต่อจากใบเสนอราคา (ถูกต้อง)', 'ใบเสนอราคานั้นไม่เคยออกใบส่งมอบ'],
    ['orphan',        'ไม่มีต้นทาง', 'ออกใบเสร็จขึ้นมาลอย ๆ ปกติของงานหน้าร้าน'],
  ];

  console.log('\n  ══ ใบเสร็จแยกตามต้นทางที่ต่อไว้ ══\n');
  let totalBad = 0;
  for (const r of summary) {
    console.log(`  ${r.tenant}`);
    for (const [key, label, note] of LABEL) {
      console.log(`    ${label.padEnd(28)}${String(r[key] ?? 0).padStart(4)}` + (note ? `   ← ${note}` : ''));
    }
    const bad = Number(r.mischained ?? 0);
    totalBad += bad;
    console.log(`  ${bad > 0 ? '⚠️' : '  '}  ${'ต่อผิด ควรต่อจากใบส่งมอบ'.padEnd(28)}${String(bad).padStart(4)}`);
    console.log('');
  }
  if (totalBad === 0) console.log('  ✓ ทุกอู่ต่อสายถูกหมด\n');

  const { rows: bad } = await client.query(`
    select t.name as tenant, d.doc_no as ใบเสร็จ, d.doc_date as วันที่,
           p.doc_no as ต่อจาก, inv.doc_no as ควรต่อจาก,
           (inv.payable - coalesce(pay.paid, 0)) as ลูกหนี้ค้างของใบส่งมอบ
      from documents d
      join documents p   on p.id = d.parent_doc_id and p.kind = 'QT' and p.status <> 'void'
      join tenants   t   on t.id = d.tenant_id
      join lateral (
        select x.id, x.doc_no, x.payable from documents x
         where x.parent_doc_id = p.id and x.status <> 'void' and x.kind in ('IV','IVT')
         order by x.doc_date, x.doc_no limit 1
      ) inv on true
      left join (select doc_id, sum(amount) as paid from payments group by doc_id) pay
             on pay.doc_id = inv.id
     where d.kind = 'RC' and d.status <> 'void'
     order by t.name, d.doc_date, d.doc_no`);

  if (bad.length === 0) {
    console.log('  ✓ ไม่มีใบเสร็จที่ต่อผิด — ทุกใบต่อถูกที่แล้ว\n');
    return;
  }

  console.log(`  ══ ใบที่ต่อผิด ${bad.length} ใบ ══\n`);
  console.table(bad);
  console.log('  แก้ได้ด้วยการชี้ parent_doc_id ของใบเสร็จไปที่ใบส่งมอบ');
  console.log('  แต่ตรวจก่อนทุกใบว่าเป็นการเก็บเงินของงานเดียวกันจริง ไม่ใช่คนละงาน\n');
}

main()
  .catch((err) => { console.error('\n  ตรวจไม่สำเร็จ —', err.message, '\n'); process.exitCode = 1; })
  .finally(() => client.end());
