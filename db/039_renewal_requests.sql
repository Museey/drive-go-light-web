-- =====================================================================
-- 039 — ขั้นตอนตรวจการชำระเงินก่อนต่ออายุ (24 พ.ย. 2569)
--
-- เดิม: ผู้ใช้ของอู่ที่เข้าเมนูตั้งค่าได้ กด "บันทึกการต่ออายุ" แล้วระบบเพิ่มแถวใน
-- subscriptions ให้ทันที 1–10 ปี ไม่มีใครตรวจว่าโอนเงินมาจริงหรือไม่
--
-- ใหม่: อู่ **แจ้งชำระเงิน** (แถวใน renewal_requests สถานะ pending) → ผู้ให้บริการ
-- ตรวจยอดกับบัญชีธนาคารแล้วกด **อนุมัติ** ในคอนโซล /ops → ฟังก์ชัน
-- ops.approve_renewal_request เพิ่มแถวใน subscriptions ให้ในคำสั่งเดียวกัน
-- อู่ไม่มีทางเพิ่มวันใช้งานให้ตัวเองได้อีก
--
-- ตารางอยู่ใน public เพราะเป็นข้อมูลของอู่ (อู่อ่านคำขอของตัวเองได้ผ่าน RLS)
-- ฟังก์ชันอยู่ใน ops เพราะคนอนุมัติคือผู้ให้บริการ
--
-- ไฟล์นี้อยู่ใน FRESH_FILES (tools/migrate.impl.mjs) เพราะนิยาม ops.grant_app ใหม่
-- ทับของ 038 และนโยบาย ops_read อ้าง ops.viewing() ซึ่ง 001 ยังไม่มีตอนรัน
-- — **รันซ้ำได้ทั้งไฟล์** · ตารางกับดัชนีมีคู่อยู่ใน 001 แล้ว ต้องแก้ให้ตรงกันเสมอ
-- =====================================================================

set local lock_timeout = '5s';

create table if not exists renewal_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid          not null references tenants(id) on delete cascade,
  years           integer       not null
                  constraint renewal_requests_years_check check (years between 1 and 10),
  -- ยอดที่อู่แจ้งว่าโอนมา — ผู้ให้บริการเทียบกับรายการเดินบัญชีก่อนอนุมัติ
  amount          numeric(14,2) not null
                  constraint renewal_requests_amount_check check (amount > 0),
  paid_on         date          not null,
  -- อ้างอิงการโอน เช่น เวลาโอน ธนาคารต้นทาง เลขท้ายสลิป
  note            text          not null default '',
  status          text          not null default 'pending'
                  constraint renewal_requests_status_check
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by    uuid          references users(id) on delete set null,
  created_at      timestamptz   not null default now(),
  decided_at      timestamptz,
  -- เหตุผลจากผู้ให้บริการ — อู่เห็นข้อความนี้ในหน้าลิขสิทธิ์
  decided_note    text          not null default '',
  -- แถวใน subscriptions ที่เกิดจากการอนุมัติคำขอนี้
  subscription_id uuid          references subscriptions(id) on delete set null,
  constraint renewal_requests_decided_check
    check ((status = 'pending') = (decided_at is null))
);

comment on table renewal_requests is
  'คำขอต่ออายุที่อู่แจ้งชำระเงินมา — ผู้ให้บริการอนุมัติในคอนโซลแล้วจึงเกิดแถวใน subscriptions (039)';

create index if not exists renewal_requests_tenant_idx
  on renewal_requests (tenant_id, created_at desc);

-- อู่หนึ่งมีคำขอที่รอตรวจได้ครั้งละใบ — กันกดส่งซ้ำแล้วถูกอนุมัติสองรอบ
create unique index if not exists renewal_requests_one_pending
  on renewal_requests (tenant_id) where status = 'pending';

alter table renewal_requests enable row level security;
alter table renewal_requests force row level security;

do $policy$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'renewal_requests'
                    and policyname = 'tenant_isolation') then
    execute 'create policy tenant_isolation on renewal_requests
             using (tenant_id = current_tenant_id())
             with check (tenant_id = current_tenant_id())';
  end if;
  /* ให้คอนโซลอ่านคำขอของทุกอู่ได้ — แบบเดียวกับ tenants และ subscriptions ใน 011
     เขียนยังต้องตั้ง app.tenant_id เป็นอู่นั้นก่อนเสมอ (ดูฟังก์ชันด้านล่าง) */
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'renewal_requests'
                    and policyname = 'ops_read') then
    execute 'create policy ops_read on renewal_requests for select using (ops.viewing())';
  end if;
