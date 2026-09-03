-- =====================================================================
-- DriveGoLight! Web — ระบบเข้าสู่ระบบ (migration 002)
--
-- ปัญหาไก่กับไข่ของ multi-tenant + RLS
--   ตาราง users มี RLS กรองด้วย tenant_id แต่ตอนผู้ใช้กรอกอีเมลเข้ามา
--   เรายังไม่รู้ว่าเขาอยู่อู่ไหน จึงหาแถวไม่เจอเลย
--
-- ทางออกคือแยกงานยืนยันตัวตนไปไว้ในสคีมา auth ที่ role ของแอปแตะตารางตรง ๆ ไม่ได้
-- เข้าถึงได้เฉพาะผ่านฟังก์ชัน SECURITY DEFINER ที่เขียนไว้ให้ทำงานแคบ ๆ ทีละอย่าง
-- ทำแบบนี้แล้วช่องทางที่ข้าม RLS ได้มีอยู่เท่าที่เขียนไว้ในไฟล์นี้เท่านั้น ตรวจสอบได้หมด
--
-- ต้องรันหลัง 001_init.sql และก่อน app-role.sql
-- =====================================================================

create schema if not exists auth;

/* ---------------------------------------------------------------------
   อีเมลต้องไม่ซ้ำทั้งระบบ ไม่ใช่แค่ในอู่เดียวกัน
   เพราะตอนล็อกอินเรามีแค่อีเมล ถ้าซ้ำข้ามอู่จะไม่รู้ว่าหมายถึงใคร
   (ตรงกับที่ตกลงไว้ว่า 1 บัญชีผู้ใช้ = 1 อู่)
   --------------------------------------------------------------------- */
create unique index users_email_global_uidx on users (email) where email is not null;

/* ---------------------------------------------------------------------
   กันเดารหัสผ่าน — ล็อกชั่วคราวเมื่อกรอกผิดติดกันหลายครั้ง
   --------------------------------------------------------------------- */
alter table users add column failed_attempts integer not null default 0;
alter table users add column locked_until timestamptz;

/* ---------------------------------------------------------------------
   session ฝั่งเซิร์ฟเวอร์ — เพิกถอนได้ทันที ต่างจาก token ที่เซ็นแล้วปล่อยไป
   เก็บเฉพาะ hash ของ token ไม่เก็บตัว token เอง ฐานข้อมูลรั่วก็สวมสิทธิ์ไม่ได้
   --------------------------------------------------------------------- */
