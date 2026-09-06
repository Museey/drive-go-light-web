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

-- opening = ยอดยกมา · purchase = รับจากใบซื้อ · sale = ตัดจากการขาย
-- adjust  = ปรับยอดด้วยมือ · return = คืนของจากการยกเลิก
-- use     = เบิกใช้ในอู่ · count = ปรับตามการตรวจนับ · set = ตั้งยอดคงเหลือ
create type stock_reason as enum
  ('opening', 'purchase', 'sale', 'adjust', 'return', 'use', 'count', 'set', 'claim');

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
  -- สิทธิ์แบบละเอียด ดู lib/perms.ts — โครงเป็นออบเจกต์เสมอ
  --   menus  {stock:true}          เข้าเมนูหลักได้ไหม
  --   tabs   {'stock.count':true}  เข้าเมนูย่อยได้ไหม
  --   edit   {'stock.list':false}  แก้ไขในเมนูย่อยได้ไหม
  --   export {'stock.list':false}  พิมพ์ทั้งชุด / ดาวน์โหลดไฟล์ได้ไหม
  --   cost / homeReport            สวิตช์ระดับคน
  -- ที่ไม่ได้ตั้งไว้ = อนุญาต ยกเว้น tabs ที่ทำตามกติกาของรุ่น 6.4
  perms           jsonb       not null default '{}'::jsonb,
  active          boolean     not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, email),
  constraint users_perms_object check (jsonb_typeof(perms) = 'object')
);

comment on column users.code is
  'รหัสพนักงานสำหรับอ้างอิงในเอกสารและประวัติการแก้ไข — ไม่ใช่รหัสเข้าระบบ (เข้าด้วยอีเมล)';

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
  -- จำนวนบัญชีพนักงานที่แพ็กเกจนี้เปิดได้ · null = ไม่จำกัด · เจ้าของไม่ถูกนับ
  -- ตรวจตอนสร้างบัญชีใหม่เท่านั้น ไม่ตรวจตอนล็อกอิน — ลดแพ็กเกจแล้วต้องไม่ล็อกใครออก
  max_users       integer     check (max_users is null or max_users > 0),
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
  -- บาร์โค้ด Code 39 สำหรับยิงเข้าใบตรวจนับ — ว่างได้หลายตัว แต่ห้ามซ้ำกัน
  barcode         text,
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

create unique index products_barcode_uidx on products (tenant_id, barcode)
  where barcode is not null;

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
  -- ต้นทุนรวมของการเคลื่อนไหวครั้งนี้ ตรึงไว้ตอนบันทึก ไม่คำนวณใหม่ตอนอ่าน
  -- ฝั่งรับเข้า = จำนวน × ราคาที่ซื้อ · ฝั่งตัดออก = ต้นทุนที่คิดได้แบบเข้าก่อนออกก่อน
  -- ว่างได้เฉพาะแถวที่บันทึกไว้ก่อนระบบคิดต้นทุน — รายงานประมาณให้ด้วยต้นทุนล่าสุด
  cost_amount     numeric(14,2),
  reason          stock_reason not null,
  doc_id          uuid        references documents(id) on delete restrict,
  doc_item_id     uuid        references doc_items(id) on delete set null,
  -- ใบเคลมไม่ได้อยู่ใน documents (ไม่มียอดเงิน) จึงต้องมีสายของตัวเอง
  -- ตารางถูกสร้างทีหลัง จึงผูก foreign key ไว้ท้ายไฟล์
  claim_id        uuid,
  claim_item_id   uuid,
  note            text        not null default '',
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- ตัดสต๊อกจากเอกสารต้องอ้างเอกสารเสมอ ที่ทำด้วยมือถึงจะไม่ต้องอ้าง
  constraint stock_move_doc_ref check (
    reason in ('opening','adjust','use','count','set')
    or doc_id is not null or claim_id is not null)
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

