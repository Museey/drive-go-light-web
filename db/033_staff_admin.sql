-- 033 — ตั้งค่าพนักงาน: ตำแหน่งงาน และให้เจ้าของตั้งรหัสผ่านให้พนักงานได้เอง (19 ก.ย. 2569)
-- แผน PLAN-staff-admin-2569-09-19.md · เทสต์ apps/web/test/staff-admin-db.test.ts

-- ตำแหน่งงาน — พิมพ์เองอิสระ ใช้ทั้งในตารางพนักงานและใต้ชื่อผู้ลงนามบนเอกสารที่พิมพ์
alter table users add column if not exists job_title text not null default '';

/**
 * เจ้าของกิจการตั้งรหัสผ่านให้พนักงานโดยตรง (ผู้ใช้กำหนด 19 ก.ย. 2569)
 *
 * ทำสามอย่างในทรานแซกชันเดียว ไม่งั้นจะเหลือทางเข้าซ้อนกัน:
 *   1. ตั้งรหัสใหม่และล้างตัวนับล็อก
 *   2. ไล่ session เดิมของคนนั้นออกทุกเครื่อง — รหัสเปลี่ยนแล้วของเก่าต้องใช้ต่อไม่ได้
 *   3. ลบลิงก์ตั้งรหัสที่ยังไม่ได้ใช้ทิ้ง — ไม่งั้นลิงก์ที่ค้างอยู่ยังตั้งรหัสทับได้อีก
 *
 * ตรวจสิทธิ์ที่ชั้นแอป (เฉพาะ role เจ้าของ) — ฟังก์ชันนี้เป็นแค่การเขียนที่ครบชุด
 */
create or replace function auth.set_password(
  p_user          uuid,
  p_password_hash text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update users
     set password_hash = p_password_hash,
         failed_attempts = 0,
         locked_until = null
   where id = p_user;

  if not found then
    raise exception 'ไม่พบพนักงานที่จะตั้งรหัสผ่านให้';
  end if;

  delete from auth.sessions where user_id = p_user;
  delete from auth.setup_tokens where user_id = p_user and used_at is null;
end;
$$;

comment on function auth.set_password(uuid, text) is
  'เจ้าของกิจการตั้งรหัสผ่านให้พนักงาน — ไล่ session เดิมและลบลิงก์ตั้งรหัสที่ค้างอยู่';
