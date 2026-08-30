-- =====================================================================
-- DriveGoLight! Web — Postgres schema (migration 001)
-- แปลงจากโครงสร้าง DB ในไฟล์ drivegolight.html (validateBackupShape + blank* factories)
--
-- หลักการที่ยึดในไฟล์นี้
--   1. ทุกตารางข้อมูลผู้ใช้มี tenant_id + Row Level Security — กันข้อมูลข้ามอู่
--   2. เงินเป็น numeric ทั้งหมด ห้าม float (ของเดิมใช้ JS number + Math.round)
--   3. เอกสารภาษี "ไม่ลบ" — ใช้ status = 'void' แทน DELETE เสมอ
--   4. เอกสารเก็บ snapshot ชื่อ/ที่อยู่/รถ ณ วันออก ไม่ดึงจาก contacts ตอนพิมพ์
--      (แก้ที่อยู่ลูกค้าวันนี้ ต้องไม่ทำให้ใบเสร็จปีที่แล้วเปลี่ยน)
--   5. สต๊อกเป็นบัญชีเดินสะพัด (stock_moves) ไม่ใช่ตัวเลข qty ที่ +=/-= ทับ
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- อีเมลไม่สนตัวพิมพ์ใหญ่เล็ก

-- ---------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------

-- QT ใบเสนอราคา · IV ใบส่งมอบ(ไม่มี VAT) · IVT ใบส่งมอบ+ใบกำกับภาษี
-- RC ใบเสร็จรับเงิน · PO ใบซื้อ · EX บันทึกค่าใช้จ่าย
create type doc_kind as enum ('QT', 'IV', 'IVT', 'RC', 'PO', 'EX');

-- none = ไม่คิด VAT · ex = ราคายังไม่รวม VAT · in = ราคารวม VAT แล้ว
create type vat_mode as enum ('none', 'ex', 'in');

create type doc_status as enum ('draft', 'issued', 'billed', 'void');

create type contact_kind as enum ('customer', 'vendor');
create type contact_type as enum ('person', 'company');

create type expense_cat as enum ('rent', 'utility', 'salary', 'telecom', 'asset', 'other');

create type stock_reason as enum ('opening', 'purchase', 'sale', 'adjust', 'return');

create type member_role as enum ('owner', 'staff');

-- ---------------------------------------------------------------------
-- ผู้เช่าระบบ (1 แถว = 1 อู่) — มาจาก DB.shop
-- ---------------------------------------------------------------------
create table tenants (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  tax_id          text,                                    -- 13 หลัก (เก็บเฉพาะตัวเลข)
  addr_text       text,                                    -- ที่อยู่ร้านเป็นข้อความยาว (ตามของเดิม)
  tel             text,
  tel2            text,
  vat_rate        numeric(6,3) not null default 7,         -- %
  wht_rate        numeric(6,3) not null default 3,         -- % ค่าตั้งต้นของเอกสารขาย
  price_tier      char(1)      not null default 'A' check (price_tier in ('A','B','C')),
  logo_url        text,                                    -- ย้ายจาก base64 ไป object storage
  proposer_name   text,
  warranty_text   text,
  ui_prefs        jsonb        not null default '{}'::jsonb,  -- DB.ui (เช่น stockHide)
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now(),
  constraint tenants_tax_id_digits check (tax_id is null or tax_id ~ '^[0-9]{13}$')
);

comment on column tenants.ui_prefs is
  'ค่าปรับแต่งหน้าจอระดับร้าน เช่น {"stockHide":["oem","max"]} — ไม่ใช่ข้อมูลธุรกิจ ไม่ต้อง migrate เข้มงวด';

-- ---------------------------------------------------------------------
-- สมาชิกและสิทธิ์ — มาจาก DB.users + DB.shop.ownerPass
-- ของเดิมเก็บรหัสผ่านเป็น plaintext ในไฟล์ ตรงนี้ต้องเป็น hash เท่านั้น
-- ---------------------------------------------------------------------
create table users (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  code            text        not null,                    -- รหัสผู้ใช้ที่ระบบสุ่มให้ (genUserCode)
  name            text        not null default '',
  email           citext,                                  -- ใช้ล็อกอิน (ของเดิมไม่มี)
  password_hash   text,                                    -- argon2id — ห้ามเก็บรหัสผ่านดิบ
  role            member_role not null default 'staff',
  perms           text[]      not null default '{}',
  active          boolean     not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, email),
  -- ชุดสิทธิ์ต้องตรงกับ PERMS ในโปรแกรมเดิม
  constraint users_perms_valid check (
    perms <@ array['customer','income','expense','stock','finance','settings']::text[]
  )
);