-- ---------------------------------------------------------------------
-- ใบวางบิล — DB.billnotes ของรุ่น 6.4
--
-- ลูกค้าองค์กรไม่จ่ายทีละใบ อู่รวมใบที่ค้างทั้งเดือนเป็นใบเดียวส่งไปแผนกการเงิน
--
-- แยกจาก documents โดยตั้งใจ เพราะใบวางบิล "ไม่ตั้งลูกหนี้ซ้ำและไม่นับรายได้"
-- (คำพูดของรุ่น 6.4 เอง) ยอดของมันคือผลรวมยอดค้างของใบอื่น ณ เวลาที่ถาม ไม่ใช่ยอดของตัวเอง
-- ถ้าใส่เข้า documents ต้องเขียน "and kind <> 'BN'" เพิ่มในทุกคิวรีที่นับเงิน
-- ลืมที่เดียวคือรายได้ซ้ำสองเท่า — แยกตารางแล้วลืมไม่ได้เลยโดยโครงสร้าง
-- ---------------------------------------------------------------------
create table billnotes (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  no              text        not null,                    -- BN-YYYYMM-NNN
  bill_date       date        not null default current_date,
  due_date        date,                                    -- วันนัดรับเงิน
  -- snapshot คู่ค้า ณ วันวางบิล เหมือนเอกสารอื่น
  party_id        uuid        references contacts(id) on delete set null,
  party_name      text        not null default '',
  party_tax_id    text        not null default '',
  party_addr_text text        not null default '',
  by_whom         text        not null default '',         -- ผู้นำเอกสารไปวางบิล
  note            text        not null default '',
  -- ยอด ณ วันที่บันทึก ไว้เทียบย้อนหลังว่าตอนวางบิลแจ้งไปเท่าไร
  -- หน้าจอและใบที่พิมพ์ใหม่ใช้ยอดสดที่คำนวณจากยอดค้างปัจจุบัน
  total_snapshot  numeric(14,2) not null default 0,
  status          doc_status  not null default 'issued',
  voided_at       timestamptz,
  voided_reason   text,
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, no),
  constraint billnote_void_stamp check (
    (status = 'void') = (voided_at is not null))
);

create index on billnotes (tenant_id, bill_date desc);

-- ใบแจ้งหนี้ที่รวมอยู่ในใบวางบิลใบหนึ่ง
--
-- voided เก็บซ้ำจาก billnotes.status เพราะ partial index อ้างตารางอื่นไม่ได้
-- ยอมเก็บซ้ำเพื่อให้ฐานข้อมูลบังคับ "ใบเดียวอยู่ในใบวางบิลที่ยังไม่ยกเลิกได้ครั้งเดียว" ได้เอง
-- การวางบิลซ้ำคือการทวงเงินก้อนเดียวสองรอบ ซึ่งเสียความน่าเชื่อถือกับลูกค้าองค์กร
create table billnote_docs (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  billnote_id     uuid        not null references billnotes(id) on delete cascade,
  doc_id          uuid        not null references documents(id) on delete restrict,
  voided          boolean     not null default false,
  primary key (billnote_id, doc_id)
);

create unique index billnote_doc_once on billnote_docs (tenant_id, doc_id)
  where not voided;
create index on billnote_docs (tenant_id, doc_id);

-- เลขที่ใบวางบิลนับแยกจาก doc_sequences เพราะ BN ไม่ได้อยู่ใน doc_kind
-- (ตั้งใจไม่ใส่ ไม่งั้นทุกที่ที่แยกตามชนิดเอกสารต้องคิดถึง BN ทั้งที่ไม่เกี่ยว)
create table billnote_sequences (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  period          text        not null default '',
  last_no         integer     not null default 0,
  primary key (tenant_id, period)
);

