-- =====================================================================
-- DriveGoLight! Web — migration 030 · ชุดอะไหล่ซ่อมบำรุงมีราคา A/B/C ตามระดับราคาที่เลือกในเอกสาร (ผู้ใช้กำหนด)
-- price เดิม = ราคา A · B/C ตั้งต้นเท่ากับ A
-- =====================================================================
alter table kits add column price_b numeric(14,2) not null default 0;
alter table kits add column price_c numeric(14,2) not null default 0;
update kits set price_b = price, price_c = price;
