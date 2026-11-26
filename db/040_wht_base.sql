-- 040 — ฐานหัก ณ ที่จ่ายของเอกสารขาย: เฉพาะค่าแรง หรือ ทั้งใบ (24 พ.ย. 2569)
--
-- ผู้ใช้ขอ: ให้ตั้งที่ 07.1 ตั้งค่าร้านได้ว่าเอกสารขายคิดภาษีหัก ณ ที่จ่ายจากฐานไหน
--
--   labour  เฉพาะบรรทัดที่ติ๊ก "ค่าแรง" — **ค่าตั้งต้น และเป็นพฤติกรรมเดิมของระบบทุกประการ**
--   all     มูลค่าก่อน VAT ของทั้งใบ (ค่าแรง + ค่าอะไหล่) หลังส่วนลด
--
-- ที่มา: ลูกค้านิติบุคคลเป็นผู้หัก และหักไม่เหมือนกัน บางรายหักเฉพาะค่าแรง
-- บางรายหักทั้งใบตามแนวที่ถือว่างานซ่อมพร้อมอะไหล่เป็นการรับจ้างทำของทั้งก้อน
-- ยอดรับจริงจึงตรงกับที่ระบบคิดก็ต่อเมื่อร้านเลือกฐานแบบเดียวกับที่ลูกค้าของตัวเองใช้
--
-- มีผลกับเอกสารที่บันทึกหลังเปลี่ยนค่า — ใบเดิมเก็บ wht_amount ที่คิดไว้แล้ว ไม่ถูกคิดใหม่ย้อนหลัง
-- สูตรอยู่ที่ packages/core/src/totals.ts (whtBaseOf)
alter table tenants add column if not exists wht_base text not null default 'labour';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_wht_base_check') then
    alter table tenants add constraint tenants_wht_base_check check (wht_base in ('labour', 'all'));
  end if;
end $$;

comment on column tenants.wht_base is
  'ฐานหัก ณ ที่จ่ายของเอกสารขาย — labour = เฉพาะค่าแรง (ค่าตั้งต้น) · all = มูลค่าก่อน VAT ทั้งใบ (040)';
