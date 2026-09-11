-- =====================================================================
-- DriveGoLight! Web — migration 018 · ประวัติเอกสารรู้จักการกู้คืน
--
-- ใบซื้อและค่าใช้จ่ายที่ยกเลิกไปแล้วกู้คืนกลับมาได้ (ตามรุ่น 6.4) การกู้คืน
-- ทำให้เจ้าหนี้ ภาษีซื้อ และสต๊อกกลับมามีผลอีกครั้ง — เป็นการกระทำที่มีน้ำหนัก
-- พอ ๆ กับการยกเลิก จึงต้องมีชื่อของตัวเองในประวัติ ไม่ใช่ถูกบันทึกว่า 'update'
-- ปนกับการแก้ตัวเลขธรรมดา
--
-- (เอกสารรายรับไม่มีการกู้คืน ใบที่ยกเลิกแล้วต้องคัดลอกเป็นใบใหม่เท่านั้น
--  เพราะยอดขาย ภาษีขาย และใบกำกับภาษีที่ส่งออกไปแล้วพัวพันอยู่)
-- =====================================================================

set local lock_timeout = '5s';

alter table doc_edits drop constraint if exists doc_edits_action_check;
alter table doc_edits add constraint doc_edits_action_check
  check (action in ('create', 'update', 'void', 'unvoid'));

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
    -- กู้คืนใบที่ยกเลิกไปแล้ว — เงินและของกลับมามีผลอีกครั้ง จึงไม่ใช่ 'update' ธรรมดา
    elsif old.status = 'void' and new.status is distinct from 'void' then
      act := 'unvoid';
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