create or replace function next_billnote_no(p_tenant uuid, p_period text default '')
returns integer language plpgsql as $$
declare v_next integer;
begin
  insert into billnote_sequences (tenant_id, period, last_no)
  values (p_tenant, p_period, 1)
  on conflict (tenant_id, period)
    do update set last_no = billnote_sequences.last_no + 1
  returning last_no into v_next;
  return v_next;
end;
$$;


-- ---------------------------------------------------------------------
-- ใบเคลมสินค้า (05.3 ลูกค้า · 05.4 ผู้ขาย)
--
-- ของที่ออกจากคลังโดยไม่มีการเรียกเก็บเงิน — จ่ายอะไหล่ทดแทนให้ลูกค้าตามรับประกัน
-- หรือส่งของชำรุดคืนโรงงาน ทั้งสองทางของหายไปจากคลังจริง ต้นทุนจึงต้องลงเป็นค่าใช้จ่าย
-- ไม่งั้นกำไรจะสูงเกินจริงเท่ากับมูลค่าของที่จ่ายออกไป
--
-- แยกจาก documents เหมือนใบวางบิล แต่ด้วยเหตุผลตรงข้าม — ใบวางบิลไม่มียอดของตัวเอง
-- ส่วนใบเคลมมีแต่ต้นทุน ไม่มีราคาขาย ภาษี หรือยอดที่ต้องเก็บเงิน
-- ยัดเข้า documents แล้วต้องใส่ศูนย์ในคอลัมน์เงินสิบกว่าช่อง แล้วทุกคิวรีที่นับยอดขาย
-- ต้องจำไว้ว่าต้องกรองออก
-- ---------------------------------------------------------------------
create type claim_side as enum ('customer', 'vendor');

create table claims (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  no              text        not null,                    -- CL-YYYYMM-NNN / VC-YYYYMM-NNN
  side            claim_side  not null,
  -- ชุดประเภทคนละชุดต่อทิศทาง ยกมาจาก CLAIM_KINDS / VCLAIM_KINDS ของรุ่น 6.4
  kind            text        not null,
  claim_date      date        not null default current_date,
  -- snapshot คู่ค้า ณ วันเคลม เหมือนเอกสารอื่น — ฝั่งลูกค้าคือผู้รับของ ฝั่งผู้ขายคือผู้รับของคืน
  party_id        uuid        references contacts(id) on delete set null,
  party_name      text        not null default '',
  party_tel       text        not null default '',
  -- ฝั่งลูกค้า = เลขที่ใบเสร็จที่รับประกัน · ฝั่งผู้ขาย = ใบซื้อหรือเลขเคลมของผู้ขาย
  ref_no          text        not null default '',
  vehicle_id      uuid        references vehicles(id) on delete set null,
  vehicle         jsonb,
  vehicle_plate   text        not null default '',
  reason          text        not null,                    -- 6.4 บังคับกรอกก่อนบันทึก
  by_whom         text        not null default '',
  note            text        not null default '',
  status          doc_status  not null default 'issued',
  voided_at       timestamptz,
  voided_reason   text,
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (tenant_id, no),
  constraint claim_void_stamp check ((status = 'void') = (voided_at is not null)),
  -- ชนิดต้องอยู่ในชุดของทิศทางนั้น ไม่ให้ใบฝั่งลูกค้าถือ kind ของฝั่งผู้ขาย
  constraint claim_kind_side check (
    (side = 'customer' and kind in ('warranty','supplier','damage','other')) or
    (side = 'vendor'   and kind in ('defect','wrong','damaged','return','other'))),
  -- ฝั่งผู้ขายไม่เกี่ยวกับรถลูกค้า กฎเดียวกับ doc_buy_no_vehicle ของเอกสารซื้อ
  constraint claim_vendor_no_vehicle check (
    side = 'customer' or (vehicle_id is null and vehicle is null))
);

create index on claims (tenant_id, side, claim_date desc);
create index on claims (tenant_id, party_id);

