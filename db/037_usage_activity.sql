-- =====================================================================
-- 037 — การใช้งานของแต่ละอู่ในคอนโซลผู้ให้บริการ (26 ต.ค. 2569)
--
-- ผู้ใช้ขอ: อยากเห็นว่าอู่ไหนใช้อยู่ อู่ไหนเลิกใช้ — เวลาใช้งานล่าสุด จำนวนวันที่เข้าใช้
-- และจำนวนเอกสารที่ออก (เลือกแบบ ข. — นับจำนวนเท่านั้น ไม่มีเลขที่ ลูกค้า หรือยอดเงิน)
--
-- **ทำไมต้องเก็บเพิ่ม** — auth.sessions.last_seen_at มีอยู่แล้วแต่ใช้ไม่ได้
-- แถวถูกลบตอนออกจากระบบ และลบทิ้งเมื่อหมดอายุเกิน 7 วัน ประวัติจึงหายไปเอง
-- ส่วน users.last_login_at บอกแค่ตอนล็อกอิน ซึ่งคนส่วนใหญ่ล็อกอินค้างไว้หลายสัปดาห์
--
-- auth.activity_days — หนึ่งแถวต่อผู้ใช้ต่อวันที่เข้าใช้ เก็บแค่ใคร วันไหน ล่าสุดกี่โมง
-- อยู่ในสคีมา auth เพราะแอปไม่มีสิทธิ์ตารางในสคีมานี้เลย (เรียกได้แค่ฟังก์ชัน)
-- และเขียนจาก auth.load_session ซึ่งเป็นที่เดียวที่รู้ว่ามีคนกำลังใช้
--
-- ไฟล์นี้อยู่ใน FRESH_FILES (tools/migrate.impl.mjs) เพราะแก้ ops.list_shops
-- ที่นิยามล่าสุดอยู่ใน 031 ซึ่งรันตอนติดตั้งใหม่ด้วย — **รันซ้ำได้ทั้งไฟล์**
-- ตารางกับ load_session มีคู่อยู่ใน 001/002 แล้ว ต้องแก้ให้ตรงกันเสมอ
-- =====================================================================

set local lock_timeout = '5s';

create table if not exists auth.activity_days (
  tenant_id  uuid        not null references tenants(id) on delete cascade,
  user_id    uuid        not null references users(id) on delete cascade,
  day        date        not null,
  last_at    timestamptz not null default now(),
  primary key (tenant_id, day, user_id)
);

comment on table auth.activity_days is
  'วันที่ผู้ใช้แต่ละคนเข้าใช้ — เขียนจาก auth.load_session ไม่เกินครั้งละ 5 นาทีต่อคน · คอนโซลใช้ดูว่าอู่ไหนใช้อยู่ (037)';

-- นับเอกสารที่สร้างในช่วงวันที่ ต่ออู่ — คอนโซลนับทุกอู่ทุกครั้งที่เปิดรายชื่อ
create index if not exists documents_created_idx on documents (tenant_id, created_at);

/* เติมย้อนหลังจากที่พอมี — session ที่ยังไม่ถูกลบ กับวันล็อกอินล่าสุด
   ไม่ครบแต่ดีกว่าเริ่มจากศูนย์ ส่วนกราฟเอกสารย้อนหลังได้ครบจากตาราง documents อยู่แล้ว */
insert into auth.activity_days (tenant_id, user_id, day, last_at)
select s.tenant_id, s.user_id, s.last_seen_at::date, max(s.last_seen_at)
  from auth.sessions s
 group by 1, 2, 3
on conflict do nothing;

insert into auth.activity_days (tenant_id, user_id, day, last_at)
select u.tenant_id, u.id, u.last_login_at::date, u.last_login_at
  from users u
 where u.last_login_at is not null
on conflict do nothing;

