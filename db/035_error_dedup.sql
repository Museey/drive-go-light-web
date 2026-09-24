-- =====================================================================
-- รวมข้อผิดพลาดที่ซ้ำกันเป็นแถวเดียว แล้วนับจำนวนครั้งแทน
--
-- **ทำไมต้องมี** — ops.errors รับของจาก reportClientError ซึ่งเป็นทางเข้าที่
-- ไม่ต้องล็อกอินโดยตั้งใจ (หน้าล็อกอินพังเองก็ต้องรายงานได้) เดิมทุกครั้งที่ถูกเรียก
-- คือหนึ่งแถวใหม่ ใครก็ยิงซ้ำ ๆ ให้ตารางโตไม่หยุดได้ และตารางนี้อยู่ในฐานข้อมูล
-- เดียวกับข้อมูลของอู่ทุกราย — ดิสก์เต็มคืออู่ทุกรายออกบิลไม่ได้พร้อมกัน
-- (ตรวจความปลอดภัย 24 ก.ย. 2569)
--
-- การรวมแถวช่วยเรื่องนี้และช่วยเรื่องที่ตั้งใจไว้แต่แรกด้วย — ข้อผิดพลาดตัวเดียว
-- ที่เกิดกับผู้ใช้ 200 คนเคยกลายเป็น 200 แถวที่ต้องไล่อ่าน ตอนนี้เป็นแถวเดียว
-- ที่บอกว่าเกิด 200 ครั้ง ซึ่งเป็นข้อมูลที่มีประโยชน์กว่าเดิม
--
-- เพดานจำนวนครั้งต่อไอพีอยู่ฝั่งแอป (lib/rate-limit.ts) — สองชั้นคนละหน้าที่:
-- ชั้นนี้กันของซ้ำ ชั้นนั้นกันคนที่สุ่มข้อความใหม่ทุกครั้งให้ลายนิ้วมือไม่ซ้ำ
--
-- รันซ้ำได้ทั้งไฟล์
-- =====================================================================

-- ครั้งล่าสุดที่เจอ · จำนวนครั้งที่เจอ
alter table ops.errors add column if not exists last_at      timestamptz;
alter table ops.errors add column if not exists occurrences  integer;

-- แถวเดิมยังไม่มีค่า — เติมให้เท่ากับตอนที่บันทึกครั้งแรก
update ops.errors set last_at = at where last_at is null;
update ops.errors set occurrences = 1 where occurrences is null;

alter table ops.errors alter column last_at     set default now();
alter table ops.errors alter column occurrences set default 1;
alter table ops.errors alter column last_at     set not null;
alter table ops.errors alter column occurrences set not null;

-- ---------------------------------------------------------------------
-- ลายนิ้วมือของข้อผิดพลาด
--
-- คิดฝั่งแอป (ops-core.ts fingerprintOf) เพราะต้องคิดจากข้อความ *หลัง* กรองความลับ
-- และตัดความยาวแล้ว ไม่ใช่ข้อความดิบ — ไม่งั้นข้อความเดียวกันที่ยาวต่างกันเล็กน้อย
-- จะได้ลายนิ้วมือคนละตัว แล้วการรวมแถวก็ไม่เกิด
--
-- เป็น null ได้ (แถวเก่าทั้งหมดเป็น null) ดัชนีจึงเป็นแบบมีเงื่อนไข
-- แถวเก่าไม่ถูกรวมย้อนหลัง ซึ่งถูกแล้ว — ของเก่าเป็นประวัติที่บันทึกไปตามจริงแล้ว
-- ---------------------------------------------------------------------
alter table ops.errors add column if not exists fingerprint text;

create unique index if not exists errors_fingerprint_uidx
  on ops.errors (fingerprint) where fingerprint is not null;

-- เรียงตาม "เจอล่าสุด" ไม่ใช่ "เจอครั้งแรก" — แถวที่รวมแล้วต้องลอยขึ้นมาเมื่อกลับมาเกิดอีก
create index if not exists errors_last_seen on ops.errors (last_at desc);
create index if not exists errors_unseen_last on ops.errors (last_at desc) where not seen;

-- ---------------------------------------------------------------------
-- ล้างของเก่าต้องดูครั้งล่าสุด ไม่ใช่ครั้งแรก
--
-- ถ้ายังดู at เหมือนเดิม แถวที่เกิดครั้งแรกเมื่อ 100 วันก่อนแต่ยังเกิดอยู่ทุกวัน
-- จะถูกลบทิ้ง ทั้งที่เป็นปัญหาที่กำลังเกิดจริง ๆ ในวันนี้
-- ---------------------------------------------------------------------
create or replace function ops.prune_errors(p_days integer default 90)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from ops.errors where last_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- คอนโซลต้องเห็นจำนวนครั้งและ "เจอล่าสุดเมื่อไหร่"
--
-- ไม่งั้นการรวมแถวจะทำให้แย่ลง — ปัญหาที่เกิดครั้งแรกเมื่อ 60 วันก่อนแต่ยังเกิด
-- อยู่ทุกวัน จะจมอยู่ท้ายรายการเพราะเรียงตามครั้งแรก
--
-- ต้อง drop ก่อนเพราะ create or replace เปลี่ยนคอลัมน์ที่คืนไม่ได้
-- ---------------------------------------------------------------------
drop function if exists ops.list_errors(bytea, integer);

create or replace function ops.list_errors(p_session bytea, p_limit integer default 100)
returns table (
  id bigint, at timestamptz, last_at timestamptz, occurrences integer,
  kind text, message text, tenant_id uuid, digest text
)
language plpgsql
security definer
set search_path = ops, public, pg_temp
as $$
begin
  perform ops.require_session(p_session);
  return query
    select e.id, e.at, e.last_at, e.occurrences, e.kind, e.message, e.tenant_id, e.digest
      from ops.errors e
     order by e.last_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

/* ฟังก์ชันที่เพิ่งสร้างได้สิทธิ์ PUBLIC ตั้งต้นมาด้วยเสมอ ต้องตัดทิ้งทุกครั้ง
   ไม่งั้นการแก้ฟังก์ชันหนึ่งตัวจะเปิดสิทธิ์ให้ทุกคนแบบเงียบ ๆ (เหตุผลเดียวกับใน 011) */
revoke execute on all functions in schema ops from public;

/* ข้ามถ้ายังไม่มีตัวให้สิทธิ์ — ไฟล์นี้ถูกรันบนฐานที่มีแค่ 008 ได้ (ชุดทดสอบ ops.test.ts)
   และการล้มทั้งไฟล์เพราะฟังก์ชันเดียวยังไม่ถูกสร้างทำให้ไมเกรชันเดินต่อไม่ได้ */
do $g$ begin
  if to_regprocedure('ops.grant_app(name)') is not null
     and exists (select 1 from pg_roles where rolname = 'dgl_app') then
    perform ops.grant_app('dgl_app');
  end if;
end $g$;