create table claim_items (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  claim_id        uuid        not null references claims(id) on delete cascade,
  line_no         integer     not null,
  -- ว่างได้ = รายการที่พิมพ์ชื่อเอง ขึ้นบนใบพิมพ์แต่ไม่ตัดสต๊อก (ตามรุ่น 6.4)
  product_id      uuid        references products(id) on delete set null,
  code            text        not null default '',
  oem             text        not null default '',
  name            text        not null default '',
  unit            text        not null default '',
  qty             numeric(12,3) not null check (qty > 0),
  unit_cost       numeric(14,2) not null default 0,
  -- ต้นทุนที่คิดได้จริงตอนตัดสต๊อก ตรึงไว้เหมือน stock_moves.cost_amount
  -- ว่างได้เฉพาะบรรทัดที่ไม่ผูกสินค้า และใบที่นำเข้ามาจากไฟล์สำรอง
  cost_amount     numeric(14,2),
  unique (claim_id, line_no)
);

create index on claim_items (tenant_id, product_id);

-- เลขที่นับแยกต่อทิศทาง — CL กับ VC เดินเลขคนละชุด เหมือนที่ 6.4 ใช้ seq.cl กับ seq.vc
create table claim_sequences (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  side            claim_side  not null,
  period          text        not null default '',
  last_no         integer     not null default 0,
  primary key (tenant_id, side, period)
);

create or replace function next_claim_no(p_tenant uuid, p_side claim_side, p_period text default '')
returns integer language plpgsql as $$
declare v_next integer;
begin
  insert into claim_sequences (tenant_id, side, period, last_no)
  values (p_tenant, p_side, p_period, 1)
  on conflict (tenant_id, side, period)
    do update set last_no = claim_sequences.last_no + 1
  returning last_no into v_next;
  return v_next;
end;
$$;

-- ผูกสายจาก stock_moves ตอนนี้ที่ตารางมีแล้ว
--
-- restrict ที่ claim_id ตั้งใจ — ลบใบเคลมที่ตัดสต๊อกไปแล้วไม่ได้ ต้องยกเลิกเท่านั้น
-- กฎเดียวกับที่เอกสารขายใช้อยู่ บัญชีที่ลบย้อนหลังได้ก็ไม่ใช่บัญชีอีกต่อไป
alter table stock_moves
  add constraint stock_moves_claim_id_fkey
    foreign key (claim_id) references claims(id) on delete restrict,
  add constraint stock_moves_claim_item_id_fkey
    foreign key (claim_item_id) references claim_items(id) on delete set null;

create index on stock_moves (tenant_id, claim_id);


-- ---------------------------------------------------------------------
-- ใบตรวจนับสต๊อก (05.5)
--
-- เดินนับของจริงในชั้นวางแล้วปรับยอดในระบบให้ตรง ส่วนต่างที่พบคือของที่หายไป
-- โดยไม่มีเอกสาร ต้องลงเป็นค่าใช้จ่าย ไม่งั้นกำไรจะสูงเกินจริงเท่ากับมูลค่าของที่หาย
--
-- ปรับยอดแล้วย้อนไม่ได้ตามรุ่น 6.4 — "ยกเลิกการปรับยอด" ไม่มีความหมายทางบัญชี
-- ของที่หายไปจากชั้นวางไม่ได้กลับมาเพราะกดยกเลิกเอกสาร นับผิดให้เปิดใบใหม่นับใหม่
-- (ต่างจาก 6.4 ตรงที่ใบร่างซึ่งยังไม่แตะสต๊อกเลย ลบทิ้งได้)
-- ---------------------------------------------------------------------
create type count_status as enum ('draft', 'applied');

create table stock_counts (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  no              text        not null,                    -- CT-YYYYMM-NNN
  count_date      date        not null default current_date,
  note            text        not null default '',
  status          count_status not null default 'draft',
  applied_at      timestamptz,
  applied_by      uuid        references users(id) on delete set null,
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, no),
  constraint count_applied_stamp check ((status = 'applied') = (applied_at is not null))
);

