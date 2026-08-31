-- =====================================================================
-- role ที่แอปใช้ต่อฐานข้อมูล
--
-- ต้องไม่ใช่ superuser และต้องไม่มี BYPASSRLS ไม่งั้น Row Level Security
-- ถูกข้ามทั้งหมดโดยไม่มีอาการอะไรให้เห็น — ทุกอู่จะเห็นข้อมูลของกันและกัน
--
-- รันด้วยผู้ใช้ที่สร้าง role ได้ หลังจากรัน 001_init.sql และ 002_auth.sql แล้ว
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/app-role.sql
-- แล้วให้แอปต่อด้วย role นี้แทน
--
-- รันซ้ำได้ — role อยู่ระดับคลัสเตอร์ ไม่ได้อยู่ในฐานข้อมูล จึงยังอยู่หลังกู้ระบบ
-- แต่สิทธิ์บนตารางหายไปพร้อมฐานข้อมูลเก่า ต้องรันไฟล์นี้ซ้ำทุกครั้งหลังกู้
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'dgl_app') then
    execute format('create role dgl_app login password %L', 'เปลี่ยนรหัสนี้ก่อนใช้จริง');
  end if;
end $$;

-- กันพลาด: ถ้ามี role อยู่แล้วแต่ถูกยกระดับสิทธิ์ไว้ RLS จะถูกข้ามเงียบ ๆ
alter role dgl_app nosuperuser nobypassrls nocreatedb nocreaterole;

-- เขตเวลาของกิจการ — ต้องตรงกับ SHOP_TZ ในแพ็กเกจ core
--
-- ค่าตั้งต้นของหลายคอลัมน์เป็น current_date และรายงานหลายตัวเทียบกับ current_date
-- ถ้าฐานข้อมูลเป็น UTC (ค่าตั้งต้นของ Docker และเซิร์ฟเวอร์ส่วนใหญ่)
-- ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าตามเวลาไทย ฐานข้อมูลจะยังนับเป็นเมื่อวาน
-- แล้ววันที่บนเอกสารกับวันที่ของการเคลื่อนไหวสต๊อกจะไม่ตรงกันโดยไม่มีอาการให้เห็น
alter role dgl_app set timezone = 'Asia/Bangkok';

-- ตั้งที่ระดับฐานข้อมูลด้วย เพื่อให้ทุกการเชื่อมต่อเห็นวันเดียวกัน
-- ไม่ใช่แค่แอป — psql ที่ผู้ดูแลเปิดดู สคริปต์สำรองข้อมูล และงาน cron
-- ถ้าตั้งเฉพาะ role ของแอป คนที่เข้ามาแก้ข้อมูลด้วยมือตอนตีสองจะลงวันที่ผิดโดยไม่รู้ตัว
do $$ begin
  execute format('alter database %I set timezone = %L', current_database(), 'Asia/Bangkok');
end $$;

grant usage on schema public to dgl_app;
grant select, insert, update, delete on all tables in schema public to dgl_app;
grant execute on all functions in schema public to dgl_app;

-- ตารางที่สร้างเพิ่มในอนาคตให้สิทธิ์อัตโนมัติ
alter default privileges in schema public
  grant select, insert, update, delete on tables to dgl_app;
alter default privileges in schema public
  grant execute on functions to dgl_app;

-- ---------------------------------------------------------------------
-- สคีมา auth — ให้เรียกฟังก์ชันได้เท่านั้น ห้ามแตะตาราง
--
-- ฟังก์ชันในนั้นเป็น SECURITY DEFINER จึงข้าม RLS ได้ตามหน้าที่ของมัน
-- ถ้าให้สิทธิ์ตารางไปด้วย แอปจะอ่าน session และ hash ของทุกอู่ได้ตรง ๆ
-- ซึ่งทำให้การแยกข้อมูลที่อุตส่าห์ทำไว้ไม่มีความหมาย
-- ---------------------------------------------------------------------
grant usage on schema auth to dgl_app;
grant execute on all functions in schema auth to dgl_app;
