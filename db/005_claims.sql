-- =====================================================================
-- DriveGoLight! Web — migration 005 · ใบเคลมสินค้า (05.3 / 05.4)
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้เท่านั้น
-- การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql อยู่แล้ว ไม่ต้องรันไฟล์นี้
--
-- รัน:  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/005_claims.sql
--
-- หมายเหตุ: alter type ... add value รันในทรานแซกชันเดียวกับที่ใช้ค่าใหม่ไม่ได้
-- psql ที่ไม่ได้ห่อ begin/commit จะ commit ทีละคำสั่งให้เอง จึงรันไฟล์นี้ได้ตรง ๆ
-- (แบบเดียวกับ 003_fifo.sql) แต่ห้ามเอาไปแปะรวมในทรานแซกชันของตัวเอง
-- =====================================================================

-- เหตุผลใหม่: ของออกจากคลังเพราะการเคลม
alter type stock_reason add value if not exists 'claim';

-- stock_moves ที่มีอยู่แล้วยังไม่มีสายไปหาใบเคลม
alter table stock_moves add column if not exists claim_id      uuid;
alter table stock_moves add column if not exists claim_item_id uuid;

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

-- ผ่อนเงื่อนไขให้การตัดสต๊อกอ้างใบเคลมแทนเอกสารได้
alter table stock_moves drop constraint if exists stock_move_doc_ref;
alter table stock_moves add constraint stock_move_doc_ref check (
  reason in ('opening','adjust','use','count','set')
  or doc_id is not null or claim_id is not null);

-- RLS เหมือนตารางอื่นทุกตาราง — เปิดและ force
do $$
declare t text;
begin
  foreach t in array array['claims','claim_items','claim_sequences']
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

grant select, insert, update, delete on claims, claim_items, claim_sequences to dgl_app;
grant execute on function next_claim_no(uuid, claim_side, text) to dgl_app;
