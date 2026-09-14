-- =====================================================================
-- DriveGoLight! Web — migration 029 · ชุดอะไหล่ซ่อมบำรุง (kit)
-- รวมวัสดุสิ้นเปลืองหลายรายการ (จากทะเบียนสินค้า หรือพิมพ์เอง) เป็นหนึ่งชุด ตั้งราคาขายชุดเดียว
-- บนเอกสารแสดง "ชุดอะไหล่ซ่อมบำรุง <ชื่อชุด> (รายการ, รายการ, …)" ราคาตามที่ตั้ง · ใบเสร็จตัดสต๊อกชิ้นส่วนที่ผูกทะเบียน
-- =====================================================================
create table kits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  code        text not null,
  name        text not null,
  price       numeric(14,2) not null default 0,
  note        text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, code)
);
create table kit_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kit_id      uuid not null references kits(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,   -- null = พิมพ์ชื่อเอง
  name        text not null,
  unit        text not null default '',
  qty         numeric(14,3) not null default 1,
  unit_cost   numeric(14,2) not null default 0,
  sort_order  int not null default 0
);
create index on kit_items (tenant_id, kit_id, sort_order);
alter table doc_items add column kit_id uuid references kits(id) on delete set null;   -- บรรทัดที่เป็นชุดอะไหล่
alter table kits enable row level security;       alter table kits force row level security;
alter table kit_items enable row level security;  alter table kit_items force row level security;
create policy tenant_isolation on kits using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy tenant_isolation on kit_items using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

-- ให้สิทธิ์ role ของแอปเฉพาะเมื่อมี role นั้นอยู่จริง (แบบเดียวกับ 004 005 010 025)
-- ไม่มีบรรทัดนี้ เครื่องที่แอปต่อด้วย dgl_app อ่านชุดอะไหล่ไม่ได้เลย
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    execute 'grant select, insert, update, delete on kits, kit_items to dgl_app';
  end if;
end $grant$;
