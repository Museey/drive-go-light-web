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

async function main() {
  await client.connect();

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
    console.log('\n  ยังไม่มีใบเสร็จในระบบ\n');
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
