-- =====================================================================
-- role ที่แอปใช้ต่อฐานข้อมูล
--
-- ต้องไม่ใช่ superuser และต้องไม่มี BYPASSRLS ไม่งั้น Row Level Security
-- ถูกข้ามทั้งหมดโดยไม่มีอาการอะไรให้เห็น — ทุกอู่จะเห็นข้อมูลของกันและกัน
--
-- รันด้วยผู้ใช้ที่สร้าง role ได้ หลังจากรัน 001_init.sql แล้ว
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/app-role.sql
-- แล้วให้แอปต่อด้วย role นี้แทน
-- =====================================================================

create role dgl_app login password 'เปลี่ยนรหัสนี้ก่อนใช้จริง';

grant usage on schema public to dgl_app;
grant select, insert, update, delete on all tables in schema public to dgl_app;
grant execute on all functions in schema public to dgl_app;

-- ตารางที่สร้างเพิ่มในอนาคตให้สิทธิ์อัตโนมัติ
alter default privileges in schema public
  grant select, insert, update, delete on tables to dgl_app;
alter default privileges in schema public
  grant execute on functions to dgl_app;
