import pg from 'pg';

/**
 * ใส่ใบวางบิลตัวอย่างหนึ่งใบถ้ายังไม่มี — ชุดข้อมูลตัวอย่าง (tools/dev-seed.sh) ไม่มีใบวางบิลมาให้
 *
 * เขียนลงฐานตรงแบบเดียวกับ `makeSession()` แทนที่จะกดสร้างผ่านหน้าจอ เพราะเทสต์ชุดนี้
 * ตรวจ "หน้ารายการแสดงผลยังไง" ไม่ได้ตรวจ "ฟอร์มวางบิลทำงานไหม" ซึ่งมีเทสต์ของตัวเองอยู่แล้ว
 * การพาไปกดฟอร์มก่อนทุกครั้งคือการเพิ่มจุดที่พังได้โดยไม่ได้ทดสอบอะไรเพิ่ม
 */
export async function ensureBillnote(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง DATABASE_URL ก่อนรันเทสต์เบราว์เซอร์');

  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const have = await c.query(`select 1 from billnotes where purged_at is null limit 1`);
    if (have.rowCount) return;

    /* ใบส่งมอบที่ยังเก็บเงินไม่ครบ = ใบที่มีเหตุผลให้วางบิลจริง ๆ */
    const { rows } = await c.query(
      `select d.id, d.tenant_id, d.party_id, d.party_name, d.payable
         from documents d
         left join (select doc_id, sum(amount) as paid from payments group by doc_id) p on p.doc_id = d.id
        where d.kind in ('IVT','IV') and d.status <> 'void' and d.purged_at is null
          and d.payable - coalesce(p.paid, 0) > 0.004
        order by d.doc_date desc
        limit 1`);
    const doc = rows[0];
    if (!doc) throw new Error('ไม่มีใบส่งมอบที่ยังค้างชำระในฐานข้อมูล — รัน tools/dev-seed.sh ก่อน');

    const { rows: made } = await c.query(
      `insert into billnotes (tenant_id, no, bill_date, due_date, party_id, party_name, total_snapshot)
       values ($1, $2, current_date, current_date + 30, $3, $4, $5)
       returning id`,
      [doc.tenant_id, `BN-E2E-0001`, doc.party_id, doc.party_name, doc.payable]);

    await c.query(
      `insert into billnote_docs (tenant_id, billnote_id, doc_id) values ($1, $2, $3)`,
      [doc.tenant_id, made[0].id, doc.id]);
  } finally {
    await c.end();
  }
}
