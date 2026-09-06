-- =====================================================================
-- DriveGoLight! Web — migration 011 · คอนโซลผู้ให้บริการ
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้ การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql
-- ตัวรันครอบ begin/commit ให้ทั้งไฟล์แล้ว ห้ามใส่เอง (ดู tools/migrate.impl.mjs)
--
-- ---------------------------------------------------------------------
-- หลักที่ใช้ออกแบบไฟล์นี้
--
-- 1. **ด่านตรวจสิทธิ์อยู่ในฟังก์ชัน ไม่ใช่ในโค้ดแอป** ทุกฟังก์ชันรับ session hash
--    เข้าไปแล้วตรวจเอง โค้ดแอปที่เขียนผิดหรือถูกหลอกให้เรียก ก็ยังทำอะไรไม่ได้
--    ถ้าไม่มีโทเคนจริง
--
-- 2. **ผู้ให้บริการอ่านข้อมูลธุรกิจของอู่ไม่ได้เลย** นโยบาย RLS ที่เพิ่มในไฟล์นี้
--    แตะแค่สองตาราง — tenants กับ subscriptions ซึ่งเป็นข้อมูลของ *การเป็นลูกค้าเรา*
--    ไม่ใช่ข้อมูลของอู่ ตาราง documents · contacts · products และที่เหลือ **ไม่ถูกแตะ**
--    จึงไม่มีทางอ่านได้ไม่ว่าเรียกอะไร
--
-- 3. **ทุกการกระทำถูกจดไว้** โดยตัวฟังก์ชันเอง ไม่ใช่โดยโค้ดแอป จึงไม่มีทางลืม
-- =====================================================================

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- ตัวตนของผู้ให้บริการ — คนละตารางกับ users ของอู่โดยตั้งใจ
--
-- users ทุกแถวมี tenant_id และอยู่ใต้ RLS ผู้ให้บริการไม่ได้สังกัดอู่ไหน
-- ถ้ายัดเข้าไปต้องแต่ง tenant ปลอมให้ แล้วทุกด่านตรวจสิทธิ์ในระบบ
-- (canTab canEdit canExport canCost) ต้องจำให้ได้ว่าต้องกัน role นี้ออกด้วย
-- ลืมด่านเดียวคือเจ้าของอู่ยกระดับตัวเองเป็นผู้ให้บริการได้
-- ---------------------------------------------------------------------
create table if not exists ops.operators (
  id             uuid        primary key default gen_random_uuid(),
  email          citext      not null unique,
  name           text        not null default '',
  password_hash  text,                                  -- null = ยังไม่ได้ตั้งรหัสผ่าน
  active         boolean     not null default true,
  failed_attempts integer    not null default 0,
  locked_until   timestamptz,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);

comment on table ops.operators is
  'บัญชีผู้ให้บริการ — ไม่สังกัดอู่ไหน จึงไม่อยู่ในตาราง users';