create index on stock_counts (tenant_id, count_date desc);

create table stock_count_items (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  count_id        uuid        not null references stock_counts(id) on delete cascade,
  line_no         integer     not null,
  product_id      uuid        not null references products(id) on delete restrict,
  -- null = ยังไม่ได้กรอก · 0 = นับแล้วไม่เจอเลย — สองอย่างนี้ต่างกัน
  -- ถ้าตีค่าว่างเป็นศูนย์ ใบที่นับไปครึ่งเดียวจะตัดสต๊อกอีกครึ่งเป็นศูนย์ทั้งหมด
  counted_qty     numeric(12,3),
  -- ตรึงตอนกดปรับยอดเท่านั้น ตอนเป็นร่างอ่านสดจาก product_stock
  -- เผื่อมีการขายหรือรับของระหว่างที่นับค้างไว้ (คำอธิบายของรุ่น 6.4 เอง)
  system_qty      numeric(12,3),
  unit_cost       numeric(14,2),
  note            text        not null default '',
  -- สินค้าตัวเดียวนับซ้ำในใบเดียวไม่ได้ — ทำให้ "ยิงซ้ำ = นับเพิ่ม"
  -- ไม่กลายเป็น "ยิงซ้ำ = เพิ่มแถวแล้วปรับยอดสองรอบ" โดยไม่ต้องเชื่อโค้ดฝั่งหน้าจอ
  unique (count_id, product_id),
  unique (count_id, line_no)
);

create index on stock_count_items (tenant_id, product_id);

create table stock_count_sequences (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  period          text        not null default '',
  last_no         integer     not null default 0,
  primary key (tenant_id, period)
);

create or replace function next_count_no(p_tenant uuid, p_period text default '')
returns integer language plpgsql as $$
declare v_next integer;
begin
  insert into stock_count_sequences (tenant_id, period, last_no)
  values (p_tenant, p_period, 1)
  on conflict (tenant_id, period)
    do update set last_no = stock_count_sequences.last_no + 1
  returning last_no into v_next;
  return v_next;
end;
$$;


-- ---------------------------------------------------------------------
-- รูปสินค้า — เก็บในฐานข้อมูล ไม่ใช่ object storage
--
-- เหตุผลชี้ขาดคือราคา — พื้นที่ฐานข้อมูลคิดหลักสิบสตางค์ต่อกิกะไบต์ต่อเดือน
-- ส่วนการมีผู้ให้บริการเก็บไฟล์รายที่สองมีค่าใช้จ่ายที่ไม่ใช่ตัวเงิน คือ
-- ไฟล์กำพร้าที่ต้องคอยเก็บกวาด ไฟล์สำรองที่ไม่ครบอีกต่อไป และคำถามเรื่อง
-- ข้อมูลข้ามประเทศที่ต้องกลับไปตอบใหม่ ซึ่งแพงกว่ามาก
--
-- primary key เป็น product_id บังคับ **หนึ่งรูปต่อสินค้าหนึ่งรายการ**
-- ตรงกับ MAX_PICS = 1 ของรุ่น 6.4 โดยไม่ต้องมีโค้ดคอยนับ
-- ---------------------------------------------------------------------
create table product_pics (
  product_id  uuid        primary key references products(id) on delete cascade,
  tenant_id   uuid        not null references tenants(id) on delete cascade,
  -- SHA-256 ของรูปเต็ม ใช้เป็นส่วนหนึ่งของ URL เพื่อให้แคชที่เบราว์เซอร์ได้ถาวร
  -- รูปเปลี่ยน = URL เปลี่ยน จึงไม่มีปัญหารูปเก่าค้างในแคช
  sha         text        not null check (sha ~ '^[0-9a-f]{64}$'),
  mime        text        not null check (mime in ('image/jpeg', 'image/png')),
  -- ความกว้างและสูงจริง — null ได้ เพราะรูปที่มาจากไฟล์สำรองของรุ่นเดิม
  -- อ่านขนาดไม่ได้ที่ฝั่งเซิร์ฟเวอร์ (ไม่มีตัวถอดรูป และไม่อยากลงโมดูล native)
  -- ใส่ค่าปลอมไว้แล้วหลอกตัวเองว่ารู้ แย่กว่าการบอกตรง ๆ ว่าไม่ทราบ
  width       integer     check (width  is null or width  between 1 and 2000),
  height      integer     check (height is null or height between 1 and 2000),
  full_bytes  bytea       not null,
  thumb_bytes bytea       not null,
  -- ขนาดรวมสองรูป เก็บไว้เพื่อคิดโควตาโดยไม่ต้องอ่าน bytea ทั้งก้อนมานับ
  bytes       integer     not null check (bytes > 0),
  created_at  timestamptz not null default now()
);