create index on users (tenant_id) where active;

-- ---------------------------------------------------------------------
-- ลิขสิทธิ์ / การสมัครใช้งาน — แทนที่ระบบ key ฝั่ง client (makeKey/checkKey)
-- ย้ายมาฝั่ง server แล้วปลอมรหัสไม่ได้อีก
-- ---------------------------------------------------------------------
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  plan            text        not null default 'light-yearly',
  started_on      date        not null default current_date,
  expires_on      date        not null,
  amount          numeric(14,2),                           -- ยอดที่เก็บจริง
  note            text,
  created_at      timestamptz not null default now()
);

create index on subscriptions (tenant_id, expires_on desc);

-- ---------------------------------------------------------------------
-- ทะเบียนผู้ติดต่อ — DB.customers (ของเดิมรวม vendors เข้ามาแล้วด้วย kind)
-- ---------------------------------------------------------------------
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid          not null references tenants(id) on delete cascade,
  code            text          not null,                  -- CUS-0001 / VEN-0001
  kind            contact_kind  not null default 'customer',
  type            contact_type  not null default 'person',
  prefix          text          not null default '',
  first_name      text          not null default '',
  last_name       text          not null default '',
  org_name        text          not null default '',
  tax_id          text,
  addr            jsonb         not null default '{}'::jsonb,  -- {no,village,moo,soi,road,subdistrict,district,province,zip}
  addr_text       text          not null default '',        -- ที่อยู่แบบพิมพ์เอง (ผู้ขายที่ย้ายมาจาก DB.vendors)
  tel             text          not null default '',
  tel2            text          not null default '',
  email           citext,
  note            text          not null default '',
  credit_days     integer       not null default 0 check (credit_days >= 0),
  created_on      date          not null default current_date,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  unique (tenant_id, code),
  -- บุคคลธรรมดาต้องมีชื่อ นิติบุคคลต้องมีชื่อบริษัท
  constraint contacts_name_present check (
    (type = 'person'  and (first_name <> '' or last_name <> ''))
    or (type = 'company' and org_name <> '')
  )
);

create index on contacts (tenant_id, kind);
-- ค้นหาชื่อ/เบอร์แบบพิมพ์บางส่วน (แทน .filter() ในหน่วยความจำของเดิม)
create index contacts_search_idx on contacts
  using gin (to_tsvector('simple', coalesce(org_name,'') || ' ' ||
             coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(tel,'')));

-- รถที่ดูแล — customers[].vehicles[]
create table vehicles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  contact_id      uuid        not null references contacts(id) on delete cascade,
  brand           text        not null default '',
  model           text        not null default '',
  year            text        not null default '',         -- ของเดิมเป็น พ.ศ. เก็บเป็นข้อความไว้ก่อน
  color           text        not null default '',
  plate_a         text        not null default '',         -- หมวดอักษร
  plate_b         text        not null default '',         -- ตัวเลข
  plate_province  text        not null default '',
  engine_no       text        not null default '',
  chassis_no      text        not null default '',
  mileage         text        not null default '',
  last_service_on date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on vehicles (tenant_id, contact_id);
create index on vehicles (tenant_id, plate_b);            -- ค้นด้วยเลขทะเบียนคือท่าที่ใช้บ่อยที่สุดหน้าเคาน์เตอร์

-- ---------------------------------------------------------------------
-- สินค้า — DB.categories (เดิมเป็น array ของ string) + DB.products
-- ---------------------------------------------------------------------
create table product_categories (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  name            text        not null,
  sort_order      integer     not null default 0,
  unique (tenant_id, name)
);

create table products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  code            text        not null,                    -- รหัสร้าน
  oem             text        not null default '',         -- รหัสผู้ผลิต
  name            text        not null,
  unit            text        not null default '',
  category_id     uuid        references product_categories(id) on delete set null,
  last_cost       numeric(14,2) not null default 0 check (last_cost >= 0),
  price_a         numeric(14,2) not null default 0 check (price_a >= 0),
  price_b         numeric(14,2) not null default 0 check (price_b >= 0),
  price_c         numeric(14,2) not null default 0 check (price_c >= 0),
  qty_min         numeric(12,3) not null default 0,
  qty_max         numeric(12,3) not null default 0,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, code)
);

create index on products (tenant_id) where active;
create index on products (tenant_id, category_id);

comment on column products.last_cost is
  'ทุนล่าสุดจากใบซื้อ — ของเดิมคือ product.cost ที่ถูกเขียนทับตอนบันทึกใบซื้อ';