-- นิยามเดียวกับ 002_auth.sql — ต้องตรงกันทุกตัวอักษร (migrations.test.ts เทียบ)
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

  /* วันที่เข้าใช้ สำหรับคอนโซลผู้ให้บริการ (037) — ฟังก์ชันนี้ถูกเรียกทุก request
     จึงเขียนเวลาล่าสุดไม่เกินครั้งละ 5 นาทีต่อคน ระหว่างนั้น on conflict ไม่เขียนอะไร
     อ้างชื่อ constraint ไม่ใช่รายชื่อคอลัมน์ — tenant_id/user_id ชนกับคอลัมน์ผลลัพธ์ของฟังก์ชัน */
  insert into auth.activity_days as a (tenant_id, user_id, day, last_at)
  select u.tenant_id, u.id, current_date, now()
    from auth.sessions s
    join users u on u.id = s.user_id
   where s.token_hash = p_token_hash
     and s.expires_at > now()
     and u.active
  on conflict on constraint activity_days_pkey do update set last_at = excluded.last_at
   where a.last_at < excluded.last_at - interval '5 minutes';

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

/* ---------------------------------------------------------------------
   รายชื่ออู่ — เพิ่มการใช้งาน
   --------------------------------------------------------------------- */
drop function if exists ops.list_shops(bytea);

