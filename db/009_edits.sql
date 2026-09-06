-- =====================================================================
-- DriveGoLight! Web — migration 009 · ประวัติการบันทึกเอกสาร
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้ การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql
--
-- **ไฟล์แรกที่รันทับฐานข้อมูลที่มีข้อมูลจริงของอู่อยู่ข้างใน**
-- ตัวรันครอบ begin/commit ให้ทั้งไฟล์แล้ว ห้ามใส่เอง (ดู tools/migrate.impl.mjs)
-- =====================================================================

-- ไม่แตะตารางที่แอปใช้อยู่นานเกินห้าวินาที ถ้าจับล็อกไม่ได้ให้ล้มไปเลย
-- ดีกว่าค้างคิวจนทั้งอู่กดอะไรไม่ได้
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- ใครบันทึกเอกสารใบไหนเมื่อไหร่
--
-- รุ่น 6.4 เก็บเป็น doc.edits = [{at, by}] แล้วเรียก stampEdit() ด้วยมือทุกจุดที่บันทึก
-- เราไม่ทำแบบนั้น เพราะจุดที่เขียนเอกสารมีหลายสิบจุดและจะโตขึ้นอีก
-- **ลืมจุดเดียวคือประวัติหายโดยไม่มีอาการ** จึงใช้ trigger ซึ่งไม่มีเส้นทางไหนหลบได้
-- รวมถึงตัวนำเข้า สคริปต์ และคนที่เข้ามาแก้ด้วย psql
--
-- เก็บมากกว่าต้นฉบับหนึ่งอย่างคือ user_id เป็น FK ไม่ใช่ชื่อ เพราะพนักงานเปลี่ยนชื่อได้
-- แต่เก็บชื่อ ณ ตอนนั้นไว้ด้วยเป็นตัวสำรอง เผื่อบัญชีถูกลบทีหลัง
-- ---------------------------------------------------------------------
create table if not exists doc_edits (
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

create index if not exists doc_edits_doc_idx on doc_edits (document_id, id desc);
create index if not exists doc_edits_tenant_idx on doc_edits (tenant_id, at desc);

alter table doc_edits enable row level security;
alter table doc_edits force row level security;

do $policy$ begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'doc_edits'
                    and policyname = 'tenant_isolation') then
    execute 'create policy tenant_isolation on doc_edits
               using (tenant_id = current_tenant_id())
               with check (tenant_id = current_tenant_id())';
  end if;
end $policy$;

-- ---------------------------------------------------------------------
-- ตัวเขียนประวัติ
-- ---------------------------------------------------------------------
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

drop trigger if exists documents_stamp_edit on documents;
create trigger documents_stamp_edit
  after insert or update on documents
  for each row execute function stamp_doc_edit();

-- ---------------------------------------------------------------------
-- สิทธิ์ของ role แอป
--
-- บนบริการ Postgres แบบ managed มัก **ไม่มี role นี้เลย** เพราะแพลตฟอร์ม
-- ให้ role มาให้แล้วหนึ่งตัวและสร้างเพิ่มไม่ได้ — ถ้า grant ตรง ๆ ไมเกรชันจะล้มทั้งไฟล์
-- ---------------------------------------------------------------------
do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    execute 'grant select, insert, delete on doc_edits to dgl_app';
    execute 'grant usage on sequence doc_edits_id_seq to dgl_app';
    execute 'grant execute on function stamp_doc_edit() to dgl_app';
  end if;
end $grant$;
