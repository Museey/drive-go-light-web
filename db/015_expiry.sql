-- =====================================================================
-- DriveGoLight! Web — migration 015 · วันหมดอายุสินค้า และการตัดแบบ FEFO
--
-- รุ่น 6.4 ไม่มีแนวคิดนี้เลย เป็นของใหม่ทั้งหมด
--
-- **วันหมดอายุอยู่ที่ล็อต ไม่ใช่ที่สินค้า** — น้ำมันเครื่องขวดที่ซื้อเดือนมกรา
-- กับขวดที่ซื้อเดือนสิงหา หมดอายุคนละวันทั้งที่เป็นสินค้ารหัสเดียวกัน
-- ระบบไม่มีตารางล็อต ล็อตคือแถวรับเข้าใน stock_moves วันหมดอายุจึงอยู่ที่นั่น
--
-- ส่วน products.shelf_life_months เป็นแค่ตัวช่วยกรอก — คีย์ครั้งเดียวว่า
-- "น้ำมันเครื่องเก็บได้ 24 เดือน" แล้วระบบเติมวันหมดอายุให้ตอนรับของ
-- **ไม่ได้ใช้ตัดสินอะไรตอนตัดสต๊อก** ตัวที่ใช้จริงคือ expires_on ของแต่ละล็อต
-- =====================================================================

set local lock_timeout = '5s';

-- อายุการเก็บของสินค้า — ว่าง = ไม่มีวันหมดอายุ (อะไหล่ทั่วไป)
alter table products add column if not exists shelf_life_months integer;

alter table products drop constraint if exists products_shelf_life_sane;
alter table products add constraint products_shelf_life_sane
  check (shelf_life_months is null or (shelf_life_months > 0 and shelf_life_months <= 600));

-- วันหมดอายุของล็อตที่รับเข้า
alter table stock_moves add column if not exists expires_on date;

-- **วันหมดอายุเป็นคุณสมบัติของของที่รับเข้า ไม่ใช่ของการตัดออก**
-- ถ้าเผลอใส่ที่แถวตัดออก การเรียงล็อตจะเพี้ยนโดยไม่มีอาการให้เห็น
alter table stock_moves drop constraint if exists stock_move_expiry_on_receipt;
alter table stock_moves add constraint stock_move_expiry_on_receipt
  check (expires_on is null or qty_delta > 0);

-- ดัชนีสำหรับหน้ารายการของใกล้หมดอายุ — ถามว่า "ล็อตไหนหมดอายุก่อนวันนี้+N"
create index if not exists stock_moves_expiry_idx
  on stock_moves (tenant_id, expires_on)
  where expires_on is not null;

-- วันหมดอายุที่คีย์ไว้บนบรรทัดใบซื้อ
--
-- **ต้องเก็บที่นี่ด้วย ไม่ใช่แค่ที่ stock_moves** — การแก้ใบซื้อลบแถวสต๊อกทิ้ง
-- แล้วสร้างใหม่จากบรรทัดในใบ ถ้าวันหมดอายุอยู่แค่ที่แถวสต๊อก เปิดใบมาแก้อะไรก็ได้
-- แล้วกดบันทึก วันหมดอายุจะหายไปเงียบ ๆ โดยไม่มีอะไรบอก
alter table doc_items add column if not exists expires_on date;

comment on column doc_items.expires_on is
  'วันหมดอายุที่คีย์บนบรรทัดใบซื้อ — ต้นทางของ stock_moves.expires_on';

-- เกณฑ์ว่ากี่วันถึงนับว่าใกล้หมดอายุ — อู่ขายเร็วอยากได้ 30 อู่เก็บนานอยากได้ 90
alter table tenants add column if not exists expiry_warn_days integer not null default 60;

alter table tenants drop constraint if exists tenants_expiry_warn_sane;
alter table tenants add constraint tenants_expiry_warn_sane
  check (expiry_warn_days between 1 and 3650);

comment on column products.shelf_life_months is 'อายุการเก็บเป็นเดือน ใช้เติมวันหมดอายุตอนรับของ — ว่าง = ไม่มีวันหมดอายุ';
comment on column stock_moves.expires_on     is 'วันหมดอายุของล็อตนี้ ใส่ได้เฉพาะแถวรับเข้า — ตัวที่ FEFO ใช้เรียง';
comment on column tenants.expiry_warn_days   is 'กี่วันก่อนหมดอายุถึงเริ่มเตือน';
