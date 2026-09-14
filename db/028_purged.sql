-- =====================================================================
-- DriveGoLight! Web — migration 028 · ถังขยะ: "ลบถาวร" จากเมนูเอกสารที่ลบ/ยกเลิก (07.5)
--
-- ลบถาวร = ซ่อนออกจากทุกหน้ารวมถังขยะ กู้คืนไม่ได้ แต่แถวในฐานยังอยู่เพื่อไม่ทำลายบัญชีสต๊อก/การเงิน
-- ที่อ้างถึงเอกสารนี้ (stock_moves.doc_id, payments.doc_id, billnote_docs.doc_id)
-- =====================================================================
alter table documents add column purged_at timestamptz;
alter table billnotes add column purged_at timestamptz;
create index documents_purged_idx on documents (tenant_id, purged_at) where purged_at is not null;