-- ---------------------------------------------------------------------
-- เอกสารทั้งหมดอยู่ตารางเดียว
--
-- ทำไมรวม: ทั้ง 6 ชนิดใช้โครงเดียวกันเกือบทั้งหมด (เลขที่, วันที่, snapshot คู่ค้า,
-- รายการสินค้า, ส่วนลด, VAT, การชำระเงิน) และรายงานลูกหนี้/เจ้าหนี้/กำไรขาดทุน
-- ต้องอ่านข้ามชนิดอยู่แล้ว การรวมทำให้มีระบบออกเลขที่เดียว ตารางชำระเงินเดียว
-- ราคาที่จ่าย: ต้องมี CHECK ต่อ kind กำกับ ไม่งั้นกลายเป็นตารางอะไรก็ได้
-- ---------------------------------------------------------------------
create table documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  kind            doc_kind    not null,
  direction       text        generated always as
                    (case when kind in ('PO','EX') then 'buy' else 'sell' end) stored,
  doc_no          text        not null,                    -- QT-202608-001
  doc_date        date        not null default current_date,
  status          doc_status  not null default 'draft',

  parent_doc_id   uuid        references documents(id) on delete restrict,  -- QT → IVT → RC
  ref_doc_no      text        not null default '',         -- เลขใบกำกับของผู้ขาย (PO/EX: invNo)

  -- snapshot คู่ค้า ณ วันออกเอกสาร
  party_id        uuid        references contacts(id) on delete set null,
  party_type      contact_type not null default 'person',
  party_name      text        not null default '',
  party_tax_id    text        not null default '',
  party_tel       text        not null default '',
  party_email     text        not null default '',
  party_addr      jsonb       not null default '{}'::jsonb,
  party_addr_text text        not null default '',

  -- snapshot รถ (เฉพาะเอกสารขาย)
  vehicle_id      uuid        references vehicles(id) on delete set null,
  vehicle         jsonb,                                   -- {brand,model,year,color,plateA,plateB,plateProv,engineNo,chassisNo,mileage}
  vehicle_plate   text        not null default '',         -- ดึงออกมาไว้ค้นหา

  -- ยอดเงิน: เก็บผลลัพธ์ที่คำนวณแล้ว เพราะเอกสารที่ออกไปแล้วต้องนิ่ง
  -- แม้ vat_rate ของร้านจะถูกแก้ทีหลัง
  price_tier      char(1)     check (price_tier in ('A','B','C')),
  discount        numeric(14,2) not null default 0 check (discount >= 0),
  vat_mode        vat_mode    not null default 'ex',
  vat_rate        numeric(6,3) not null default 0,
  wht_rate        numeric(6,3) not null default 0,
  subtotal        numeric(14,2) not null default 0,        -- ก่อนหักส่วนลด
  net_amount      numeric(14,2) not null default 0,        -- ฐานภาษี
  vat_amount      numeric(14,2) not null default 0,
  wht_amount      numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null default 0,        -- รวมทั้งสิ้น
  payable         numeric(14,2) not null default 0,        -- grand_total - wht_amount

  -- เครดิต
  credit_days     integer     not null default 0 check (credit_days >= 0),
  due_date        date,

  -- เฉพาะใบเสนอราคา
  complaints      text[],                                  -- อาการที่ลูกค้าแจ้ง (เดิม 3 บรรทัด)
  findings        text[],                                  -- สิ่งที่ตรวจพบ
  approver        text        not null default '',
  proposer        text        not null default '',

  -- เฉพาะเอกสารขาย
  warranty_text   text,
  received_by     text        not null default '',
  wht_deducted    boolean     not null default false,      -- ลูกค้าหักภาษี ณ ที่จ่ายจริงหรือไม่

  -- เฉพาะใบซื้อ
  goods_received  boolean     not null default false,

  -- เฉพาะค่าใช้จ่าย
  expense_cat     expense_cat,
  asset_life_yrs  integer     check (asset_life_yrs is null or asset_life_yrs > 0),

  note            text        not null default '',
  voided_at       timestamptz,
  voided_reason   text,
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (tenant_id, kind, doc_no),

  -- ---- CHECK ต่อชนิดเอกสาร ----
  -- IV ไม่มี VAT เสมอ · IVT มี VAT เสมอ (ตรงกับ enforceVat() ของเดิม)
  constraint doc_iv_no_vat  check (kind <> 'IV'  or vat_mode = 'none'),
  constraint doc_ivt_vat    check (kind <> 'IVT' or vat_mode = 'ex'),
  -- เอกสารซื้อไม่มีรถและไม่มีระดับราคา
  constraint doc_buy_no_vehicle check (direction = 'sell' or (vehicle_id is null and vehicle is null)),
  -- ค่าใช้จ่ายต้องระบุหมวดเสมอ ชนิดอื่นห้ามมี
  constraint doc_expense_cat check (
    (kind = 'EX' and expense_cat is not null) or (kind <> 'EX' and expense_cat is null)
  ),
  -- อายุการใช้งานมีได้เฉพาะค่าใช้จ่ายหมวดสินทรัพย์
  constraint doc_asset_life check (asset_life_yrs is null or expense_cat = 'asset'),
  -- ใบซื้อไม่มีการหักภาษี ณ ที่จ่ายฝั่งเรา (poTotals บังคับ wht = 0)
  constraint doc_po_no_wht check (kind <> 'PO' or wht_rate = 0),
  -- billed ใช้กับใบเสนอราคาเท่านั้น
  constraint doc_status_billed check (status <> 'billed' or kind = 'QT'),
  -- เอกสารที่ยกเลิกต้องบอกเวลา
  constraint doc_void_stamp check ((status = 'void') = (voided_at is not null))
);

