-- =====================================================================
-- DriveGoLight! Web — migration 020 · ส่วนลดรายบรรทัด (%) และส่วนลดท้ายบิลแบบ % / บาท
--
-- ตามเอกสารเจ๊ก ข้อ 3 "ส่วนลดให้เลือกได้เป็นเปอร์เซ็นต์หรือเป็นบาท"
-- และฟอร์มใหม่ (13 ก.ย. 69) ที่มีคอลัมน์ "ส่วนลด %" รายบรรทัด
--
-- documents.discount ยังเป็น "บาทที่มีผลจริง" เหมือนเดิม — รายงาน ยอดรวม ภาษี ไม่ต้องแก้
-- แค่เก็บเพิ่มว่าผู้ใช้เลือกกรอกเป็น % หรือบาท (discount_mode) และตัวเลข % (discount_pct)
-- เพื่อให้เปิดแก้ไขแล้วเห็นเหมือนที่กรอกไว้ ไม่ใช่เห็นบาทที่ระบบแปลงให้
--
-- line_total เป็นคอลัมน์คำนวณอัตโนมัติ ต้องสร้างใหม่ให้รวมส่วนลดบรรทัด
-- disc_pct ค่าเริ่มต้น 0 → เอกสารเก่าทุกใบได้ line_total เท่าเดิมทุกบาท
-- =====================================================================

alter table doc_items
  add column disc_pct numeric(5,2) not null default 0
    check (disc_pct >= 0 and disc_pct <= 100);

alter table doc_items drop column line_total;
alter table doc_items
  add column line_total numeric(14,2)
    generated always as (round(qty * unit_price * (1 - disc_pct / 100), 2)) stored;

alter table documents
  add column discount_mode text not null default 'baht'
    check (discount_mode in ('baht', 'pct'));
alter table documents
  add column discount_pct numeric(5,2) not null default 0
    check (discount_pct >= 0 and discount_pct <= 100);
