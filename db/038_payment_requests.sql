-- =====================================================================
-- 038 — สมัครใช้บริการออนไลน์ + โอนเงินแนบสลิป (25 พ.ย. 2569)
--
-- ผู้ใช้ขอ: ฟอร์มสมัครของทีม (ไฟล์ HTML ที่ลูกค้าต้องคัดลอกส่งเองทาง LINE) มาเป็นหน้าในแอป
-- ลูกค้าโอนเงินและแนบสลิปตอนสมัคร ทีมตรวจยอดเข้าบัญชีแล้วกดอนุมัติ → เปิดอู่ + ลิขสิทธิ์ให้ทันที
-- ดู PLAN-signup-line-2569-11-25.md (ขั้น A — ส่วน LINE อยู่ไฟล์ถัดไป)
--
-- ops.payment_requests — คำขอที่มีเงินแนบมา ใบสมัครใหม่ (signup) และการต่ออายุ (renewal ขั้น D)
-- ใช้ตารางเดียวกัน เพราะการตรวจและการอนุมัติเหมือนกันทุกขั้น
--
-- **แอปแตะตารางนี้ตรงไม่ได้** — ส่งใบได้ทางเดียวคือ ops.submit_signup
-- อ่านและตัดสินได้เฉพาะผ่านฟังก์ชันที่ต้องมี session ของผู้ให้บริการ
-- รูปสลิปมีชื่อและเลขบัญชีของคนโอน ใบสมัครมีเลขบัตรประชาชนได้ (บุคคลธรรมดาที่จด VAT)
--
-- ไฟล์นี้อยู่ใน FRESH_FILES (tools/migrate.impl.mjs) เพราะแก้ ops.open_shop และ ops.grant_app
-- ที่นิยามเดิมอยู่ใน 011/037 ซึ่งแก้ไม่ได้แล้ว — **รันซ้ำได้ทั้งไฟล์**
-- =====================================================================

set local lock_timeout = '5s';

create table if not exists ops.payment_requests (
  id              uuid        primary key default gen_random_uuid(),
  at              timestamptz not null default now(),
  kind            text        not null check (kind in ('signup', 'renewal')),
  status          text        not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  -- renewal: อู่ที่แจ้ง · signup: อู่ที่เปิดหลังอนุมัติ — ไม่ผูก FK แบบ ops.audit
  -- อู่อาจถูกลบไปแล้ว แต่ต้องยังรู้ว่าเคยรับเงินจากใคร
  tenant_id       uuid,

  -- ใบสมัคร (null ทั้งหมดถ้าเป็น renewal)
  ctype           text        check (ctype in ('juristic', 'person')),
  vat_registered  boolean,
  bill_name       text,                     -- ชื่อเต็มที่จะขึ้นในใบกำกับภาษี รวมคำนำหน้าแล้ว
  tax_id          text        check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  branch_no       text        check (branch_no is null or branch_no ~ '^[0-9]{5}$'),  -- null = ไม่จด VAT · 00000 = สำนักงานใหญ่
  bill_addr       jsonb,                    -- แยกช่องตามฟอร์ม
  bill_addr_text  text,                     -- ประกอบแล้ว ตามรูปแบบที่ขึ้นในใบกำกับภาษี
  bill_email      citext,
  wht             boolean,                  -- เฉพาะนิติบุคคล — หัก ณ ที่จ่าย 3%
  shop_name       text,
  shop_province   text,
  contact_name    text,
  contact_pos     text,
  contact_tel     text,
  owner_email     citext,                   -- บัญชีที่จะใช้เข้าสู่ระบบ
  consent_at      timestamptz,

  -- การจ่ายเงิน — amount_due คิดโดยแอปตอนส่ง ราคาเปลี่ยนทีหลังไม่กระทบใบที่ส่งแล้ว
  years           integer     not null default 1 check (years between 1 and 3),
  amount_due      numeric(14,2) not null check (amount_due > 0),
  amount_paid     numeric(14,2) not null check (amount_paid > 0),
  paid_at         timestamptz not null,
  slip_mime       text        not null check (slip_mime in ('image/jpeg', 'image/png')),
  slip_bytes      bytea       check (slip_bytes is null or octet_length(slip_bytes) <= 1048576),
  slip_purged_at  timestamptz,              -- ลบรูปแล้ว เหลือแต่ยอดกับวันที่ (ops.prune_requests)
  wht_cert_mime   text        check (wht_cert_mime is null or wht_cert_mime in ('image/jpeg', 'image/png')),
  wht_cert_bytes  bytea       check (wht_cert_bytes is null or octet_length(wht_cert_bytes) <= 1048576),

  line_user_id    text,                     -- ขั้น C — null = ไม่ได้เข้าสู่ระบบด้วย LINE

  -- การตัดสิน
  decided_at      timestamptz,
  decided_by      uuid        references ops.operators(id) on delete set null,
  reject_reason   text,
  ip              inet,

  constraint payment_requests_signup_complete check (
    kind <> 'signup' or (
      ctype is not null and vat_registered is not null and bill_name is not null
      and bill_addr_text is not null and bill_email is not null and shop_name is not null
      and contact_name is not null and contact_tel is not null and owner_email is not null
      and consent_at is not null)),
  constraint payment_requests_decided check (
    (status = 'pending') = (decided_at is null)),
  constraint payment_requests_reason check (
    status <> 'rejected' or coalesce(trim(reject_reason), '') <> '')
);

