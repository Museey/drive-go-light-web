-- =====================================================================
-- DriveGoLight! Web — migration 019 · auth.create_owner() ตกค้างรุ่นเก่า เปิดอู่ใหม่ไม่ได้
--
-- **เจอตอนเพิ่มการเทียบเนื้อในฟังก์ชันเข้าไปในตัวตรวจไมเกรชัน**
-- ฐานที่ติดตั้งใหม่กับฐานที่อัปเกรดมามี auth.create_owner() คนละรุ่น —
-- ไฟล์ 002_auth.sql (ซึ่งเป็นภาพรวมสคีมา ไม่ได้ถูกรันซ้ำ) ถูกแก้ให้เขียน perms
-- เป็น jsonb ตอนที่ไมเกรชัน 007 เปลี่ยนคอลัมน์จาก text[] เป็น jsonb
-- แต่ไม่มีใครเขียนไฟล์ไมเกรชันคู่กันให้ฐานที่ติดตั้งไปแล้ว
--
-- ชื่อและพารามิเตอร์ของฟังก์ชันเหมือนกันเป๊ะ ตัวตรวจเดิมเทียบแค่สองอย่างนั้น
-- จึงไม่มีทางจับได้ ตอนนี้เทียบเนื้อในด้วยแล้ว
--
-- **อาการไม่ใช่ข้อมูลเพี้ยน แต่คือพังทันที**
--
--   ERROR: column "perms" is of type jsonb but expression is of type text[]
--
-- ฟังก์ชันนี้ถูกเรียกจากสองที่ที่สำคัญที่สุดตอนรับอู่ใหม่ —
-- `ops.open_shop()` (ปุ่มเปิดอู่ใหม่ในคอนโซล) และตัวนำเข้าไฟล์สำรอง
-- ฐานที่ตกค้างรุ่นเก่าจึงเปิดอู่ใหม่ไม่ได้เลย ทั้งที่อู่เดิมใช้งานได้ปกติทุกอย่าง
--
-- ตรวจว่าฐานไหนตกค้างได้ด้วย
--   select pg_get_functiondef('auth.create_owner(uuid,citext,text)'::regprocedure)
--     like '%jsonb_build_object%' as ok;
-- =====================================================================

set local lock_timeout = '5s';

create or replace function auth.create_owner(
  p_tenant_id uuid,
  p_email     citext,
  p_name      text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from users where tenant_id = p_tenant_id and role = 'owner') then
    return null;
  end if;

  -- เจ้าของข้ามด่านสิทธิ์ทุกด่านอยู่แล้วจาก role — perms ว่างไว้ได้
  -- แต่ใส่ menus ครบให้เผื่อวันหนึ่งถูกลดเป็นพนักงาน จะได้ไม่เสียสิทธิ์เงียบ ๆ
  insert into users (tenant_id, code, name, email, role, perms, active)
  values (
    p_tenant_id, 'OWNER', coalesce(nullif(p_name, ''), 'เจ้าของกิจการ'), p_email, 'owner',
    jsonb_build_object('menus', jsonb_build_object(
      'customer', true, 'income', true, 'expense', true,
      'stock', true, 'finance', true, 'settings', true)),
    true
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- เผื่อฐานที่ยังมี perms เป็นอาเรย์ค้างอยู่ (ฐานที่ยังไม่ได้ผ่านไมเกรชัน 007
-- ตอนที่มีเจ้าของอยู่แล้ว) — แตะเฉพาะแถวที่เป็นอาเรย์จริง ๆ
-- ฐานที่ผ่าน 007 มาแล้วจะไม่มีแถวไหนเข้าเงื่อนไขนี้ คำสั่งนี้จึงไม่ทำอะไร
update users
   set perms = jsonb_build_object('menus', jsonb_build_object(
         'customer', true, 'income', true, 'expense', true,
         'stock', true, 'finance', true, 'settings', true))
 where role = 'owner'
   and jsonb_typeof(perms) = 'array';
