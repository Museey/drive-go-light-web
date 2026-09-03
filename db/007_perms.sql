-- =====================================================================
-- DriveGoLight! Web — migration 007 · สิทธิ์แบบละเอียด (07.2)
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้เท่านั้น
-- การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql อยู่แล้ว ไม่ต้องรันไฟล์นี้
--
-- รัน:  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/007_perms.sql
--
-- **ไม่มีใครเสียสิทธิ์จากการอัปเกรด** — อาเรย์ชื่อเมนูเดิมกลายเป็น menus
-- ส่วน cost กับ homeReport ตั้งเป็น true ให้ทุกคน เพราะของเดิมไม่เคยซ่อนอะไร
-- =====================================================================

alter table users add column if not exists perms_json jsonb not null default '{}'::jsonb;

update users set perms_json = jsonb_build_object(
  'menus', coalesce(
    (select jsonb_object_agg(k, true) from unnest(perms) k), '{}'::jsonb),
  'cost', true,
  'homeReport', true
) where perms_json = '{}'::jsonb;

alter table users drop constraint if exists users_perms_valid;
alter table users drop column perms;
alter table users rename column perms_json to perms;

alter table users add constraint users_perms_object check (jsonb_typeof(perms) = 'object');

comment on column users.code is
  'รหัสพนักงานสำหรับอ้างอิงในเอกสารและประวัติการแก้ไข — ไม่ใช่รหัสเข้าระบบ (เข้าด้วยอีเมล)';

-- จำนวนบัญชีพนักงานที่แพ็กเกจเปิดได้ · null = ไม่จำกัด · เจ้าของไม่ถูกนับ
alter table subscriptions add column if not exists max_users integer
  check (max_users is null or max_users > 0);

comment on column subscriptions.max_users is
  'จำนวนบัญชีพนักงานที่แพ็กเกจนี้เปิดได้ · null = ไม่จำกัด · ตรวจตอนสร้างบัญชีเท่านั้น';

-- ฟังก์ชัน auth ที่คืน perms ต้องเปลี่ยนชนิดตาม — drop ก่อนเพราะเปลี่ยน return type ไม่ได้
drop function if exists auth.find_user_for_signin(citext);
drop function if exists auth.load_session(bytea);

-- นิยามใหม่ (คัดลอกจาก 002_auth.sql — ต้องตรงกันเสมอ)
/** หาผู้ใช้จากอีเมลเพื่อยืนยันตัวตน — คืน hash ให้แอปไปตรวจเอง ไม่ตรวจในฐานข้อมูล */
create or replace function auth.find_user_for_signin(p_email citext)
returns table (
  user_id        uuid,
  tenant_id      uuid,
  tenant_name    text,
  name           text,
  role           member_role,
  perms          jsonb,
  password_hash  text,
  active         boolean,
  locked_until   timestamptz,
  failed_attempts integer
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select u.id, u.tenant_id, t.name, u.name, u.role, u.perms,
         u.password_hash, u.active, u.locked_until, u.failed_attempts
  from users u
  join tenants t on t.id = u.tenant_id
  where u.email = p_email;
$$;

/**
 * อ่าน session จาก token — คืนแถวว่างถ้าหมดอายุ ถูกเพิกถอน หรือผู้ใช้ถูกปิดการใช้งาน
 * ถือโอกาสอัปเดต last_seen_at และเก็บกวาด session ที่หมดอายุไปพร้อมกัน
 */
create or replace function auth.load_session(p_token_hash bytea)
returns table (
  user_id     uuid,
  tenant_id   uuid,
  tenant_name text,
  name        text,
  role        member_role,
  perms       jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from auth.sessions where expires_at < now() - interval '7 days';

  update auth.sessions set last_seen_at = now()
   where token_hash = p_token_hash and expires_at > now();

  return query
    select u.id, u.tenant_id, t.name, u.name, u.role, u.perms
    from auth.sessions s
    join users u on u.id = s.user_id
    join tenants t on t.id = u.tenant_id
    where s.token_hash = p_token_hash
      and s.expires_at > now()
      and u.active;
end;
$$;

grant execute on all functions in schema auth to dgl_app;
