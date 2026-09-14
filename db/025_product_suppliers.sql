-- =====================================================================
-- DriveGoLight! Web — migration 025 · ผู้ขายของสินค้า (หลายรายต่อสินค้า)
--
-- เลือกจากทะเบียนผู้ขาย (vendor_id) หรือพิมพ์ชื่อเอง (vendor_id ว่าง) —
-- ชื่อที่พิมพ์เองเก็บไว้กับสินค้าใบนี้เท่านั้น ไม่เข้าทะเบียนผู้ขาย (ผู้ใช้กำหนด)
-- =====================================================================
create table product_suppliers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  vendor_id   uuid references contacts(id) on delete set null,
  name        text not null,
  sort_order  int  not null default 0
);
create index product_suppliers_product_idx on product_suppliers (tenant_id, product_id, sort_order);
alter table product_suppliers enable row level security;
create policy product_suppliers_tenant on product_suppliers
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

-- force เหมือนตารางข้อมูลอู่ทุกตัว — enable อย่างเดียวเจ้าของตารางยังอ่านข้ามอู่ได้
alter table product_suppliers force row level security;

-- ให้สิทธิ์ role ของแอปเฉพาะเมื่อมี role นั้นอยู่จริง (แบบเดียวกับ 006 009 010)
-- บนบริการ Postgres แบบ managed มักไม่มี role นี้ ถ้า grant ตรง ๆ ไมเกรชันจะล้มทั้งไฟล์
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    execute 'grant select, insert, update, delete on product_suppliers to dgl_app';
  end if;
end $grant$;