create index if not exists payment_requests_status on ops.payment_requests (status, at desc);
create index if not exists payment_requests_owner on ops.payment_requests (owner_email) where status = 'pending';

comment on table ops.payment_requests is
  'ใบสมัครใหม่และการแจ้งชำระที่แนบสลิปมา — แอปส่งได้ผ่าน ops.submit_signup เท่านั้น อ่านต้องมี session ของผู้ให้บริการ (038)';

/* ---------------------------------------------------------------------
   เปิดอู่ — แยกตัวกลางออกจาก ops.open_shop
   ops.open_shop ต้องมี session · การอนุมัติคำขอ (และขั้น B ที่กดจาก LINE) ใช้ตัวกลางเดียวกัน
   ตัวกลางไม่ถูก grant ให้แอป — เรียกได้จากฟังก์ชันที่ตรวจตัวตนผู้ให้บริการมาแล้วเท่านั้น
   --------------------------------------------------------------------- */
create or replace function ops.open_shop_core(
  p_op          uuid,
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
  v_prev   text := coalesce(current_setting('app.tenant_id', true), '');
  v_tenant uuid := gen_random_uuid();
  v_owner  uuid;
begin
  if p_op is null then
    raise exception 'ไม่รู้ว่าผู้ให้บริการคนไหนเป็นคนเปิด';
  end if;
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
  perform ops.log(p_op, 'open_shop', v_tenant,
    jsonb_build_object('name', trim(p_name), 'owner_email', p_owner_email::text));
  return v_tenant;
end;
$$;

/** เปิดอู่ใหม่พร้อมบัญชีเจ้าของ — นิยามเดิมจาก 011 ย้ายเนื้อไปไว้ที่ open_shop_core */
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
begin
  return ops.open_shop_core(ops.require_session(p_session), p_name, p_tel,
    p_owner_email, p_owner_name, p_token_hash, p_expires_at);
end;
$$;

/* ---------------------------------------------------------------------
   ส่งใบสมัคร — ไม่ต้องล็อกอิน
   แอปตรวจรูปแบบทุกช่องและตรวจไฟล์สลิปจากไบต์จริงมาแล้ว ที่นี่ตรวจซ้ำแค่สิ่งที่ต้องรู้จากฐาน
   --------------------------------------------------------------------- */
create or replace function ops.submit_signup(
  p           jsonb,
  p_amount_due numeric,
  p_slip_mime text,
  p_slip      bytea,
  p_wht_mime  text,
  p_wht       bytea,
  p_ip        inet
)
returns uuid
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_email citext := lower(trim(p->>'owner_email'))::citext;
  v_id    uuid;
begin
  /* เพดานทั้งระบบ — ทางเข้านี้ไม่ต้องล็อกอิน ใครยิงซ้ำก็ถมได้ทั้งดิสก์และโควตาข้อความ LINE
     30 ใบที่ยังไม่มีใครตรวจคือสัญญาณว่ามีอะไรผิดปกติ ไม่ใช่ลูกค้าจริงล้น */
  if (select count(*) from ops.payment_requests where status = 'pending') >= 30 then
    raise exception 'ขณะนี้มีใบสมัครรอตรวจจำนวนมาก กรุณาติดต่อทีมงานทาง LINE';
  end if;

  if coalesce(trim(v_email::text), '') = '' then
    raise exception 'ต้องกรอกอีเมลผู้ดูแลระบบ';
  end if;
  if exists (select 1 from ops.email_taken(v_email)) then
    raise exception 'อีเมล % ถูกใช้เข้าสู่ระบบอยู่แล้ว — ถ้าเป็นอู่เดิมที่จะต่ออายุ ให้เข้าสู่ระบบแล้วไปที่หน้าลิขสิทธิ์', v_email;
  end if;
  if exists (select 1 from ops.payment_requests
              where status = 'pending' and owner_email = v_email) then
    raise exception 'มีใบสมัครของอีเมล % รอตรวจอยู่แล้ว ทีมงานจะติดต่อกลับ', v_email;
  end if;

  insert into ops.payment_requests (
    kind, ctype, vat_registered, bill_name, tax_id, branch_no, bill_addr, bill_addr_text,
    bill_email, wht, shop_name, shop_province, contact_name, contact_pos, contact_tel,
    owner_email, consent_at, years, amount_due, amount_paid, paid_at,
    slip_mime, slip_bytes, wht_cert_mime, wht_cert_bytes, ip)
  values (
    'signup', p->>'ctype', (p->>'vat_registered')::boolean, p->>'bill_name',
    nullif(p->>'tax_id', ''), nullif(p->>'branch_no', ''), p->'bill_addr', p->>'bill_addr_text',
    lower(trim(p->>'bill_email')), (p->>'wht')::boolean, p->>'shop_name', p->>'shop_province',
    p->>'contact_name', coalesce(p->>'contact_pos', ''), p->>'contact_tel',
    v_email, now(), 1, p_amount_due, (p->>'amount_paid')::numeric, (p->>'paid_at')::timestamptz,
    p_slip_mime, p_slip, p_wht_mime, p_wht, p_ip)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function ops.submit_signup(jsonb, numeric, text, bytea, text, bytea, inet) is
  'ส่งใบสมัครพร้อมสลิป — ไม่ต้องล็อกอิน · เพดาน pending 30 ใบ · อีเมลซ้ำกับผู้ใช้เดิมหรือใบที่รอตรวจไม่ได้ (038)';

/* ---------------------------------------------------------------------
   คอนโซล — อ่านและตัดสิน ต้องมี session ทุกตัว
   --------------------------------------------------------------------- */
create or replace function ops.list_requests(p_session bytea, p_status text)
returns table (
  id            uuid,
  at            timestamptz,
  kind          text,
  status        text,
  shop_name     text,
  shop_province text,
  ctype         text,
  vat_registered boolean,
  owner_email   citext,
  amount_due    numeric,
  amount_paid   numeric,
  paid_at       timestamptz,
  decided_at    timestamptz,
  decided_by    text,
  tenant_id     uuid
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
stable
as $$
begin
  perform ops.require_session(p_session);
  return query
    select r.id, r.at, r.kind, r.status, r.shop_name, r.shop_province, r.ctype,
           r.vat_registered, r.owner_email, r.amount_due, r.amount_paid, r.paid_at,
           r.decided_at, coalesce(nullif(o.name, ''), o.email::text), r.tenant_id
      from ops.payment_requests r
      left join ops.operators o on o.id = r.decided_by
     where p_status is null or r.status = p_status
     order by (r.status = 'pending') desc, r.at desc
     limit 200;
end;
$$;

create or replace function ops.get_request(p_session bytea, p_id uuid)
returns table (
  id            uuid,
  at            timestamptz,
  kind          text,
  status        text,
  tenant_id     uuid,
  ctype         text,
  vat_registered boolean,
  bill_name     text,
  tax_id        text,
  branch_no     text,
  bill_addr_text text,
  bill_email    citext,
  wht           boolean,
  shop_name     text,
  shop_province text,
  contact_name  text,
  contact_pos   text,
  contact_tel   text,
  owner_email   citext,
  consent_at    timestamptz,
  years         integer,
  amount_due    numeric,
  amount_paid   numeric,
  paid_at       timestamptz,
  has_slip      boolean,
  has_wht_cert  boolean,
  line_user     boolean,
  decided_at    timestamptz,
  decided_by    text,
  reject_reason text
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
stable
as $$
begin
  perform ops.require_session(p_session);
  return query
    select r.id, r.at, r.kind, r.status, r.tenant_id, r.ctype, r.vat_registered, r.bill_name,
           r.tax_id, r.branch_no, r.bill_addr_text, r.bill_email, r.wht, r.shop_name,
           r.shop_province, r.contact_name, r.contact_pos, r.contact_tel, r.owner_email,
           r.consent_at, r.years, r.amount_due, r.amount_paid, r.paid_at,
           r.slip_bytes is not null, r.wht_cert_bytes is not null, r.line_user_id is not null,
           r.decided_at, coalesce(nullif(o.name, ''), o.email::text), r.reject_reason
      from ops.payment_requests r
      left join ops.operators o on o.id = r.decided_by
     where r.id = p_id;
end;
$$;

/** รูปสลิปหรือ 50 ทวิ — แยกจาก get_request เพื่อไม่ลากไบต์รูปมาทุกครั้งที่เปิดหน้า */
create or replace function ops.get_request_file(p_session bytea, p_id uuid, p_which text)
returns table (mime text, bytes bytea)
language plpgsql
security definer
set search_path = ops, public, pg_temp
stable
as $$
begin
  perform ops.require_session(p_session);
  return query
    select case p_which when 'slip' then r.slip_mime else r.wht_cert_mime end,
           case p_which when 'slip' then r.slip_bytes else r.wht_cert_bytes end
      from ops.payment_requests r
     where r.id = p_id and p_which in ('slip', 'wht');
end;
$$;

/**
 * อนุมัติหรือปฏิเสธ — ทรานแซกชันเดียว ล้มที่ไหนก็ไม่มีอะไรค้าง
 *
 * อนุมัติใบสมัคร = เปิดอู่ + ตั้งค่าร้านตามใบสมัคร + ลิขสิทธิ์ตามจำนวนปีที่จ่าย + โทเคนตั้งรหัสผ่าน
 * วันหมดอายุคิดแบบเดียวกับ renewalWindow() ใน lib/license-window.ts — วันนี้ + 365 วันต่อปี
 *
 * ล็อกแถวก่อนตรวจสถานะ — ทีมสองคนกดอนุมัติใบเดียวกันพร้อมกัน ต้องได้อู่เดียว
 */
create or replace function ops.decide_request(
  p_session    bytea,
  p_id         uuid,
  p_approve    boolean,
  p_reason     text,
  p_token_hash bytea,
  p_expires_at timestamptz
)
returns table (tenant_id uuid, owner_email citext, expires_on date)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_op     uuid := ops.require_session(p_session);
  v_prev   text := coalesce(current_setting('app.tenant_id', true), '');
  r        ops.payment_requests;
  v_tenant uuid;
  v_until  date;
begin
  select * into r from ops.payment_requests pr where pr.id = p_id for update;
  if not found then
    raise exception 'ไม่พบคำขอนี้';
  end if;
  if r.status <> 'pending' then
    raise exception 'คำขอนี้%ไปแล้ว',
      case r.status when 'approved' then 'อนุมัติ' else 'ปฏิเสธ' end;
  end if;

  if not p_approve then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'ต้องบอกเหตุผลที่ปฏิเสธ — ข้อความนี้ถูกส่งถึงลูกค้า';
    end if;
    update ops.payment_requests pr
       set status = 'rejected', decided_at = now(), decided_by = v_op,
           reject_reason = trim(p_reason)
     where pr.id = p_id;
    perform ops.log(v_op, 'reject_request', r.tenant_id,
      jsonb_build_object('request', p_id, 'kind', r.kind, 'shop', r.shop_name,
                         'reason', trim(p_reason)));
    return;
  end if;

  if r.kind <> 'signup' then
    raise exception 'ยังอนุมัติคำขอชนิด % ไม่ได้', r.kind;
  end if;

  v_tenant := ops.open_shop_core(v_op, r.shop_name, r.contact_tel, r.owner_email,
    r.contact_name, p_token_hash, p_expires_at);
  v_until := current_date + 365 * r.years;

  perform set_config('app.tenant_id', v_tenant::text, true);

  /* ตั้งค่าร้านจากใบสมัคร — เจ้าของอู่ไม่ต้องกรอกซ้ำ แก้ทีหลังได้ที่ตั้งค่าร้าน */
  update tenants t
     set vat_registered = r.vat_registered,
         tax_id = r.tax_id,
         addr_text = r.bill_addr_text,
         owner_name = coalesce(r.contact_name, '')
   where t.id = v_tenant;

  insert into subscriptions (tenant_id, plan, started_on, expires_on, amount, note)
  values (v_tenant, 'light-yearly', current_date, v_until, r.amount_paid,
          'สมัครออนไลน์ · ' || left(p_id::text, 8));

  perform set_config('app.tenant_id', v_prev, true);

  update ops.payment_requests pr
     set status = 'approved', decided_at = now(), decided_by = v_op, tenant_id = v_tenant
   where pr.id = p_id;

  perform ops.log(v_op, 'approve_request', v_tenant,
    jsonb_build_object('request', p_id, 'kind', r.kind, 'shop', r.shop_name,
                       'amount', r.amount_paid, 'to', v_until));

  tenant_id := v_tenant;
  owner_email := r.owner_email;
  expires_on := v_until;
  return next;
end;
$$;

/**
 * เก็บกวาดตามที่หน้านโยบายข้อมูลส่วนบุคคลบอก — เรียกจากงานรายเดือนเดียวกับ ops.prune_errors
 * ใบที่ปฏิเสธลบทั้งแถว · ใบที่อนุมัติลบเฉพาะรูป เก็บยอดกับวันที่ไว้เป็นหลักฐานการรับเงิน
 * ไม่ grant ให้แอป — คนที่ทำระบบพังต้องลบร่องรอยไม่ได้ (แบบเดียวกับ prune_errors)
 */
create or replace function ops.prune_requests(p_days integer)
returns integer
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
declare
  v_gone integer;
  v_pics integer;
begin
  delete from ops.payment_requests
   where status = 'rejected' and decided_at < now() - make_interval(days => p_days);
  get diagnostics v_gone = row_count;

  update ops.payment_requests
     set slip_bytes = null, wht_cert_bytes = null, slip_purged_at = now()
   where status = 'approved' and slip_purged_at is null
     and decided_at < now() - make_interval(days => p_days);
  get diagnostics v_pics = row_count;

  return v_gone + v_pics;
end;
$$;

/* ---------------------------------------------------------------------
   สิทธิ์ — ops.grant_app() รุ่นล่าสุดอยู่ใน 037 เพิ่มฟังก์ชันของคำขอเข้ารายการ
   นิยามซ้ำทั้งตัว เพราะ 037 ขึ้นเครื่องจริงไปแล้ว แก้ไฟล์เดิมไม่ได้
   --------------------------------------------------------------------- */
create or replace function ops.grant_app(p_role name)
returns void
language plpgsql
as $grant$
declare
  fn text;
  /* ฟังก์ชันที่แอปต้องเรียกได้จริง — ที่เหลือเป็นของภายใน โดยเฉพาะ ops.log
     ซึ่งถ้าเรียกได้จากข้างนอกจะปลอมบันทึกการใช้งานได้ และ ops.open_shop_core
     ซึ่งรับรหัสผู้ให้บริการตรง ๆ ไม่ตรวจ session */
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
    'list_audit(bytea, integer)',
    'submit_signup(jsonb, numeric, text, bytea, text, bytea, inet)',
    'list_requests(bytea, text)',
    'get_request(bytea, uuid)',
    'get_request_file(bytea, uuid, text)',
    'decide_request(bytea, uuid, boolean, text, bytea, timestamptz)'
  ];
begin
  execute format('grant usage on schema ops to %I', p_role);

  /* สิทธิ์ตาราง — ดูเหตุผลใน 013 · แอปเขียน ops.errors ได้แต่ลบไม่ได้
     ops.payment_requests ไม่อยู่ในนี้โดยตั้งใจ — ผ่านฟังก์ชันเท่านั้น */
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
revoke execute on function ops.open_shop_core(uuid, text, text, citext, text, bytea, timestamptz) from public;
revoke execute on function ops.submit_signup(jsonb, numeric, text, bytea, text, bytea, inet) from public;
revoke execute on function ops.list_requests(bytea, text) from public;
revoke execute on function ops.get_request(bytea, uuid) from public;
revoke execute on function ops.get_request_file(bytea, uuid, text) from public;
revoke execute on function ops.decide_request(bytea, uuid, boolean, text, bytea, timestamptz) from public;
revoke execute on function ops.prune_requests(integer) from public;
revoke all on ops.payment_requests from public;

/* ให้สิทธิ์คืนตามที่ฟังก์ชันพี่น้องมีอยู่ (แบบเดียวกับ 031/037) — ครอบคลุมชื่อ role ของทุกเครื่อง */
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
    execute format('grant execute on function ops.submit_signup(jsonb, numeric, text, bytea, text, bytea, inet) to %I', r);
    execute format('grant execute on function ops.list_requests(bytea, text) to %I', r);
    execute format('grant execute on function ops.get_request(bytea, uuid) to %I', r);
    execute format('grant execute on function ops.get_request_file(bytea, uuid, text) to %I', r);
    execute format('grant execute on function ops.decide_request(bytea, uuid, boolean, text, bytea, timestamptz) to %I', r);
  end loop;
end
$grant$;