create table auth.sessions (
  token_hash    bytea       primary key,
  user_id       uuid        not null references users(id) on delete cascade,
  tenant_id     uuid        not null references tenants(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  user_agent    text
);

create index on auth.sessions (user_id);
create index on auth.sessions (expires_at);

/* ---------------------------------------------------------------------
   ลิงก์ตั้งรหัสผ่านครั้งแรกและลิงก์ลืมรหัสผ่าน
   ผู้ใช้ที่ย้ายมาจากไฟล์ HTML ไม่มีรหัสผ่านติดมาด้วย (ของเดิมเก็บเป็นข้อความธรรมดา)
   ทุกคนจึงต้องตั้งใหม่ผ่านลิงก์นี้
   --------------------------------------------------------------------- */
create table auth.setup_tokens (
  token_hash    bytea       primary key,
  user_id       uuid        not null references users(id) on delete cascade,
  purpose       text        not null check (purpose in ('initial', 'reset')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz
);

create index on auth.setup_tokens (user_id) where used_at is null;

/* =====================================================================
   ฟังก์ชันที่แอปเรียกได้ — ทุกตัวเป็น SECURITY DEFINER จึงข้าม RLS ได้
   ทำงานแคบที่สุดเท่าที่จำเป็น และตั้ง search_path ตายตัวกัน search_path hijack
   ===================================================================== */

/** หาผู้ใช้จากอีเมลเพื่อยืนยันตัวตน — คืน hash ให้แอปไปตรวจเอง ไม่ตรวจในฐานข้อมูล */
create or replace function auth.find_user_for_signin(p_email citext)
returns table (
  user_id        uuid,
  tenant_id      uuid,
  tenant_name    text,
  name           text,
  role           member_role,
  perms          text[],
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

/** บันทึกว่ากรอกรหัสผ่านผิด และล็อกชั่วคราวเมื่อผิดครบ 5 ครั้ง */
create or replace function auth.record_failed_signin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update users
     set failed_attempts = failed_attempts + 1,
         locked_until = case
           when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
           else locked_until
         end
   where id = p_user_id;
end;
$$;

/** ล็อกอินสำเร็จ — ล้างตัวนับและออก session ใหม่ */
create or replace function auth.create_session(
  p_user_id     uuid,
  p_token_hash  bytea,
  p_expires_at  timestamptz,
  p_user_agent  text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from users where id = p_user_id and active;
  if v_tenant is null then
    raise exception 'ไม่พบผู้ใช้ที่ใช้งานอยู่';
  end if;

  update users
     set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = p_user_id;

  insert into auth.sessions (token_hash, user_id, tenant_id, expires_at, user_agent)
  values (p_token_hash, p_user_id, v_tenant, p_expires_at, p_user_agent);
end;
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
  perms       text[]
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

/** ออกจากระบบเครื่องนี้ */
create or replace function auth.delete_session(p_token_hash bytea)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from auth.sessions where token_hash = p_token_hash;
$$;

/** ออกจากระบบทุกเครื่อง — ใช้ตอนเปลี่ยนรหัสผ่าน */
create or replace function auth.delete_sessions_of(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

/** ออกลิงก์ตั้งรหัสผ่าน — ยกเลิกลิงก์เก่าที่ยังไม่ถูกใช้ของคนเดียวกันทิ้ง */
create or replace function auth.issue_setup_token(
  p_user_id    uuid,
  p_token_hash bytea,
  p_purpose    text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from auth.setup_tokens where user_id = p_user_id and used_at is null;
  insert into auth.setup_tokens (token_hash, user_id, purpose, expires_at)
  values (p_token_hash, p_user_id, p_purpose, p_expires_at);
end;
$$;

/** ตรวจลิงก์ตั้งรหัสผ่านว่ายังใช้ได้ไหม — ยังไม่ใช้สิทธิ์ */
create or replace function auth.peek_setup_token(p_token_hash bytea)
returns table (user_id uuid, email citext, name text, tenant_name text, purpose text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select u.id, u.email, u.name, t.name, s.purpose
  from auth.setup_tokens s
  join users u on u.id = s.user_id
  join tenants t on t.id = u.tenant_id
  where s.token_hash = p_token_hash
    and s.used_at is null
    and s.expires_at > now()
    and u.active;
$$;

/**
 * ใช้ลิงก์ตั้งรหัสผ่าน — ตั้งรหัสใหม่ ปิดลิงก์ และไล่ session เดิมออกทั้งหมด
 * ทำในทรานแซกชันเดียว ถ้าลิงก์ถูกใช้ไปแล้วจะไม่มีอะไรเปลี่ยน
 */
create or replace function auth.consume_setup_token(
  p_token_hash    bytea,
  p_password_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  update auth.setup_tokens
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
  returning user_id into v_user;

  if v_user is null then
    return null;
  end if;

  update users
     set password_hash = p_password_hash,
         failed_attempts = 0,
         locked_until = null
   where id = v_user;

  delete from auth.sessions where user_id = v_user;
  return v_user;
end;
$$;

/**
 * สร้างบัญชีเจ้าของกิจการให้อู่ที่เพิ่งนำเข้าข้อมูล
 * ใช้ครั้งเดียวต่ออู่ — ถ้ามีเจ้าของอยู่แล้วจะคืนค่าว่าง
 */
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

  insert into users (tenant_id, code, name, email, role, perms, active)
  values (
    p_tenant_id, 'OWNER', coalesce(nullif(p_name, ''), 'เจ้าของกิจการ'), p_email, 'owner',
    array['customer','income','expense','stock','finance','settings'], true
  )
  returning id into v_id;

  return v_id;
end;
$$;

/* ---------------------------------------------------------------------
   สิทธิ์ — role ของแอปแตะตารางในสคีมา auth ตรง ๆ ไม่ได้เลย
   ทำได้แค่เรียกฟังก์ชันข้างบนนี้เท่านั้น
   --------------------------------------------------------------------- */
revoke all on schema auth from public;
revoke all on all tables in schema auth from public;
revoke all on all functions in schema auth from public;