create index on documents (tenant_id, kind, doc_date desc);
create index on documents (tenant_id, party_id);
create index on documents (tenant_id, parent_doc_id);
create index on documents (tenant_id, vehicle_plate);
-- ค้างชำระ: ลูกหนี้/เจ้าหนี้เปิดหน้ามาต้องเร็ว
create index documents_open_idx on documents (tenant_id, direction, due_date)
  where status = 'issued';

-- รายการในเอกสาร — quotes/invoices/receipts/purchases/expenses ทั้งหมดใช้ตารางนี้
create table doc_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  doc_id          uuid        not null references documents(id) on delete cascade,
  line_no         integer     not null,
  product_id      uuid        references products(id) on delete set null,  -- null = พิมพ์ชื่อเอง (รายการค้างทำ)
  code            text        not null default '',
  oem             text        not null default '',
  name            text        not null,
  unit            text        not null default '',
  qty             numeric(12,3) not null default 1,
  unit_price      numeric(14,2) not null default 0,
  is_service      boolean     not null default false,      -- ค่าแรง = ฐานคำนวณภาษีหัก ณ ที่จ่าย
  line_total      numeric(14,2) generated always as (round(qty * unit_price, 2)) stored,
  unique (doc_id, line_no)
);

create index on doc_items (tenant_id, product_id);
-- รายการค้างทำ (เมนู 05.2) = บรรทัดที่ยังไม่ผูกกับทะเบียนสินค้า
create index doc_items_pending_idx on doc_items (tenant_id, name)
  where product_id is null;

comment on column doc_items.is_service is
  'ตรงกับ isServiceItem() ของเดิม — เอกสารรุ่นเก่าใช้ code = ''LAB'' แทน ตอน import ต้องแปลงให้';

-- ---------------------------------------------------------------------
-- การรับ/จ่ายเงิน — แทน doc.payments[] และ doc.pay{} ของเดิม
-- ช่องทางที่จ่ายตอนออกเอกสาร (เงินสด/โอน/บัตร) = แถวที่ at_issue = true
-- ---------------------------------------------------------------------
create table payments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  doc_id          uuid        not null references documents(id) on delete cascade,
  paid_on         date        not null default current_date,
  amount          numeric(14,2) not null check (amount > 0),
  method          text        not null default 'เงินสด',
  ref             text        not null default '',
  at_issue        boolean     not null default false,      -- ชำระพร้อมออกเอกสาร
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index on payments (tenant_id, doc_id);
create index on payments (tenant_id, paid_on);

-- ---------------------------------------------------------------------
-- สต๊อก — เป็นบัญชีเดินสะพัด
-- ของเดิม products.qty ถูก += ตอนบันทึกใบซื้อ และ -= ตอนออกใบเสร็จ
-- ถ้าแก้หรือลบเอกสารทีหลัง ยอดคงเหลือเพี้ยนเงียบ ๆ และตรวจย้อนไม่ได้
-- ---------------------------------------------------------------------
create table stock_moves (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  product_id      uuid        not null references products(id) on delete restrict,
  moved_on        date        not null default current_date,
  qty_delta       numeric(12,3) not null check (qty_delta <> 0),  -- บวก = รับเข้า, ลบ = ตัดออก
  unit_cost       numeric(14,2),
  reason          stock_reason not null,
  doc_id          uuid        references documents(id) on delete restrict,
  doc_item_id     uuid        references doc_items(id) on delete set null,
  note            text        not null default '',
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- ตัดสต๊อกจากเอกสารต้องอ้างเอกสารเสมอ ปรับยอดมือถึงจะไม่ต้องอ้าง
  constraint stock_move_doc_ref check (reason in ('opening','adjust') or doc_id is not null)
);

