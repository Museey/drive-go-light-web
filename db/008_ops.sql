-- =====================================================================
-- DriveGoLight! Web — 008 · สคีมาสำหรับงานดูแลระบบ
--
-- สองตารางที่ไม่ใช่ข้อมูลของอู่ จึงไม่อยู่ใน public และไม่ผูกกับ RLS
--   ops.migrations  จดว่ารันไฟล์ไมเกรชันไหนไปแล้ว
--   ops.errors      ข้อผิดพลาดที่เกิดขึ้นจริงบนเครื่อง
--
-- รันซ้ำได้ทั้งไฟล์
-- =====================================================================

create schema if not exists ops;

-- ---------------------------------------------------------------------
-- ไมเกรชันที่รันไปแล้ว
--
-- บนเครื่องพัฒนาล้างฐานทิ้งได้ทุกวันจึงไม่ต้องจด แต่บนเครื่องจริงล้างไม่ได้
-- และวิธีที่คนพลาดคือรันไฟล์เดิมซ้ำ หรือข้ามไฟล์กลางลำดับแล้วไม่รู้ตัว
-- จนกว่าจะมีหน้าพังเพราะคอลัมน์ที่ยังไม่มี
--
-- checksum มีไว้จับกรณีที่อันตรายกว่า — มีคนแก้ไฟล์ที่ขึ้นเครื่องจริงไปแล้ว
-- ซึ่งทำให้โค้ดกับฐานข้อมูลไม่ตรงกันโดยไม่มีใครรู้
-- ---------------------------------------------------------------------
create table if not exists ops.migrations (
  filename    text        primary key,
  checksum    text        not null,          -- sha256 ของไฟล์ ณ ตอนที่รัน
  ran_at      timestamptz not null default now(),
  ran_by      text        not null default current_user
);

-- ---------------------------------------------------------------------
-- ข้อผิดพลาดที่เกิดบนเครื่อง
--
-- อยู่นอก RLS โดยตั้งใจ — ข้อผิดพลาดจำนวนมากเกิดก่อนที่จะรู้ว่าเป็นอู่ไหน
-- (ตอนล็อกอิน ตอนต่อฐานข้อมูลไม่ได้) และตอนไล่ปัญหาต้องอ่านข้ามอู่ได้
--
-- **ห้ามเก็บรหัสผ่าน token หรือค่าที่ใช้สวมสิทธิ์ได้** — recordError() ใน lib/ops.ts
-- กรองให้ก่อนเสมอ และมีชุดทดสอบยืนยัน เพราะที่เก็บ log คือที่ที่ความลับรั่วบ่อยที่สุด
-- ---------------------------------------------------------------------
create table if not exists ops.errors (
  id          bigserial   primary key,
  at          timestamptz not null default now(),
  -- server = หน้าเว็บฝั่งเซิร์ฟเวอร์ · client = เบราว์เซอร์ · action = server action
  -- job = งานเบื้องหลัง เช่น สำรองข้อมูล
  kind        text        not null check (kind in ('server', 'client', 'action', 'job')),
  -- ตัวจัดกลุ่มของ Next.js — ข้อผิดพลาดเดียวกันได้ digest เดียวกัน
  digest      text,
  message     text        not null,
  stack       text,
  path        text,
  -- รู้บ้างไม่รู้บ้าง เก็บเท่าที่รู้ · ไม่ผูก foreign key เพราะอู่อาจถูกลบไปแล้ว
  tenant_id   uuid,
  user_id     uuid,
  seen        boolean     not null default false
);

create index if not exists errors_recent on ops.errors (at desc);
create index if not exists errors_unseen on ops.errors (at desc) where not seen;

-- ---------------------------------------------------------------------
-- สิทธิ์ของ role แอป
--
-- เขียนข้อผิดพลาดได้ อ่านได้ แต่ **ลบไม่ได้** — คนที่ทำระบบพังต้องลบร่องรอยไม่ได้
-- การลบของเก่าเป็นงานของผู้ดูแลผ่าน ops.prune_errors()
--
-- ตาราง migrations แอปอ่านได้อย่างเดียว ใช้ตอนตรวจสุขภาพว่าไมเกรชันครบไหม
-- ---------------------------------------------------------------------
grant usage on schema ops to dgl_app;
grant select, insert, update on ops.errors to dgl_app;
grant usage, select on sequence ops.errors_id_seq to dgl_app;
grant select on ops.migrations to dgl_app;

-- ลบข้อผิดพลาดที่เก่ากว่าที่กำหนด — ค่าตั้งต้น 90 วัน
-- ให้ตรงกับที่หน้านโยบายข้อมูลส่วนบุคคลบอกไว้เรื่องการเก็บไฟล์สำรอง
create or replace function ops.prune_errors(p_days integer default 90)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from ops.errors where at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;
