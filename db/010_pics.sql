-- =====================================================================
-- DriveGoLight! Web — migration 010 · รูปสินค้า
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้ การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql
-- ตัวรันครอบ begin/commit ให้ทั้งไฟล์แล้ว ห้ามใส่เอง (ดู tools/migrate.impl.mjs)
--
-- **ไม่แตะตาราง products เลย** — ไม่มี alter table จึงไม่มีล็อกบนตารางที่แอปใช้อยู่
-- =====================================================================

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- รูปสินค้า — เก็บในฐานข้อมูล ไม่ใช่ object storage
--
-- เหตุผลชี้ขาดคือราคา — พื้นที่ฐานข้อมูลคิดหลักสิบสตางค์ต่อกิกะไบต์ต่อเดือน
-- ส่วนการมีผู้ให้บริการเก็บไฟล์รายที่สองมีค่าใช้จ่ายที่ไม่ใช่ตัวเงิน คือ
-- ไฟล์กำพร้าที่ต้องคอยเก็บกวาด ไฟล์สำรองที่ไม่ครบอีกต่อไป และคำถามเรื่อง
-- ข้อมูลข้ามประเทศที่ต้องกลับไปตอบใหม่ ซึ่งแพงกว่ามาก
--
-- อยู่ในฐานเดียวกันแปลว่า RLS คุ้มให้อัตโนมัติ และไฟล์สำรองไฟล์เดียวยังครบเหมือนเดิม
--
-- primary key เป็น product_id บังคับ **หนึ่งรูปต่อสินค้าหนึ่งรายการ**
-- ตรงกับ MAX_PICS = 1 ของรุ่น 6.4 โดยไม่ต้องมีโค้ดคอยนับ
-- ---------------------------------------------------------------------
create table if not exists product_pics (
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

create index if not exists product_pics_tenant_idx on product_pics (tenant_id);
create index if not exists product_pics_sha_idx on product_pics (tenant_id, sha);

alter table product_pics enable row level security;
alter table product_pics force row level security;

do $policy$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'product_pics'
                    and policyname = 'tenant_isolation') then
    execute 'create policy tenant_isolation on product_pics
               using (tenant_id = current_tenant_id())
               with check (tenant_id = current_tenant_id())';
  end if;
end $policy$;

-- ---------------------------------------------------------------------
-- โควตาต่ออู่
--
-- **บังคับที่ฐานข้อมูล ไม่ใช่ที่โค้ดแอป** — อู่เดียวที่อัปรูปจากกล้อง 12 ล้านพิกเซล
-- รัว ๆ ต้องไม่ทำให้อู่อื่นล่มไปด้วย และการตรวจในโค้ดแอปมีช่องแข่งกันเขียนเสมอ
--
-- รวมทีละไม่กี่ร้อยแถวต่ออู่ จึงไม่ต้องมีตารางสรุปให้ต้องคอยดูแลว่าตรงหรือไม่
-- ---------------------------------------------------------------------
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

drop trigger if exists product_pics_quota on product_pics;
create trigger product_pics_quota
  before insert or update on product_pics
  for each row execute function check_pic_quota();

-- ---------------------------------------------------------------------
-- สิทธิ์ของ role แอป — บนบริการแบบ managed อาจไม่มี role นี้เลย
-- ---------------------------------------------------------------------
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    execute 'grant select, insert, update, delete on product_pics to dgl_app';
    execute 'grant execute on function check_pic_quota() to dgl_app';
  end if;
end $grant$;