end $policy$;

do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    execute 'grant select, insert, update, delete on renewal_requests to dgl_app';
  end if;
end $grant$;

/* ---------------------------------------------------------------------
   รายการคำขอ — ที่รอตรวจทั้งหมด กับที่ตัดสินไปแล้วใน 90 วัน
   --------------------------------------------------------------------- */
create or replace function ops.list_renewal_requests(p_session bytea)
returns table (
  request_id    uuid,
  tenant_id     uuid,
  tenant_name   text,
  years         integer,
  amount        numeric,
  paid_on       date,
  note          text,
  status        text,
  created_at    timestamptz,
  decided_at    timestamptz,
  decided_note  text
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  perform ops.require_session(p_session);

  return query
    select r.id, r.tenant_id, t.name, r.years, r.amount, r.paid_on, r.note,
           r.status, r.created_at, r.decided_at, r.decided_note
      from renewal_requests r
      join tenants t on t.id = r.tenant_id
     where r.status = 'pending' or r.created_at > now() - interval '90 days'
     order by (r.status = 'pending') desc, r.created_at desc
     limit 300;
end;
$$;

comment on function ops.list_renewal_requests(bytea) is
  'คำขอต่ออายุของทุกอู่สำหรับคอนโซล — ที่รอตรวจขึ้นก่อน (039)';

/* ---------------------------------------------------------------------
   อนุมัติ — เพิ่มแถวใน subscriptions และปิดคำขอในคำสั่งเดียว
   ช่วงวันที่คำนวณที่แอปด้วย renewalWindow() ตัวเดียวกับที่ใช้มาตลอด
   จำนวนที่นั่งพนักงานยกมาจากแถวล่าสุด ไม่งั้นต่ออายุแล้วที่นั่งที่ซื้อเพิ่มไว้หาย
   --------------------------------------------------------------------- */
create or replace function ops.approve_renewal_request(
  p_session bytea,
  p_request uuid,
  p_from    date,
  p_to      date,
  p_note    text
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op     uuid := ops.require_session(p_session);
  v_prev   text := coalesce(current_setting('app.tenant_id', true), '');
  v_tenant uuid;
  v_status text;
  v_amount numeric;
  v_ref    text;
  v_max    integer;
  v_plan   text;
  v_sub    uuid;
begin
  if p_to <= p_from then
    raise exception 'วันหมดอายุต้องอยู่หลังวันเริ่ม';
  end if;

  select r.tenant_id into v_tenant from renewal_requests r where r.id = p_request;
  if v_tenant is null then
    raise exception 'ไม่พบคำขอต่ออายุนี้';
  end if;

  /* ตารางเปิด force RLS — ล็อกแถวและเขียนได้เฉพาะเมื่อตั้งอู่ให้ตรง */
  perform set_config('app.tenant_id', v_tenant::text, true);

  select r.status, r.amount, r.note into v_status, v_amount, v_ref
    from renewal_requests r where r.id = p_request
     for update;
  if v_status is distinct from 'pending' then
    raise exception 'คำขอนี้ถูกตัดสินหรือยกเลิกไปแล้ว';
  end if;

  /* ต่ออายุคงแพ็กเกจเดิมไว้ — อู่ Light Plus ต่อแล้วต้องไม่ตกเป็น Light (ฟีเจอร์เงินเดือน นัดหมาย เอกสารภาษี
     จะปิดทั้งชุดทันทีที่อนุมัติ) · อู่ที่ยังทดลองใช้ไม่มีแถวเดิม = Light
     เปลี่ยนแพ็กเกจทำได้จากการบันทึกต่ออายุในคอนโซลเท่านั้น (ops.record_renewal) */
  select s.max_users, s.plan into v_max, v_plan
    from subscriptions s
   where s.tenant_id = v_tenant
   order by s.expires_on desc limit 1;

  insert into subscriptions (tenant_id, plan, started_on, expires_on, amount, max_users, note)
  values (v_tenant, coalesce(nullif(v_plan, ''), 'light-yearly'), p_from, p_to, v_amount, v_max, nullif(v_ref, ''))
  returning id into v_sub;

  update renewal_requests r
     set status = 'approved', decided_at = now(),
         decided_note = coalesce(p_note, ''), subscription_id = v_sub
   where r.id = p_request;

  perform set_config('app.tenant_id', v_prev, true);

  perform ops.log(v_op, 'approve_renewal', v_tenant,
    jsonb_build_object('request', p_request, 'from', p_from, 'to', p_to, 'amount', v_amount));
end;
$$;

comment on function ops.approve_renewal_request(bytea, uuid, date, date, text) is
  'อนุมัติคำขอต่ออายุหลังตรวจยอดโอนแล้ว — เพิ่ม subscriptions และปิดคำขอพร้อมกัน (039)';

/* ---------------------------------------------------------------------
   ไม่อนุมัติ — เช่น ไม่พบยอดโอน หรือยอดไม่ครบ · เหตุผลแสดงให้อู่เห็น
   --------------------------------------------------------------------- */
create or replace function ops.reject_renewal_request(
  p_session bytea,
  p_request uuid,
  p_note    text
)
returns void
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op     uuid := ops.require_session(p_session);
  v_prev   text := coalesce(current_setting('app.tenant_id', true), '');
  v_tenant uuid;
  v_status text;
begin
  select r.tenant_id into v_tenant from renewal_requests r where r.id = p_request;
  if v_tenant is null then
    raise exception 'ไม่พบคำขอต่ออายุนี้';
  end if;

  perform set_config('app.tenant_id', v_tenant::text, true);

  select r.status into v_status
    from renewal_requests r where r.id = p_request
     for update;
  if v_status is distinct from 'pending' then
    raise exception 'คำขอนี้ถูกตัดสินหรือยกเลิกไปแล้ว';
  end if;

  update renewal_requests r
     set status = 'rejected', decided_at = now(), decided_note = coalesce(p_note, '')
   where r.id = p_request;

  perform set_config('app.tenant_id', v_prev, true);

  perform ops.log(v_op, 'reject_renewal', v_tenant,
    jsonb_build_object('request', p_request, 'note', coalesce(p_note, '')));
end;
$$;

comment on function ops.reject_renewal_request(bytea, uuid, text) is
  'ไม่อนุมัติคำขอต่ออายุ พร้อมเหตุผลให้อู่เห็น (039)';

/* ---------------------------------------------------------------------
   สิทธิ์ — ops.grant_app() รุ่นล่าสุดอยู่ใน 038 เพิ่มสามฟังก์ชันข้างบนเข้ารายการ
   นิยามซ้ำทั้งตัว เพราะ 038 ขึ้นเครื่องจริงไปแล้ว แก้ไฟล์เดิมไม่ได้
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
    'list_renewal_requests(bytea)',
    'approve_renewal_request(bytea, uuid, date, date, text)',
    'reject_renewal_request(bytea, uuid, text)',
    'set_max_users(bytea, uuid, integer)',
    'add_operator(bytea, citext, text, bytea, timestamptz)',
    'list_operators(bytea)',
    'set_operator_active(bytea, uuid, boolean)',
    'list_errors(bytea, integer)',
    'list_audit(bytea, integer)',
    /* ของ 038_payment_requests — ต้องคงไว้ ไม่งั้นรอบถัดไปที่เรียก grant_app หน้าสมัครออนไลน์จะเรียกฟังก์ชันไม่ได้ */
    'submit_signup(jsonb, numeric, text, bytea, text, bytea, inet)',
    'list_requests(bytea, text)',
    'get_request(bytea, uuid)',
    'get_request_file(bytea, uuid, text)',
    'decide_request(bytea, uuid, boolean, text, bytea, timestamptz)'
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
revoke execute on function ops.list_renewal_requests(bytea) from public;
revoke execute on function ops.approve_renewal_request(bytea, uuid, date, date, text) from public;
revoke execute on function ops.reject_renewal_request(bytea, uuid, text) from public;

/* ให้สิทธิ์ตามที่ฟังก์ชันพี่น้องมีอยู่ (แบบเดียวกับ 031 และ 037) — ครอบคลุมชื่อ role ของทุกเครื่อง */
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
    execute format('grant execute on function ops.list_renewal_requests(bytea) to %I', r);
    execute format('grant execute on function ops.approve_renewal_request(bytea, uuid, date, date, text) to %I', r);
    execute format('grant execute on function ops.reject_renewal_request(bytea, uuid, text) to %I', r);
  end loop;
end
$grant$;
