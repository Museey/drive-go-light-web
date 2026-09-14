-- =====================================================================
-- DriveGoLight! Web — migration 026 · บัญชีรับโอนหลายธนาคาร
-- เก็บเป็น jsonb [{bank, no, name}] · คอลัมน์ bank_* เดิมยังใช้เป็น "บัญชีหลัก" (ตัวแรก) ให้หน้าพิมพ์เดิมทำงานต่อ
-- =====================================================================
alter table tenants add column bank_accounts jsonb not null default '[]'::jsonb;
update tenants set bank_accounts = jsonb_build_array(jsonb_build_object('bank', bank_name, 'no', bank_account_no, 'name', bank_account_name))
 where coalesce(bank_account_no, '') <> '';
