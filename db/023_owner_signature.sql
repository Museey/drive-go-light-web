-- =====================================================================
-- DriveGoLight! Web — migration 023 · ข้อมูลร้านครบชุด: ชื่อเจ้าของกิจการ + รูปลายเซ็นบนเอกสาร
-- เก็บลายเซ็นเป็น data URI แบบเดียวกับโลโก้ (logo_url) หนึ่งรูปต่อหนึ่งอู่
-- =====================================================================
alter table tenants add column owner_name text not null default '';
alter table tenants add column signature_url text;
