-- 032 — จำกัดสินค้าที่ใช้งานไม่เกิน 3,000 รายการต่ออู่ (16 ก.ย. 2569)
-- แผน PLAN-product-limit-2569-09-16.md · เทสต์ apps/web/test/product-limit-db.test.ts

-- ขีดจำกัดสินค้าที่ใช้งานต่ออู่ (032) — **บังคับที่ฐานข้อมูล ไม่ใช่ที่โค้ดแอป** แบบเดียวกับโควตารูปสินค้า
--
-- ผู้ใช้กำหนด (16 ก.ย. 2569): อู่หนึ่งมีสินค้าที่ใช้งานได้ไม่เกิน 3,000 รายการ
-- นับเฉพาะที่เปิดใช้งาน — ระบบไม่มีทางลบสินค้า ปิดใช้งานสินค้าที่เลิกขายจึงเป็นทางเดียวที่คืนที่
--
-- สินค้าเกิดได้หลายทาง (ฟอร์ม · เปิดใช้งานกลับ · CSV · รายการค้างทำ · กู้คืนไฟล์)
-- ตรวจในโค้ดแอปอย่างเดียว ทางที่เพิ่มวันหน้าจะไม่มีใครจำได้ว่าต้องตรวจ
--
-- **ระดับคำสั่ง ไม่ใช่รายแถว** — กู้คืนไฟล์ใส่สินค้าหลายพันแถวในคำสั่งเดียว รายแถวจะนับซ้ำหลายพันรอบ
-- **ล็อกรายอู่ก่อนนับ** — สองทรานแซกชันเพิ่มตัวสุดท้ายพร้อมกัน ถ้าไม่ล็อกจะเห็นแค่ของตัวเองแล้วผ่านทั้งคู่
--   ตัวที่สองรอจนตัวแรกจบ แล้วนับใหม่ (READ COMMITTED ถ่ายภาพใหม่ทุกคำสั่ง) จึงเห็นแถวที่เพิ่ง commit
-- ค่า 3,000 ต้องตรงกับ PRODUCT_LIMIT ใน packages/core (เทสต์ product-limit-db ตรวจ)
create or replace function enforce_product_limit(p_tenant uuid) returns void
language plpgsql as $fn$
declare
  lim constant int := 3000;
  n   bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('product_limit:' || p_tenant::text, 0));
  select count(*) into n from products where tenant_id = p_tenant and active;
  if n > lim then
    raise exception 'สินค้าที่ใช้งานเกิน % รายการ (มี % รายการ) — ปิดใช้งานสินค้าที่เลิกขายก่อน', lim, n
      using errcode = '53400', constraint = 'products_active_limit';
  end if;
end
$fn$;

comment on function enforce_product_limit(uuid) is
  'สินค้าที่ใช้งานไม่เกิน 3,000 รายการต่ออู่ — ล็อกรายอู่แล้วนับ เกินแล้วยกเลิกทั้งคำสั่ง (errcode 53400)';

create or replace function check_product_limit() returns trigger
language plpgsql as $fn$
declare
  t uuid;
begin
  if tg_op = 'INSERT' then
    for t in select distinct r.tenant_id from new_rows r where r.active order by 1 loop
      perform enforce_product_limit(t);
    end loop;
  else
    -- แก้ราคา/ชื่อไม่นับ — นับเฉพาะเมื่อมีสินค้าจากปิดเป็นเปิดใช้งาน
    for t in
      select distinct r.tenant_id
        from new_rows r join old_rows o on o.id = r.id
       where r.active and not o.active
       order by 1
    loop
      perform enforce_product_limit(t);
    end loop;
  end if;
  return null;
end
$fn$;

drop trigger if exists products_limit_insert on products;
create trigger products_limit_insert
  after insert on products
  referencing new table as new_rows
  for each statement execute function check_product_limit();

drop trigger if exists products_limit_activate on products;
create trigger products_limit_activate
  after update on products
  referencing old table as old_rows new table as new_rows
  for each statement execute function check_product_limit();