create table if not exists ops.sessions (
  token_hash   bytea       primary key,
  operator_id  uuid        not null references ops.operators(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  user_agent   text
);

create index if not exists ops_sessions_operator_idx on ops.sessions (operator_id);
create index if not exists ops_sessions_expires_idx on ops.sessions (expires_at);

create table if not exists ops.setup_tokens (
  token_hash  bytea       primary key,
  operator_id uuid        not null references ops.operators(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- ---------------------------------------------------------------------
-- บันทึกการใช้งานคอนโซล
--
-- บัญชีนี้เปิดอู่ใหม่ได้และออกลิงก์ตั้งรหัสผ่านของคนอื่นได้ ถ้าวันหนึ่งถูกใช้ในทางที่ผิด
-- หรือเครื่องของผู้ให้บริการหาย ต้องมีบันทึกว่าเกิดอะไรขึ้นบ้าง — ย้อนหลังไม่ได้
--
-- tenant_id **ไม่มี foreign key โดยตั้งใจ** บันทึกว่าเคยทำอะไรกับอู่หนึ่ง
-- ต้องอยู่ต่อแม้อู่นั้นถูกลบไปแล้ว ซึ่งเป็นกรณีที่บันทึกมีค่าที่สุดพอดี
-- ---------------------------------------------------------------------
create table if not exists ops.audit (
  id             bigint      generated always as identity primary key,
  at             timestamptz not null default now(),
  operator_id    uuid        references ops.operators(id) on delete set null,
  operator_email text        not null default '',       -- อีเมล ณ ตอนนั้น เผื่อบัญชีถูกลบ
  action         text        not null,
  tenant_id      uuid,
  detail         jsonb       not null default '{}'::jsonb
);

create index if not exists ops_audit_at_idx on ops.audit (at desc);
create index if not exists ops_audit_tenant_idx on ops.audit (tenant_id, at desc);

-- =====================================================================
-- ด่านตรวจ session — ทุกฟังก์ชันด้านล่างเรียกตัวนี้เป็นบรรทัดแรก
-- =====================================================================

/**
 * แปลง session hash เป็นตัวตนผู้ให้บริการ — โยน error ถ้าใช้ไม่ได้
 *
 * โยนแทนที่จะคืน null เพราะทุกจุดที่เรียกต้องหยุดทันที ไม่ใช่ทำงานต่อด้วยค่าว่าง
 * ข้อความเหมือนกันหมดไม่ว่าจะพลาดตรงไหน — ไม่บอกว่าโทเคนนี้เคยมีอยู่จริงหรือไม่
 */
create or replace function ops.require_session(p_session bytea)
returns uuid
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_id uuid;
begin
  select s.operator_id into v_id
    from ops.sessions s
    join ops.operators o on o.id = s.operator_id
   where s.token_hash = p_session
     and s.expires_at > now()
     and o.active;

  if v_id is null then
    raise exception 'ไม่มีสิทธิ์ใช้คอนโซลผู้ให้บริการ' using errcode = '42501';
  end if;

  update ops.sessions set last_seen_at = now() where token_hash = p_session;

  /* ตั้งไว้ให้นโยบาย ops_read บน tenants กับ subscriptions ใช้ต่อในทรานแซกชันนี้
     ตั้ง **หลัง** ตรวจผ่านแล้วเท่านั้น และตั้งแบบ local จึงไม่ค้างข้าม request */
  perform set_config('app.ops_session', encode(p_session, 'hex'), true);

  return v_id;
end;
$$;

/** จดบันทึก — เรียกจากในฟังก์ชันเท่านั้น ไม่เปิดให้แอปเรียกตรง ๆ */
create or replace function ops.log(
  p_operator uuid, p_action text, p_tenant uuid, p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  insert into ops.audit (operator_id, operator_email, action, tenant_id, detail)
  select p_operator, coalesce(o.email::text, ''), p_action, p_tenant,
         coalesce(p_detail, '{}'::jsonb)
    from (select 1) x
    left join ops.operators o on o.id = p_operator;
end;
$$;

-- =====================================================================
-- ล็อกอินของคอนโซล
-- =====================================================================

/** คืน hash ให้แอปตรวจเอง แบบเดียวกับ auth.find_user_for_signin */
create or replace function ops.find_operator_for_signin(p_email citext)
returns table (
  operator_id     uuid,
  name            text,
  password_hash   text,
  active          boolean,
  locked_until    timestamptz,
  failed_attempts integer
)
language sql
security definer
set search_path = ops, public, pg_temp
stable
as $$
  select o.id, o.name, o.password_hash, o.active, o.locked_until, o.failed_attempts
    from ops.operators o
   where o.email = p_email;
$$;

/**
 * กรอกรหัสผ่านผิด — ล็อก 15 นาทีเมื่อครบ 5 ครั้ง และ**จดไว้ด้วย**
 * ต่างจากฝั่งอู่ตรงที่จด เพราะการเดารหัสผ่านคอนโซลคือสัญญาณที่ต้องเห็น
 */
create or replace function ops.record_failed_signin(p_operator uuid)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  update ops.operators
     set failed_attempts = failed_attempts + 1,
         locked_until = case
           when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
           else locked_until
         end
   where id = p_operator;

  perform ops.log(p_operator, 'signin_failed', null, '{}'::jsonb);
end;
$$;

create or replace function ops.create_session(
  p_operator   uuid,
  p_token_hash bytea,
  p_expires_at timestamptz,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  if not exists (select 1 from ops.operators where id = p_operator and active) then
    raise exception 'ไม่พบบัญชีผู้ให้บริการที่ใช้งานอยู่';
  end if;

  update ops.operators
     set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = p_operator;

  insert into ops.sessions (token_hash, operator_id, expires_at, user_agent)
  values (p_token_hash, p_operator, p_expires_at, p_user_agent);

  perform ops.log(p_operator, 'signin', null, '{}'::jsonb);
end;
$$;

/** อ่าน session — เก็บกวาดตัวที่หมดอายุไปด้วยในตัว */
create or replace function ops.load_session(p_token_hash bytea)
returns table (operator_id uuid, email citext, name text)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  delete from ops.sessions where expires_at < now() - interval '7 days';

  return query
    update ops.sessions s
       set last_seen_at = now()
      from ops.operators o
     where s.token_hash = p_token_hash
       and s.operator_id = o.id
       and s.expires_at > now()
       and o.active
    returning o.id, o.email, o.name;
end;
$$;

create or replace function ops.delete_session(p_token_hash bytea)
returns void
language sql
security definer
set search_path = ops, public, pg_temp
as $$
  delete from ops.sessions where token_hash = p_token_hash;
$$;

-- =====================================================================
-- ลิงก์ตั้งรหัสผ่านของผู้ให้บริการ
-- =====================================================================

create or replace function ops.issue_setup_token(
  p_operator   uuid,
  p_token_hash bytea,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  delete from ops.setup_tokens where operator_id = p_operator and used_at is null;
  insert into ops.setup_tokens (token_hash, operator_id, expires_at)
  values (p_token_hash, p_operator, p_expires_at);
end;
$$;

create or replace function ops.peek_setup_token(p_token_hash bytea)
returns table (operator_id uuid, email citext, name text)
language sql
security definer
set search_path = ops, public, pg_temp
stable
as $$
  select o.id, o.email, o.name
    from ops.setup_tokens s
    join ops.operators o on o.id = s.operator_id
   where s.token_hash = p_token_hash
     and s.used_at is null
     and s.expires_at > now()
     and o.active;
$$;

/** ตั้งรหัสผ่าน แล้วไล่ session เดิมออกทั้งหมด เผื่อลิงก์เคยหลุดไปถึงมือคนอื่น */
create or replace function ops.consume_setup_token(
  p_token_hash    bytea,
  p_password_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op uuid;
begin
  update ops.setup_tokens
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
  returning operator_id into v_op;

  if v_op is null then return null; end if;

  update ops.operators
     set password_hash = p_password_hash, failed_attempts = 0, locked_until = null
   where id = v_op;

  delete from ops.sessions where operator_id = v_op;
  perform ops.log(v_op, 'password_set', null, '{}'::jsonb);
  return v_op;
end;
$$;

-- =====================================================================
-- นโยบาย RLS สำหรับผู้ให้บริการ
--
-- **แตะแค่สองตาราง** — tenants กับ subscriptions ซึ่งเป็นข้อมูลของ "การเป็นลูกค้าเรา"
-- ไม่ใช่ข้อมูลของอู่ ตาราง documents · contacts · products · doc_items และที่เหลือ
-- ไม่ถูกแตะเลย จึงไม่มีทางอ่านได้ไม่ว่าจะเรียกอะไร
--
-- ประตูคือ **การถือ session ที่ใช้ได้จริง** ไม่ใช่แค่การตั้งตัวแปร — แอปตั้ง
-- app.ops_session เป็นค่าอะไรก็ได้ แต่ค่าที่ผ่านต้องตรงกับแถวใน ops.sessions
-- ที่ยังไม่หมดอายุ ซึ่งปลอมไม่ได้ถ้าไม่มีคนล็อกอินจริง
-- =====================================================================

/** มี session ผู้ให้บริการที่ใช้ได้อยู่ไหม — อ่านจากตัวแปรที่ตั้งไว้ในทรานแซกชัน */
create or replace function ops.viewing()
returns boolean
language sql
security definer
set search_path = ops, public, pg_temp
stable
as $$
  select exists (
    select 1
      from ops.sessions s
      join ops.operators o on o.id = s.operator_id
     where s.token_hash = decode(
             nullif(current_setting('app.ops_session', true), ''), 'hex')
       and s.expires_at > now()
       and o.active
  );
$$;

do $policy$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'tenants'
                    and policyname = 'ops_read') then
    execute 'create policy ops_read on tenants for select using (ops.viewing())';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'subscriptions'
                    and policyname = 'ops_read') then
    execute 'create policy ops_read on subscriptions for select using (ops.viewing())';
  end if;
end $policy$;

-- =====================================================================
-- งานของคอนโซล
-- =====================================================================

/**
 * รายชื่ออู่ — **เฉพาะข้อมูลการเป็นลูกค้า ไม่มีข้อมูลธุรกิจของอู่เลย**
 *
 * ไม่คำนวณสถานะลิขสิทธิ์ในนี้ คืนข้อเท็จจริงดิบออกไปให้ computeLicense() ฝั่ง
 * TypeScript คิดต่อ — ตรรกะเรื่องช่วงทดลองใช้กับวันหมดอายุมีที่อยู่ที่เดียว
 * ถ้าเขียนซ้ำในนี้ วันหนึ่งสองที่จะไม่ตรงกันแล้วไม่มีใครรู้ว่าอันไหนถูก
 *
 * จำนวนผู้ใช้อ่านทีละอู่โดยตั้ง app.tenant_id ชั่วคราว **เพื่อไม่ต้องเปิด users
 * ให้ผู้ให้บริการทั้งตาราง** ซึ่งจะทำให้อ่าน password_hash ของทุกคนได้ไปด้วย
 */
create or replace function ops.list_shops(p_session bytea)
returns table (
  tenant_id   uuid,
  name        text,
  created_on  date,
  expires_on  date,
  plan        text,
  ever_paid   boolean,
  user_count  integer,
  max_users   integer
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_prev  text := coalesce(current_setting('app.tenant_id', true), '');
  v_rows  jsonb;
  r       jsonb;
  v_n     integer;
begin
  perform ops.require_session(p_session);

  /* รวบผลลัพธ์ให้จบก่อนแล้วค่อยวน — ระหว่างวนเราสลับ app.tenant_id ไปมา
     ถ้าวนบนเคอร์เซอร์ที่ยังอ่านค้างอยู่ การสลับตัวแปรจะไปกระทบแถวที่ยังไม่ได้ดึง */
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'id', t.id, 'name', t.name, 'created_on', t.created_at::date,
               'expires_on', s.expires_on, 'plan', s.plan, 'max_users', s.max_users,
               'ever_paid', exists (select 1 from subscriptions y where y.tenant_id = t.id)
             ) as x
        from tenants t
        left join lateral (
          select * from subscriptions s2
           where s2.tenant_id = t.id
           order by s2.expires_on desc limit 1
        ) s on true
    ) q;

  for r in select * from jsonb_array_elements(v_rows)
  loop
    /* นับผู้ใช้ทีละอู่ **เพื่อไม่ต้องเปิด users ให้ผู้ให้บริการทั้งตาราง**
       ซึ่งจะทำให้อ่าน password_hash ของทุกคนได้ไปด้วย */
    perform set_config('app.tenant_id', r->>'id', true);
    select count(*)::int into v_n from users where active;

    tenant_id  := (r->>'id')::uuid;
    name       := r->>'name';
    created_on := (r->>'created_on')::date;
    expires_on := (r->>'expires_on')::date;
    plan       := r->>'plan';
    ever_paid  := (r->>'ever_paid')::boolean;
    user_count := v_n;
    max_users  := (r->>'max_users')::integer;
    return next;
  end loop;

  perform set_config('app.tenant_id', v_prev, true);
end;
$$;

/**
 * อีเมลนี้ถูกใช้ไปแล้วไหม ข้ามทุกอู่
 * แยกเป็นฟังก์ชันเพราะต้องข้าม RLS ของ users ซึ่งเราตั้งใจไม่เปิดให้ผู้ให้บริการอ่าน
 * — ตัวนี้ตอบแค่ว่า "ซ้ำหรือไม่" ไม่คืนข้อมูลของใครออกมาเลย
 */
create or replace function ops.email_taken(p_email citext)
returns table (found boolean)
language sql
security definer
set search_path = ops, public, pg_temp
stable
as $$
  select true from users u where u.email = p_email limit 1;
$$;

/**
 * เปิดอู่ใหม่พร้อมบัญชีเจ้าของ — ทรานแซกชันเดียว ล้มที่ไหนก็ไม่มีอะไรค้าง
 *
 * ต้องตั้ง app.tenant_id ให้เป็นอู่ใหม่ก่อนแทรกแถวแรก ไม่งั้น RLS ปฏิเสธทุกอย่าง
 * รวมถึงตาราง tenants เอง — เหมือนที่ตัวนำเข้าทำ
 */
create or replace function ops.open_shop(
  p_session     bytea,
  p_name        text,
  p_tel         text,
  p_owner_email citext,
  p_owner_name  text,
  p_token_hash  bytea,
  p_expires_at  timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op     uuid := ops.require_session(p_session);
  v_prev   text := coalesce(current_setting('app.tenant_id', true), '');
  v_tenant uuid := gen_random_uuid();
  v_owner  uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'ต้องกรอกชื่ออู่';
  end if;
  if coalesce(trim(p_owner_email::text), '') = '' then
    raise exception 'ต้องกรอกอีเมลของเจ้าของอู่';
  end if;

  /* อีเมลซ้ำกับผู้ใช้ของอู่อื่นไม่ได้ — ระบบล็อกอินหาผู้ใช้จากอีเมลอย่างเดียว
     ถ้ามีสองแถว จะเข้าได้แค่แถวเดียวโดยไม่มีใครรู้ว่าทำไมอีกอันเข้าไม่ได้ */
  if exists (select 1 from ops.email_taken(p_owner_email)) then
    raise exception 'อีเมล % ถูกใช้กับอู่อื่นอยู่แล้ว', p_owner_email;
  end if;

  perform set_config('app.tenant_id', v_tenant::text, true);

  insert into tenants (id, name, tel) values (v_tenant, trim(p_name), coalesce(p_tel, ''));

  v_owner := auth.create_owner(v_tenant, p_owner_email, coalesce(p_owner_name, ''));
  if v_owner is null then
    raise exception 'สร้างบัญชีเจ้าของไม่สำเร็จ';
  end if;

  perform auth.issue_setup_token(v_owner, p_token_hash, 'initial', p_expires_at);

  perform set_config('app.tenant_id', v_prev, true);
  perform ops.log(v_op, 'open_shop', v_tenant,
    jsonb_build_object('name', trim(p_name), 'owner_email', p_owner_email::text));
  return v_tenant;
end;
$$;

/** ออกลิงก์ตั้งรหัสผ่านใหม่ให้เจ้าของอู่ — ลิงก์เก่าถูกยกเลิกไปด้วย */
create or replace function ops.issue_owner_reset(
  p_session    bytea,
  p_tenant     uuid,
  p_token_hash bytea,
  p_expires_at timestamptz
)
returns citext
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op    uuid := ops.require_session(p_session);
  v_prev  text := coalesce(current_setting('app.tenant_id', true), '');
  v_user  uuid;
  v_email citext;
begin
  perform set_config('app.tenant_id', p_tenant::text, true);

  select u.id, u.email into v_user, v_email
    from users u where u.role = 'owner' and u.active limit 1;

  if v_user is null then
    perform set_config('app.tenant_id', v_prev, true);
    raise exception 'อู่นี้ยังไม่มีบัญชีเจ้าของที่ใช้งานอยู่';
  end if;

  perform auth.issue_setup_token(v_user, p_token_hash, 'reset', p_expires_at);

  perform set_config('app.tenant_id', v_prev, true);
  perform ops.log(v_op, 'issue_owner_reset', p_tenant,
    jsonb_build_object('email', v_email::text));
  return v_email;
end;
$$;

/** บันทึกการต่ออายุ */
create or replace function ops.record_renewal(
  p_session bytea,
  p_tenant  uuid,
  p_plan    text,
  p_from    date,
  p_to      date,
  p_amount  numeric,
  p_note    text
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op   uuid := ops.require_session(p_session);
  v_prev text := coalesce(current_setting('app.tenant_id', true), '');
begin
  if p_to <= p_from then
    raise exception 'วันหมดอายุต้องอยู่หลังวันเริ่ม';
  end if;

  perform set_config('app.tenant_id', p_tenant::text, true);
  insert into subscriptions (tenant_id, plan, started_on, expires_on, amount, note)
  values (p_tenant, coalesce(nullif(p_plan, ''), 'light-yearly'), p_from, p_to,
          p_amount, nullif(p_note, ''));
  perform set_config('app.tenant_id', v_prev, true);

  perform ops.log(v_op, 'record_renewal', p_tenant,
    jsonb_build_object('from', p_from, 'to', p_to, 'amount', p_amount));
end;
$$;

/**
 * ปรับจำนวนที่นั่งพนักงาน
 * ลดให้น้อยกว่าที่ใช้อยู่ได้ **แต่ไม่ล็อกใครออก** — ตรวจตอนสร้างบัญชีใหม่เท่านั้น
 * ตามที่คอมเมนต์ในสคีมาเขียนไว้ตั้งแต่ต้น
 */
create or replace function ops.set_max_users(
  p_session bytea, p_tenant uuid, p_max integer
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op   uuid := ops.require_session(p_session);
  v_prev text := coalesce(current_setting('app.tenant_id', true), '');
  v_id   uuid;
begin
  if p_max is not null and p_max <= 0 then
    raise exception 'จำนวนที่นั่งต้องมากกว่าศูนย์ หรือเว้นว่างไว้ถ้าไม่จำกัด';
  end if;

  perform set_config('app.tenant_id', p_tenant::text, true);
  select id into v_id from subscriptions
   where tenant_id = p_tenant order by expires_on desc limit 1;
  if v_id is null then
    perform set_config('app.tenant_id', v_prev, true);
    raise exception 'อู่นี้ยังไม่มีการสมัครใช้บริการ — บันทึกการต่ออายุก่อน';
  end if;
  update subscriptions set max_users = p_max where id = v_id;
  perform set_config('app.tenant_id', v_prev, true);

  perform ops.log(v_op, 'set_max_users', p_tenant,
    jsonb_build_object('max_users', p_max));
end;
$$;

/** เพิ่มบัญชีผู้ให้บริการอีกคน */
create or replace function ops.add_operator(
  p_session    bytea,
  p_email      citext,
  p_name       text,
  p_token_hash bytea,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op  uuid := ops.require_session(p_session);
  v_new uuid;
begin
  insert into ops.operators (email, name) values (p_email, coalesce(p_name, ''))
  returning id into v_new;

  perform ops.issue_setup_token(v_new, p_token_hash, p_expires_at);
  perform ops.log(v_op, 'add_operator', null,
    jsonb_build_object('email', p_email::text));
  return v_new;
end;
$$;

create or replace function ops.list_operators(p_session bytea)
returns table (
  id uuid, email citext, name text, active boolean,
  has_password boolean, last_login_at timestamptz
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  perform ops.require_session(p_session);
  return query
    select o.id, o.email, o.name, o.active,
           o.password_hash is not null, o.last_login_at
      from ops.operators o order by o.email;
end;
$$;

/** ปิดหรือเปิดบัญชีผู้ให้บริการ — ปิดแล้ว session ที่ค้างอยู่ถูกไล่ออกทันที */
create or replace function ops.set_operator_active(
  p_session bytea, p_operator uuid, p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op uuid := ops.require_session(p_session);
begin
  if v_op = p_operator and not p_active then
    raise exception 'ปิดบัญชีของตัวเองไม่ได้';
  end if;

  update ops.operators set active = p_active where id = p_operator;
  if not p_active then
    delete from ops.sessions where operator_id = p_operator;
  end if;

  perform ops.log(v_op, case when p_active then 'enable_operator' else 'disable_operator' end,
    null, jsonb_build_object('operator_id', p_operator));
end;
$$;

create or replace function ops.list_errors(p_session bytea, p_limit integer default 100)
returns table (
  id bigint, at timestamptz, kind text, message text, tenant_id uuid, digest text
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  perform ops.require_session(p_session);
  return query
    select e.id, e.at, e.kind, e.message, e.tenant_id, e.digest
      from ops.errors e
     order by e.at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function ops.list_audit(p_session bytea, p_limit integer default 200)
returns table (
  id bigint, at timestamptz, operator_email text, action text,
  tenant_id uuid, detail jsonb
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  perform ops.require_session(p_session);
  return query
    select a.id, a.at, a.operator_email, a.action, a.tenant_id, a.detail
      from ops.audit a
     order by a.at desc
     limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;

-- =====================================================================
-- สิทธิ์
--
-- **Postgres ให้สิทธิ์ execute กับ PUBLIC เป็นค่าตั้งต้น** ทุกฟังก์ชันที่สร้างขึ้นมา
-- จึงเรียกได้โดยทุก role ทันทีโดยไม่ต้อง grant อะไรเลย การ revoke จาก dgl_app
-- อย่างเดียวจึงไม่มีผล เพราะสิทธิ์ยังมาทาง PUBLIC อยู่
--
-- ตัดจาก PUBLIC ให้หมดก่อน แล้วค่อยให้ทีละตัวเท่าที่แอปต้องเรียกจริง
-- ตัวที่ไม่อยู่ในรายการคือตัวที่เรียกจากในฟังก์ชันอื่นเท่านั้น — โดยเฉพาะ ops.log
-- ซึ่งถ้าเรียกได้จากข้างนอกจะปลอมบันทึกการใช้งานได้
--
-- รายชื่ออยู่ในฟังก์ชันเพื่อให้ db/app-role.sql เรียกซ้ำได้หลังกู้ระบบ
-- โดยไม่ต้องเก็บรายชื่อไว้สองที่แล้วปล่อยให้มันเพี้ยนจากกัน
-- =====================================================================
create or replace function ops.grant_app(p_role name)
returns void
language plpgsql
as $grant$
declare
  fn text;
  /* ฟังก์ชันที่แอปต้องเรียกได้จริง — ที่เหลือเป็นของภายใน */
  app_fns text[] := array[
    -- ล็อกอิน
    'find_operator_for_signin(citext)',
    'record_failed_signin(uuid)',
    'create_session(uuid, bytea, timestamptz, text)',
    'load_session(bytea)',
    'delete_session(bytea)',
    -- ลิงก์ตั้งรหัสผ่านของผู้ให้บริการ
    'peek_setup_token(bytea)',
    'consume_setup_token(bytea, text)',
    -- นโยบาย RLS เรียกตัวนี้ในนามของผู้ที่ query จึงต้องเรียกได้
    'viewing()',
    -- งานของคอนโซล — ทุกตัวตรวจ session เองข้างใน
    'list_shops(bytea)',
    'open_shop(bytea, text, text, citext, text, bytea, timestamptz)',
    'issue_owner_reset(bytea, uuid, bytea, timestamptz)',
    'record_renewal(bytea, uuid, text, date, date, numeric, text)',
    'set_max_users(bytea, uuid, integer)',
    'add_operator(bytea, citext, text, bytea, timestamptz)',
    'list_operators(bytea)',
    'set_operator_active(bytea, uuid, boolean)',
    'list_errors(bytea, integer)',
    'list_audit(bytea, integer)'
  ];
begin
  execute format('grant usage on schema ops to %I', p_role);
  foreach fn in array app_fns loop
    /* ข้ามตัวที่ยังไม่มี — ไฟล์นี้ถูกเรียกซ้ำจาก app-role.sql ซึ่งอาจรันบนฐาน
       ที่ยังอัปเกรดไม่ครบ การล้มทั้งไฟล์เพราะฟังก์ชันเดียวหายทำให้กู้ระบบไม่ได้
       ส่วนที่คอยจับว่า grant ไม่ครบคือเทสต์ที่ไล่ฟังก์ชันจาก pg_proc */
    if to_regprocedure('ops.' || fn) is not null then
      execute format('grant execute on function ops.%s to %I', fn, p_role);
    end if;
  end loop;
end
$grant$;

comment on function ops.grant_app(name) is
  'ให้สิทธิ์เรียกฟังก์ชันคอนโซลเท่าที่แอปต้องใช้ — db/app-role.sql เรียกซ้ำได้หลังกู้ระบบ';

/* ตัดทีเดียวหลังสร้างครบทุกตัว — ถ้าตัดก่อน ฟังก์ชันที่สร้างทีหลัง
   จะได้สิทธิ์ PUBLIC ตั้งต้นมาแทน แล้วรอดจากการตัดไปเงียบ ๆ */
revoke execute on all functions in schema ops from public;

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    perform ops.grant_app('dgl_app');
  end if;
end $g$;
