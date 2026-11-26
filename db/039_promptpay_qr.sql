-- 039 — คิวอาร์รับเงิน (พร้อมเพย์) บนเอกสาร (24 พ.ย. 2569)
--
-- ผู้ใช้ขอ: ให้เอกสารใบส่งมอบ/ใบแจ้งหนี้ และใบเสร็จรับเงิน มีคิวอาร์ให้ลูกค้าสแกนจ่ายได้
-- เปิดปิดที่ 07.1 ตั้งค่าร้าน · เดิมเอกสารพิมพ์ได้แค่เลขบัญชีธนาคาร ลูกค้าต้องพิมพ์เลขและยอดเอง
--
-- เก็บแค่ **เลขพร้อมเพย์** กับสวิตช์สองตัว — รูปคิวอาร์สร้างตอนเปิดหน้าพิมพ์จากยอดค้างของใบนั้น
-- จึงไม่มีรูปค้างในฐาน และยอดในคิวอาร์ตรงกับยอดค้าง ณ ตอนพิมพ์เสมอ
-- สูตรของข้อความในคิวอาร์อยู่ที่ packages/core/src/promptpay.ts
--
-- ค่าตั้งต้นปิดทั้งคู่ — อู่ที่มีอยู่แล้วเอกสารหน้าตาเหมือนเดิมจนกว่าจะเปิดใช้เอง
alter table tenants add column if not exists promptpay_id   text    not null default '';
alter table tenants add column if not exists qr_on_invoice  boolean not null default false;
alter table tenants add column if not exists qr_on_receipt  boolean not null default false;

comment on column tenants.promptpay_id is
  'เลขพร้อมเพย์ของอู่ — เบอร์มือถือ 10 หลัก เลขประจำตัวผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก · ว่าง = ไม่มีคิวอาร์ (039)';
comment on column tenants.qr_on_invoice is
  'พิมพ์คิวอาร์รับเงินบนใบส่งมอบ/ใบแจ้งหนี้/ใบกำกับภาษี (IV, IVT) (039)';
comment on column tenants.qr_on_receipt is
  'พิมพ์คิวอาร์รับเงินบนใบเสร็จรับเงิน (RC) เมื่อยังมียอดค้าง (039)';
