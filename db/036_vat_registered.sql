-- 036 — ร้านจด / ไม่จดภาษีมูลค่าเพิ่ม (2 ต.ค. 2569)
-- แผน PLAN-vat-registered-2569-10-02.md · เทสต์ apps/web/test/vat-registered-db.test.ts
--
-- ผู้ใช้ขอ: ร้านที่ไม่ได้จด VAT ต้องออกเอกสารรายรับแบบไม่คิด VAT ทุกใบ และออกใบกำกับภาษีไม่ได้
-- กติกาว่าเอกสารแต่ละชนิดคิด VAT แบบไหนได้อยู่ที่ apps/web/src/lib/sales-rules.ts (vatChoices)
--
-- **ค่าตั้งต้น true** — ตอนเพิ่มคอลัมน์ Postgres เติม true ให้ทุกอู่ที่มีอยู่ทันที
-- อู่ที่คิด VAT อยู่แล้วจึงทำงานเหมือนเดิมทุกอย่าง และไม่มีเอกสารเก่าใบไหนถูกแก้
alter table tenants add column if not exists vat_registered boolean not null default true;

comment on column tenants.vat_registered is
  'จดภาษีมูลค่าเพิ่มหรือไม่ — false = เอกสารรายรับใบใหม่ไม่คิด VAT และออกใบกำกับภาษี (IVT) ไม่ได้ · ใบเก่าคงตามเดิม (036)';