comment on table product_pics is
  'รูปสินค้า หนึ่งรูปต่อหนึ่งรายการ — เก็บสองขนาด รูปย่อสำหรับตาราง รูปเต็มสำหรับกดดู';

create index product_pics_tenant_idx on product_pics (tenant_id);
create index product_pics_sha_idx on product_pics (tenant_id, sha);

-- โควตาต่ออู่ — **บังคับที่ฐานข้อมูล ไม่ใช่ที่โค้ดแอป**
-- อู่เดียวที่อัปรูปจากกล้อง 12 ล้านพิกเซลรัว ๆ ต้องไม่ทำให้อู่อื่นล่มไปด้วย
-- และการตรวจในโค้ดแอปมีช่องแข่งกันเขียนเสมอ
create or replace function check_pic_quota() returns trigger
language plpgsql as $fn$
declare
  used   bigint;
  quota  constant bigint := 200 * 1024 * 1024;
begin
  select coalesce(sum(bytes), 0) into used
    from product_pics
   where tenant_id = new.tenant_id
     and product_id <> new.product_id;   -- รูปที่กำลังจะถูกแทนที่ ไม่นับซ้ำ

  if used + new.bytes > quota then
    raise exception 'พื้นที่รูปของอู่นี้เต็ม (ใช้ไป % MB จาก % MB) — ลบรูปที่ไม่ใช้แล้วก่อน',
      round((used + new.bytes) / 1048576.0, 1), round(quota / 1048576.0, 0)
      using errcode = '53100';           -- disk_full
  end if;
  return new;
end
$fn$;

comment on function check_pic_quota() is
  'กันอู่เดียวใช้พื้นที่จนอู่อื่นล่ม — บังคับที่ฐานข้อมูลเพราะโค้ดแอปมีช่องแข่งกันเขียน';

create trigger product_pics_quota
  before insert or update on product_pics
  for each row execute function check_pic_quota();


-- ---------------------------------------------------------------------
-- ประวัติการบันทึกเอกสาร — ใครบันทึกใบไหนเมื่อไหร่
--
-- รุ่น 6.4 เก็บเป็น doc.edits = [{at, by}] แล้วเรียก stampEdit() ด้วยมือทุกจุดที่บันทึก
-- เราไม่ทำแบบนั้น เพราะจุดที่เขียนเอกสารมีหลายสิบจุดและจะโตขึ้นอีก
-- **ลืมจุดเดียวคือประวัติหายโดยไม่มีอาการ** จึงใช้ trigger ซึ่งไม่มีเส้นทางไหนหลบได้
-- รวมถึงตัวนำเข้า สคริปต์ และคนที่เข้ามาแก้ด้วย psql
--
-- เก็บมากกว่าต้นฉบับหนึ่งอย่างคือ user_id เป็น FK ไม่ใช่ชื่อ เพราะพนักงานเปลี่ยนชื่อได้
-- แต่เก็บชื่อ ณ ตอนนั้นไว้ด้วยเป็นตัวสำรอง เผื่อบัญชีถูกลบทีหลัง
-- ---------------------------------------------------------------------
create table doc_edits (
  id          bigint      generated always as identity primary key,
  tenant_id   uuid        not null references tenants(id) on delete cascade,
  document_id uuid        not null references documents(id) on delete cascade,
  at          timestamptz not null default now(),
  user_id     uuid        references users(id) on delete set null,
  user_name   text        not null default '',
  action      text        not null check (action in ('create', 'update', 'void'))
);

