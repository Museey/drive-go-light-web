/**
 * คอนโซลผู้ให้บริการ — ผูกกับ "อู่ที่เลือก" ให้ชัด ไม่พึ่ง RLS ของ users
 *
 * ผู้ใช้แจ้ง (16 ก.ย. 2569): กดออกลิงก์ตั้งรหัสผ่านให้อู่ ข แต่ได้อีเมลของอู่ ก
 *
 * ต้นเหตุ: `ops.issue_owner_reset` กับ `ops.list_shops` ตั้ง `app.tenant_id` แล้วอ่าน users
 * โดยหวังให้ RLS กรองอู่ให้ — แต่ users **ปิด force row level security ไว้โดยตั้งใจ**
 * (db/012_auth_rls.sql) ฟังก์ชันสองตัวนี้เป็น SECURITY DEFINER ทำงานในนามเจ้าของตาราง
 * นโยบาย RLS จึงไม่มีผลกับมันเลย ผลคือเห็นผู้ใช้ทุกอู่:
 *   - ออกลิงก์ตั้งรหัสผ่าน → หยิบเจ้าของรายแรกที่เจอ ซึ่งเป็นของอู่อื่นได้
 *     (โทเคนที่ออกเปิดบัญชีของอู่นั้นได้จริง ไม่ใช่แค่ข้อความบนจอผิด)
 *   - จำนวนผู้ใช้ในรายชื่ออู่ → ได้ยอดรวมทุกอู่เท่ากันหมด
 *
 * แก้: กรอง `u.tenant_id` ตรง ๆ ในทั้งสองฟังก์ชัน — ตัวกรองอยู่ในคำสั่งที่อ่าน ไม่ใช่ในตัวแปรรอบนอก
 * และเพิ่ม `owner_email` ในรายชื่ออู่ (ผู้ใช้ขอ) — คืนเฉพาะอีเมลเจ้าของ ไม่ได้เปิดตาราง users เพิ่ม
 */
set local lock_timeout = '5s';

/* เปลี่ยนรูปผลลัพธ์ (เพิ่มคอลัมน์) ด้วย create or replace ไม่ได้ ต้อง drop ก่อน
   สิทธิ์ execute หายไปกับ drop — ท้ายไฟล์ให้สิทธิ์คืนตามที่ฟังก์ชันพี่น้องมีอยู่ */
drop function if exists ops.list_shops(bytea);

create function ops.list_shops(p_session bytea)
returns table (
  tenant_id   uuid,
  name        text,
  created_on  date,
  expires_on  date,
  plan        text,
  ever_paid   boolean,
  user_count  integer,
  max_users   integer,
  owner_email citext
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

    /* กรองด้วย tenant_id ตรง ๆ — เดิมตั้ง app.tenant_id แล้วหวังให้ RLS กรอง
       ซึ่งไม่มีผลกับ SECURITY DEFINER เพราะ users ปิด force RLS ไว้ (นับได้ทุกอู่รวมกัน) */
    select count(*)::int into v_n
      from users u where u.tenant_id = v_id and u.active;

    /* อีเมลเจ้าของอู่ — คอนโซลต้องรู้ว่าลิงก์ตั้งรหัสผ่านจะไปเข้าบัญชีไหน (ผู้ใช้ขอ)
       เจ้าของที่เปิดใช้อยู่รายแรกสุด เรียงให้แน่นอนด้วยวันสร้าง */
    select u.email into v_email
      from users u
     where u.tenant_id = v_id and u.role = 'owner' and u.active
     order by u.created_at, u.id limit 1;

    tenant_id   := v_id;
    name        := r->>'name';
    created_on  := (r->>'created_on')::date;
    expires_on  := (r->>'expires_on')::date;
    plan        := r->>'plan';
    ever_paid   := (r->>'ever_paid')::boolean;
    user_count  := v_n;
    max_users   := (r->>'max_users')::integer;
    owner_email := v_email;
    return next;
  end loop;
end;
$$;

comment on function ops.list_shops(bytea) is
  'รายชื่ออู่สำหรับคอนโซล — เฉพาะข้อมูลการเป็นลูกค้า ผู้ใช้นับและอีเมลเจ้าของกรองด้วย tenant_id ตรง ๆ';

/**
 * ออกลิงก์ตั้งรหัสผ่านใหม่ให้เจ้าของ **ของอู่ที่ส่งมาเท่านั้น**
 * auth.issue_setup_token รับ user_id ตรง ๆ จึงไม่ต้องตั้ง app.tenant_id ให้ใครอีก
 */
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
  v_user  uuid;
  v_email citext;
begin
  select u.id, u.email into v_user, v_email
    from users u
   where u.tenant_id = p_tenant and u.role = 'owner' and u.active
   order by u.created_at, u.id limit 1;

  if v_user is null then
    raise exception 'อู่นี้ยังไม่มีบัญชีเจ้าของที่ใช้งานอยู่';
  end if;

  perform auth.issue_setup_token(v_user, p_token_hash, 'reset', p_expires_at);

  perform ops.log(v_op, 'issue_owner_reset', p_tenant,
    jsonb_build_object('email', v_email::text));
  return v_email;
end;
$$;

comment on function ops.issue_owner_reset(bytea, uuid, bytea, timestamptz) is
  'ออกลิงก์ตั้งรหัสผ่านให้เจ้าของของอู่ที่ส่งมา — กรอง tenant_id ในคำสั่งอ่าน ไม่พึ่ง RLS';

/* คืนสิทธิ์ execute ของ list_shops ที่หายไปกับ drop — เอาตามที่ฟังก์ชันพี่น้อง
   (issue_owner_reset ซึ่งไม่ได้ถูก drop) มีอยู่ จึงครอบคลุมชื่อ role ของทุกเครื่อง */
do $grant$
declare r text;
begin
  for r in
    select distinct a.grantee::regrole::text
      from pg_proc p, aclexplode(p.proacl) a
     where p.pronamespace = 'ops'::regnamespace
       and p.proname = 'issue_owner_reset'
       and a.privilege_type = 'EXECUTE'
       and a.grantee <> 0                       /* 0 = PUBLIC */
       and a.grantee <> p.proowner
  loop
    execute format('grant execute on function ops.list_shops(bytea) to %I', r);
  end loop;
end
$grant$;
