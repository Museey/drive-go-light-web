/**
 * ลบข้อผิดพลาดที่เก่ากว่าที่กำหนดออกจาก ops.errors — และใบสมัคร/รูปสลิปเก่าใน ops.payment_requests
 *
 *   ADMIN_URL='postgresql://...' node tools/prune-errors.mjs [จำนวนวัน]
 *
 * ค่าตั้งต้น 90 วัน ให้ตรงกับที่หน้านโยบายข้อมูลส่วนบุคคลบอกไว้
 *
 * **ต้องใช้ connection ของผู้ดูแล ไม่ใช่ของแอป** — role ของแอปตั้งใจให้ลบไม่ได้
 * คนที่ทำระบบพังต้องลบร่องรอยไม่ได้
 */
import pg from 'pg';
import { sslHint } from './sql-statements.mjs';

const days = Number(process.argv[2]) || 90;
const url = process.env.ADMIN_URL || process.env.ADMIN_DATABASE_URL;

if (!url) {
  console.error('ต้องตั้ง ADMIN_URL ก่อน — ใช้ connection ของผู้ดูแล ไม่ใช่ของแอป');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const { rows } = await client.query('select ops.prune_errors($1) as n', [days]);
  const left = await client.query('select count(*)::int as n from ops.errors');
  console.log(`ลบข้อผิดพลาดที่เก่ากว่า ${days} วันไปแล้ว ${rows[0].n} รายการ · เหลือ ${left.rows[0].n}`);

  /* ใบสมัครที่ปฏิเสธ และรูปสลิปของใบที่อนุมัติ — ระยะเดียวกับที่หน้า /privacy บอก (038)
     ฐานที่ยังไม่ได้รัน 038 ไม่มีฟังก์ชันนี้ ข้ามไปเงียบ ๆ */
  const { rows: [has] } = await client.query(
    `select to_regprocedure('ops.prune_requests(integer)') is not null as ok`);
  if (has.ok) {
    const r = await client.query('select ops.prune_requests($1) as n', [days]);
    console.log(`เก็บกวาดใบสมัครและรูปสลิปที่เก่ากว่า ${days} วันไปแล้ว ${r.rows[0].n} รายการ`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  const hint = sslHint(err);
  if (hint) console.error(`\n${hint}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