comment on table doc_edits is
  'ใครบันทึกเอกสารใบไหนเมื่อไหร่ — เขียนโดย trigger เท่านั้น ไม่มีทางข้าม';

create index doc_edits_doc_idx on doc_edits (document_id, id desc);
create index doc_edits_tenant_idx on doc_edits (tenant_id, at desc);

create or replace function stamp_doc_edit() returns trigger
language plpgsql as $fn$
declare
  uid   uuid;
  uname text := '';
  act   text;
begin
  if tg_op = 'INSERT' then
    act := 'create';
  else
    -- การกดบันทึกโดยไม่แก้อะไรเลย ไม่ต้องรกประวัติ
    --
    -- ต้องตัด updated_at ออกก่อนเทียบ เพราะ trigger touch_updated_at ที่ทำงาน
    -- ก่อนหน้านี้ตั้งค่าใหม่ให้ทุกครั้ง ถ้าเทียบทั้งแถวจะไม่มีวันเท่ากันเลย
    if to_jsonb(old) - 'updated_at' is not distinct from to_jsonb(new) - 'updated_at' then
      return null;
    end if;
    if new.status = 'void' and old.status is distinct from 'void' then
      act := 'void';
    else
      act := 'update';
    end if;
  end if;

  -- **ห้ามล้มเหลวเพราะไม่รู้ว่าใครทำ** — การบันทึกเอกสารสำคัญกว่าการรู้ชื่อคนบันทึก
  -- ตัวนำเข้า สคริปต์ และไมเกรชันไม่ได้ตั้งค่านี้ ให้บันทึกเป็น null แล้วแสดงว่า "ระบบ"
  -- พารามิเตอร์ตัวที่สองของ current_setting คือ true จึงคืน null แทนการโยน error
  uid := nullif(current_setting('app.user_id', true), '')::uuid;
  if uid is not null then
    select u.name into uname from users u where u.id = uid;
  end if;

  insert into doc_edits (tenant_id, document_id, user_id, user_name, action)
  values (new.tenant_id, new.id, uid, coalesce(uname, ''), act);

  -- เพดาน 100 แถวต่อเอกสารตามต้นฉบับ — เอกสารใบเดียวที่ถูกกดบันทึกพันครั้ง
  -- ต้องไม่ลากตารางประวัติของทั้งอู่ให้โต
  delete from doc_edits e
   where e.document_id = new.id
     and e.id < (select min(id) from (
           select id from doc_edits
            where document_id = new.id
            order by id desc limit 100) keep);

  return null;
end
$fn$;

comment on function stamp_doc_edit() is
  'เขียน doc_edits ทุกครั้งที่เอกสารถูกสร้างหรือแก้ — ผู้ใช้มาจาก app.user_id';

create trigger documents_stamp_edit
  after insert or update on documents
  for each row execute function stamp_doc_edit();


do $$
declare t text;
begin
  foreach t in array array['users','subscriptions','contacts','vehicles',
                           'product_categories','products','documents','doc_items',
                           'payments','stock_moves','doc_sequences','ignored_item_names',
                           'billnotes','billnote_docs','billnote_sequences',
                           'claims','claim_items','claim_sequences',
                           'stock_counts','stock_count_items','stock_count_sequences',
                           'doc_edits','product_pics']
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
