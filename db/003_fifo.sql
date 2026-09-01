-- =====================================================================
-- DriveGoLight! Web — migration 003 · ต้นทุนแบบเข้าก่อนออกก่อน
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้เท่านั้น
-- การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql อยู่แล้ว ไม่ต้องรันไฟล์นี้
--
-- รัน:  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/003_fifo.sql
--
-- หมายเหตุสำคัญ: alter type ... add value รันในทรานแซกชันเดียวกับที่ใช้ค่าใหม่ไม่ได้
-- ไฟล์นี้จึงเพิ่มค่า enum อย่างเดียว ไม่แตะข้อมูล — ปลอดภัยที่จะรันซ้ำ
-- =====================================================================

-- เหตุผลใหม่ของการเคลื่อนไหวสต๊อก
--   use   = เบิกใช้ในอู่ (วัสดุสิ้นเปลือง ไม่ได้ขาย)
--   count = ปรับตามการตรวจนับ
--   set   = ตั้งยอดคงเหลือ (นำเข้าจากไฟล์)
alter type stock_reason add value if not exists 'use';
alter type stock_reason add value if not exists 'count';
alter type stock_reason add value if not exists 'set';

-- ต้นทุนรวมของการเคลื่อนไหวครั้งนี้
--
-- ตรึงไว้ตอนบันทึก ไม่คำนวณใหม่ตอนอ่าน — ถ้าคำนวณใหม่ทุกครั้งที่เปิดรายงาน
-- การเพิ่มใบซื้อย้อนหลังจะทำให้งบของงวดที่ปิดไปแล้วเปลี่ยน ซึ่งผิดหลักบัญชี
alter table stock_moves add column if not exists cost_amount numeric(14,2);

comment on column stock_moves.cost_amount is
  'ต้นทุนรวมของการเคลื่อนไหวครั้งนี้ — ตรึงไว้ตอนบันทึก ไม่คำนวณใหม่ตอนอ่าน';

-- แถวที่ลงไว้ก่อนมีระบบต้นทุนจะเป็น null — รายงานประมาณให้ด้วยต้นทุนล่าสุดของสินค้า
-- แบบเดียวกับที่รุ่น 6.4 ทำกับเอกสารก่อนรุ่น FIFO ไม่เติมย้อนหลังเพราะเดาไม่ได้ว่าตัดจากล็อตไหน
--
-- ยกเว้นฝั่งรับเข้าที่รู้ต้นทุนอยู่แล้ว เติมได้ตรง ๆ จากที่บันทึกไว้
update stock_moves
   set cost_amount = round(qty_delta * unit_cost, 2)
 where cost_amount is null
   and unit_cost is not null
   and qty_delta > 0;

-- ผ่อนเงื่อนไขให้เหตุผลใหม่ไม่ต้องอ้างเอกสาร เหมือน opening กับ adjust
alter table stock_moves drop constraint if exists stock_move_doc_ref;
alter table stock_moves add constraint stock_move_doc_ref check (
  reason in ('opening','adjust','use','count','set') or doc_id is not null);
