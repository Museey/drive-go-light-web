-- =====================================================================
-- DriveGoLight! Web — migration 013 · รวมสิทธิ์ของสคีมา ops ไว้ที่เดียว
--
-- **อาการที่เจอ** — db/app-role.sql เขียนไว้ว่า "ต้องรันไฟล์นี้ซ้ำทุกครั้งหลังกู้"
-- แต่มันให้เฉพาะสิทธิ์ *เรียกฟังก์ชัน* ในสคีมา ops ไม่ได้ให้สิทธิ์ *ตาราง*
-- ส่วนสิทธิ์ตารางมาจาก 008_ops.sql (ซึ่งข้ามถ้ายังไม่มี role) หรือจาก
-- tools/setup-db.mjs ที่มีรายชื่ออีกชุดของตัวเอง
--
-- ผลคือถ้ากู้ระบบแล้วรัน app-role.sql ซ้ำตามที่เอกสารบอก **แอปจะบันทึก
-- ข้อผิดพลาดลง ops.errors ไม่ได้อีกเลย** โดยไม่มีอาการอะไรให้เห็น —
-- ตัวบันทึกถูกเขียนไว้ไม่ให้โยน error เพราะตัวบันทึกที่พังแล้วกลบของจริงทิ้ง
-- แย่กว่าไม่มีตัวบันทึก ซึ่งแปลว่าเรื่องนี้จะเงียบสนิท
--
-- แก้โดยย้ายสิทธิ์ตารางเข้าไปอยู่ใน ops.grant_app() ด้วย — ที่เดียวจบ
-- แล้วทั้ง app-role.sql และ setup-db.mjs เรียกตัวเดียวกัน
--
-- เขียนเป็นไฟล์ใหม่แทนการแก้ 011 เพราะ 011 ขึ้นเครื่องจริงไปแล้ว
-- =====================================================================

set local lock_timeout = '5s';

create or replace function ops.grant_app(p_role name)
returns void
language plpgsql
as $grant$
declare
  fn text;
  /* ฟังก์ชันที่แอปต้องเรียกได้จริง — ที่เหลือเป็นของภายใน โดยเฉพาะ ops.log
     ซึ่งถ้าเรียกได้จากข้างนอกจะปลอมบันทึกการใช้งานได้ */
  app_fns text[] := array[
    'find_operator_for_signin(citext)',
    'record_failed_signin(uuid)',
    'create_session(uuid, bytea, timestamptz, text)',
    'load_session(bytea)',
    'delete_session(bytea)',
    'peek_setup_token(bytea)',
    'consume_setup_token(bytea, text)',
    'viewing()',
    'list_shops(bytea)',
    'open_shop(bytea, text, text, citext, text, bytea, timestamptz)',
    'issue_owner_reset(bytea, uuid, bytea, timestamptz)',
    'record_renewal(bytea, uuid, text, date, date, numeric, text)',
    'set_max_users(bytea, uuid, integer)',
    'add_operator(bytea, citext, text, bytea, timestamptz)',
    'list_operators(bytea)',
    'set_operator_active(bytea, uuid, boolean)',
    'list_errors(bytea, integer)',
    'list_audit(bytea, integer)'
  ];
begin
  execute format('grant usage on schema ops to %I', p_role);

  /**
   * สิทธิ์ตาราง — ย้ายมาจาก 008_ops.sql และ tools/setup-db.mjs
   *
   * แอปเขียน ops.errors ได้ แต่ **ลบไม่ได้** โดยตั้งใจ การล้างของเก่าเป็นงาน
   * ของ tools/prune-errors.mjs ที่รันด้วยสิทธิ์ผู้ดูแล — แอปที่ลบ log ของตัวเองได้
   * คือแอปที่ลบหลักฐานตอนมีปัญหาได้ด้วย
   */
  execute format('grant select, insert, update on ops.errors to %I', p_role);
  execute format('grant usage, select on sequence ops.errors_id_seq to %I', p_role);
  execute format('grant select on ops.migrations to %I', p_role);

  foreach fn in array app_fns loop
    /* ข้ามตัวที่ยังไม่มี — ไฟล์นี้ถูกเรียกซ้ำจาก app-role.sql ซึ่งอาจรันบนฐาน
       ที่ยังอัปเกรดไม่ครบ การล้มทั้งไฟล์เพราะฟังก์ชันเดียวหายทำให้กู้ระบบไม่ได้ */
    if to_regprocedure('ops.' || fn) is not null then
      execute format('grant execute on function ops.%s to %I', fn, p_role);
    end if;
  end loop;
end
$grant$;

comment on function ops.grant_app(name) is
  'ให้สิทธิ์ทั้งตารางและฟังก์ชันของสคีมา ops เท่าที่แอปต้องใช้ — '
  'db/app-role.sql และ tools/setup-db.mjs เรียกตัวนี้ตัวเดียว จะได้ไม่มีรายชื่อสองชุด';

do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    perform ops.grant_app('dgl_app');
  end if;
end $g$;