create index on stock_moves (tenant_id, product_id, moved_on desc);
create index on stock_moves (tenant_id, doc_id);

-- ยอดคงเหลือและเคลื่อนไหวล่าสุด — ใช้แทน products.qty / products.lastMove
create view product_stock as
select p.id           as product_id,
       p.tenant_id,
       coalesce(sum(m.qty_delta), 0) as qty_on_hand,
       max(m.moved_on)               as last_move_on
from products p
left join stock_moves m on m.product_id = p.id
group by p.id, p.tenant_id;

-- ---------------------------------------------------------------------
-- ระบบออกเลขที่เอกสาร — แทน DB.seq ที่นับในเครื่อง
-- ต้องออกในทรานแซกชันเดียวกับการบันทึกเอกสาร ไม่งั้นสองเครื่องกดพร้อมกันได้เลขซ้ำ
--
-- period: เก็บ '' ถ้านับต่อเนื่องไม่รีเซ็ต (พฤติกรรมเดิมของโปรแกรม)
--         หรือ 'YYYYMM' ถ้าจะให้เริ่มนับ 001 ใหม่ทุกเดือน — ดู mapping.md ข้อ 3
-- ---------------------------------------------------------------------
create table doc_sequences (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  kind            doc_kind    not null,
  period          text        not null default '',
  last_no         integer     not null default 0,
  primary key (tenant_id, kind, period)
);

create or replace function next_doc_no(
  p_tenant uuid,
  p_kind   doc_kind,
  p_period text default ''
) returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into doc_sequences (tenant_id, kind, period, last_no)
  values (p_tenant, p_kind, p_period, 1)
  on conflict (tenant_id, kind, period)
    do update set last_no = doc_sequences.last_no + 1
  returning last_no into v_next;

  return v_next;
end;
$$;

comment on function next_doc_no is
  'เรียกในทรานแซกชันเดียวกับ INSERT documents เท่านั้น — ON CONFLICT DO UPDATE ล็อกแถวให้อยู่แล้ว';

-- ---------------------------------------------------------------------
-- ชื่อรายการที่สั่งให้ระบบเลิกเตือน — DB.ignoredItems
-- ---------------------------------------------------------------------
create table ignored_item_names (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  name_norm       text        not null,                    -- normName() ของเดิม
  created_at      timestamptz not null default now(),
  primary key (tenant_id, name_norm)
);

-- ---------------------------------------------------------------------
-- updated_at อัตโนมัติ
-- ---------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['tenants','users','contacts','vehicles','products','documents']
  loop
    execute format(
      'create trigger %I_touch before update on %I
       for each row execute function touch_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- แอปตั้ง SET LOCAL app.tenant_id = '<uuid>' ทุก request ก่อน query
-- ต้องต่อ DB ด้วย role ที่ไม่ใช่ superuser/owner ไม่งั้น RLS ถูกข้าม
-- ---------------------------------------------------------------------
create or replace function current_tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

do $$
declare t text;
begin
  foreach t in array array['users','subscriptions','contacts','vehicles',
                           'product_categories','products','documents','doc_items',
                           'payments','stock_moves','doc_sequences','ignored_item_names']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolation on %I
       using (tenant_id = current_tenant_id())
       with check (tenant_id = current_tenant_id())', t);
  end loop;
end;
$$;

alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenant_self on tenants
  using (id = current_tenant_id())
  with check (id = current_tenant_id());

-- ---------------------------------------------------------------------
-- legacy_id — id เดิมจากไฟล์ JSON (uid() ของโปรแกรมเก่า)
-- มีไว้ให้ importer รันซ้ำได้โดยไม่สร้างข้อมูลซ้ำ และให้ตามรอยกลับไปหาไฟล์ต้นทางได้
-- ตัดทิ้งได้เมื่อย้ายลูกค้าเดิมครบทุกรายแล้ว
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['users','contacts','vehicles','product_categories',
                           'products','documents','doc_items','payments']
  loop
    execute format('alter table %I add column legacy_id text', t);
    execute format('create unique index %I_legacy_uidx on %I (tenant_id, legacy_id)
                    where legacy_id is not null', t, t);
  end loop;
end;
$$;
