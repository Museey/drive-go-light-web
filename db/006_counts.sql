-- =====================================================================
-- DriveGoLight! Web — migration 006 · ใบตรวจนับสต๊อกและบาร์โค้ด (05.5)
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้เท่านั้น
-- การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql อยู่แล้ว ไม่ต้องรันไฟล์นี้
--
-- รัน:  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/006_counts.sql
-- =====================================================================

-- บาร์โค้ด Code 39 บนตัวสินค้า — ว่างได้หลายตัว แต่ห้ามซ้ำกัน
alter table products add column if not exists barcode text;
create unique index if not exists products_barcode_uidx on products (tenant_id, barcode)
  where barcode is not null;

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

-- RLS เหมือนตารางอื่นทุกตาราง — เปิดและ force
do $$
declare t text;
begin
  foreach t in array array['stock_counts','stock_count_items','stock_count_sequences']
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

grant select, insert, update, delete
  on stock_counts, stock_count_items, stock_count_sequences to dgl_app;
grant execute on function next_count_no(uuid, text) to dgl_app;
