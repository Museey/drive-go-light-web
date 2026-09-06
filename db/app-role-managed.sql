-- =====================================================================
-- role ของแอป สำหรับ Postgres แบบ managed (Render · Railway · Neon)
--
-- ใช้แทน db/app-role.sql เมื่อเราไม่ได้เป็น superuser ของเซิร์ฟเวอร์
-- ต่างกันสามอย่าง
--   1. ไม่สั่ง alter role ... nosuperuser nobypassrls  เพราะทำไม่ได้และ**ไม่จำเป็น**
--      role ที่สร้างใหม่ได้คุณสมบัติเหล่านี้เป็นค่าตั้งต้นอยู่แล้ว
--   2. ไม่ตั้งเขตเวลาระดับฐานข้อมูลให้ — แยกเป็นคำสั่งเดียวข้างล่าง เผื่อทำไม่ได้
--   3. ให้สิทธิ์บนตารางที่ role อื่นเป็นเจ้าของ ไม่ใช่ตารางของตัวเอง
--
-- **ทำไมต้องมี role แยก ทั้งที่ role ที่ได้มาก็ไม่ข้าม RLS อยู่แล้ว**
--
-- เพราะ role ที่แพลตฟอร์มให้มาเป็น "เจ้าของตาราง" และเจ้าของตารางสั่ง
-- alter table ... no force row level security ได้ — ปิดเกราะของตัวเองได้ในคำสั่งเดียว
-- ถ้าวันหนึ่งมีช่องโหว่ที่ยิง SQL อะไรก็ได้ ความต่างนี้คือ "เห็นเฉพาะอู่ตัวเอง"
-- กับ "เห็นทุกอู่" — ซึ่งเป็นสิ่งเดียวที่ระบบหลายอู่ต้องไม่พลาด
--
-- รันด้วย role ที่แพลตฟอร์มให้มา หลังรันไมเกรชันครบแล้ว
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v app_password=รหัสที่สุ่มมา -f db/app-role-managed.sql
--
-- รันซ้ำได้ — ถ้ามี role อยู่แล้วจะเปลี่ยนรหัสผ่านให้เป็นค่าใหม่
-- =====================================================================

\if :{?app_password}
\else
  \echo 'ต้องส่งรหัสผ่านเข้ามาด้วย  -v app_password="''รหัส''"'
  \quit 1
\endif

-- psql ไม่แทนค่าตัวแปรข้างในบล็อก $$ ... $$ จึงประกอบคำสั่งแล้วสั่งรันด้วย \gexec แทน
select 'create role dgl_app login'
 where not exists (select 1 from pg_roles where rolname = 'dgl_app')
\gexec

select format('alter role dgl_app password %L', :'app_password')
\gexec

-- เขตเวลา — ต้องตรงกับ SHOP_TZ ในแพ็กเกจ core ไม่งั้นแอปปฏิเสธไม่ยอมทำงาน
alter role dgl_app set timezone = 'Asia/Bangkok';

-- สิทธิ์บนสคีมา public — อ่านเขียนข้อมูลได้ แต่ **ไม่ได้เป็นเจ้าของตาราง**
-- จึงสั่งปิด force row level security ของตัวเองไม่ได้
grant usage on schema public to dgl_app;
grant select, insert, update, delete on all tables in schema public to dgl_app;
grant usage, select on all sequences in schema public to dgl_app;
grant execute on all functions in schema public to dgl_app;

-- ตารางที่สร้างเพิ่มในอนาคตให้สิทธิ์อัตโนมัติ
-- ผูกกับ role ที่รันไฟล์นี้ ซึ่งเป็นตัวเดียวกับที่รันไมเกรชัน
alter default privileges in schema public
  grant select, insert, update, delete on tables to dgl_app;
alter default privileges in schema public
  grant usage, select on sequences to dgl_app;
alter default privileges in schema public
  grant execute on functions to dgl_app;

-- สคีมา auth — เรียกฟังก์ชันได้เท่านั้น ห้ามแตะตาราง
-- ฟังก์ชันข้างในเป็น SECURITY DEFINER จึงข้าม RLS ได้ตามหน้าที่ของมัน
-- ถ้าให้สิทธิ์ตารางไปด้วย แอปจะอ่าน session และ hash ของทุกอู่ได้ตรง ๆ
grant usage on schema auth to dgl_app;
grant execute on all functions in schema auth to dgl_app;
alter default privileges in schema auth grant execute on functions to dgl_app;

-- สคีมา ops — เขียนข้อผิดพลาดได้ อ่านได้ แต่ลบไม่ได้
-- คนที่ทำระบบพังต้องลบร่องรอยไม่ได้
grant usage on schema ops to dgl_app;
grant select, insert, update on ops.errors to dgl_app;
grant usage, select on sequence ops.errors_id_seq to dgl_app;
grant select on ops.migrations to dgl_app;

\echo 'สร้าง role dgl_app แล้ว — ตั้ง DATABASE_URL ให้ชี้มาที่ role นี้'