create function ops.list_shops(p_session bytea)
returns table (
  tenant_id      uuid,
  name           text,
  created_on     date,
  expires_on     date,
  plan           text,
  ever_paid      boolean,
  user_count     integer,
  max_users      integer,
  owner_email    citext,
  last_seen_at   timestamptz,
  last_login_at  timestamptz,
  active_days_30 integer,
  docs_30        integer,
  last_doc_at    timestamptz,
  docs_spark     integer[]
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_rows  jsonb;
  r       jsonb;
  v_id    uuid;
  v_n     integer;
  v_email citext;
  v_from  date := current_date - 29;          /* 30 วันรวมวันนี้ */
begin
  perform ops.require_session(p_session);

  /* รวบผลลัพธ์ให้จบก่อนแล้วค่อยวน — ระหว่างวนเราอ่าน users ทีละอู่ */
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
    v_id := (r->>'id')::uuid;

    /* กรองด้วย tenant_id ตรง ๆ — users ปิด force RLS ไว้ (ดู 031) */
    select count(*)::int into v_n
      from users u where u.tenant_id = v_id and u.active;

    select u.email into v_email
      from users u
     where u.tenant_id = v_id and u.role = 'owner' and u.active
     order by u.created_at, u.id limit 1;

    /* documents **เปิด** force RLS — เจ้าของฟังก์ชันก็เห็นแค่อู่ที่ตั้งไว้ใน app.tenant_id
       ตั้งทีละอู่ และกรอง tenant_id ตรง ๆ ซ้ำอีกชั้น ไม่พึ่งตัวแปรอย่างเดียว
       คืนแค่ **จำนวน** กับเวลา — ไม่มีเลขที่ ลูกค้า หรือยอดเงิน (ผู้ใช้เลือกแบบ ข.) */
    perform set_config('app.tenant_id', v_id::text, true);

    tenant_id   := v_id;
    name        := r->>'name';
    created_on  := (r->>'created_on')::date;
    expires_on  := (r->>'expires_on')::date;
    plan        := r->>'plan';
    ever_paid   := (r->>'ever_paid')::boolean;
    user_count  := v_n;
    max_users   := (r->>'max_users')::integer;
    owner_email := v_email;

    select max(a.last_at) into last_seen_at
      from auth.activity_days a where a.tenant_id = v_id;

    select max(u.last_login_at) into last_login_at
      from users u where u.tenant_id = v_id;

    select count(*)::int, max(d.created_at)
      into docs_30, last_doc_at
      from documents d
     where d.tenant_id = v_id and d.created_at >= v_from;

    /* เอกสารใบล่าสุดอาจเก่ากว่า 30 วัน — ต้องหาแยก ไม่งั้นอู่ที่เงียบไปนานขึ้นว่าไม่เคยออก */
    if last_doc_at is null then
      select max(d.created_at) into last_doc_at
        from documents d where d.tenant_id = v_id;
    end if;

    /* วันที่ใช้ = มีคนเข้า หรือมีเอกสารสร้างในวันนั้น
       เอกสารช่วยเติมช่วงก่อนไฟล์นี้ขึ้นเครื่อง ซึ่งยังไม่มีบันทึกการเข้าใช้ */
    select count(*)::int into active_days_30
      from (
        select a.day from auth.activity_days a
         where a.tenant_id = v_id and a.day >= v_from
        union
        select d.created_at::date from documents d
         where d.tenant_id = v_id and d.created_at >= v_from
      ) x;

    /* จำนวนเอกสารต่อวัน 30 ช่อง เก่าสุด → วันนี้ */
    select array_agg(coalesce(n.c, 0) order by g.day) into docs_spark
      from generate_series(v_from, current_date, interval '1 day') as g(day)
      left join (
        select d.created_at::date as day, count(*)::int as c
          from documents d
         where d.tenant_id = v_id and d.created_at >= v_from
         group by 1
      ) n on n.day = g.day::date;

    return next;
  end loop;

  perform set_config('app.tenant_id', '', true);
end;
$$;

comment on function ops.list_shops(bytea) is
  'รายชื่ออู่สำหรับคอนโซล — ข้อมูลการเป็นลูกค้าและการใช้งาน (เวลา จำนวนวัน จำนวนเอกสาร) · ไม่มีเนื้อหาเอกสาร (037)';

/* ---------------------------------------------------------------------
   รายละเอียดการใช้งานของอู่เดียว — หน้า /ops/shop/[id]
   --------------------------------------------------------------------- */
create or replace function ops.shop_activity(p_session bytea, p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_from date := current_date - 90;           /* 13 สัปดาห์ = 91 วันรวมวันนี้ */
  v_out  jsonb;
begin
  perform ops.require_session(p_session);

  if not exists (select 1 from tenants t where t.id = p_tenant) then
    return null;
  end if;

  /* เหตุผลเดียวกับ list_shops — documents เปิด force RLS */
  perform set_config('app.tenant_id', p_tenant::text, true);

  select jsonb_build_object(
    'first_seen', (select min(a.day) from auth.activity_days a where a.tenant_id = p_tenant),
    'first_doc',  (select min(d.created_at) from documents d where d.tenant_id = p_tenant),
    'docs_total', (select count(*) from documents d where d.tenant_id = p_tenant),

    /* ต่อวัน: คนที่เข้าใช้ กับจำนวนเอกสารที่สร้าง */
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', g.day::date,
               'users', coalesce(u.n, 0),
               'docs',  coalesce(d.n, 0)) order by g.day), '[]'::jsonb)
        from generate_series(v_from, current_date, interval '1 day') as g(day)
        left join (
          select a.day, count(*)::int n from auth.activity_days a
           where a.tenant_id = p_tenant and a.day >= v_from group by 1
        ) u on u.day = g.day::date
        left join (
          select x.created_at::date as day, count(*)::int n from documents x
           where x.tenant_id = p_tenant and x.created_at >= v_from group by 1
        ) d on d.day = g.day::date
    ),

    /* เอกสาร 30 วันแยกชนิด — นับอย่างเดียว */
    'kinds_30', (
      select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb)
        from (
          select x.kind::text as kind, count(*)::int n from documents x
           where x.tenant_id = p_tenant and x.created_at >= current_date - 29
           group by 1
        ) k
    ),

    /* ผู้ใช้ทีละคน — **ไม่มีชื่อ ไม่มีอีเมล** มีแค่บทบาทกับเวลา
       ไว้ดูว่าที่นั่งที่ซื้อไปมีคนใช้จริงไหม เรียงเจ้าของก่อน แล้วตามวันที่สร้าง */
    'users', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'role', u.role,
               'active', u.active,
               'created_at', u.created_at,
               'last_login_at', u.last_login_at,
               'last_seen_at', (select max(a.last_at) from auth.activity_days a
                                 where a.tenant_id = p_tenant and a.user_id = u.id),
               'days_30', (select count(*) from auth.activity_days a
                            where a.tenant_id = p_tenant and a.user_id = u.id
                              and a.day >= current_date - 29))
             order by (u.role = 'owner') desc, u.created_at, u.id), '[]'::jsonb)
        from users u
       where u.tenant_id = p_tenant
    )
  ) into v_out;

  perform set_config('app.tenant_id', '', true);
  return v_out;
end;
$$;

comment on function ops.shop_activity(bytea, uuid) is
  'การใช้งานของอู่เดียวสำหรับคอนโซล — วันที่เข้าใช้ จำนวนเอกสารต่อวันและต่อชนิด ผู้ใช้แบบไม่มีชื่อ (037)';

/* ---------------------------------------------------------------------
   สิทธิ์ — ops.grant_app() รุ่นล่าสุดอยู่ใน 013 เพิ่ม shop_activity เข้ารายการ
   นิยามซ้ำทั้งตัว เพราะ 013 ขึ้นเครื่องจริงไปแล้ว แก้ไฟล์เดิมไม่ได้
   --------------------------------------------------------------------- */
create or replace function ops.grant_app(p_role name)
returns void
language plpgsql
as $grant$
declare
  fn text;
  /* ฟังก์ชันที่แอปต้องเรียกได้จริง — ที่เหลือเป็นของภายใน โดยเฉพาะ ops.log
     ซึ่งถ้าเรียกได้จากข้างนอกจะปลอมบันทึกการใช้งานได้ */
  app_fns text[] := array[
    'find_operator_for_signin(citext)',
    'record_failed_signin(uuid)',
    'create_session(uuid, bytea, timestamptz, text)',
    'load_session(bytea)',
    'delete_session(bytea)',
    'peek_setup_token(bytea)',
    'consume_setup_token(bytea, text)',
    'viewing()',
    'list_shops(bytea)',
    'shop_activity(bytea, uuid)',
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

  /* สิทธิ์ตาราง — ดูเหตุผลใน 013 · แอปเขียน ops.errors ได้แต่ลบไม่ได้ */
  execute format('grant select, insert, update on ops.errors to %I', p_role);
  execute format('grant usage, select on sequence ops.errors_id_seq to %I', p_role);
  execute format('grant select on ops.migrations to %I', p_role);

  foreach fn in array app_fns loop
    if to_regprocedure('ops.' || fn) is not null then
      execute format('grant execute on function ops.%s to %I', fn, p_role);
    end if;
  end loop;
end
$grant$;

/* ฟังก์ชันใหม่สร้างมาให้ PUBLIC เรียกได้ตามค่าตั้งต้นของ Postgres — ปิดก่อนให้ทีละ role */
revoke execute on function ops.list_shops(bytea) from public;
revoke execute on function ops.shop_activity(bytea, uuid) from public;

/* ให้สิทธิ์คืนตามที่ฟังก์ชันพี่น้องมีอยู่ (แบบเดียวกับ 031) — ครอบคลุมชื่อ role ของทุกเครื่อง
   ทั้ง list_shops ที่สิทธิ์หายไปกับ drop และ shop_activity ที่เพิ่งเกิด */
do $grant$
declare r text;
begin
  for r in
    select distinct a.grantee::regrole::text
      from pg_proc p, aclexplode(p.proacl) a
     where p.pronamespace = 'ops'::regnamespace
       and p.proname = 'issue_owner_reset'
       and a.privilege_type = 'EXECUTE'
       and a.grantee <> 0
       and a.grantee <> p.proowner
  loop
    execute format('grant execute on function ops.list_shops(bytea) to %I', r);
    execute format('grant execute on function ops.shop_activity(bytea, uuid) to %I', r);
  end loop;
end
$grant$;
