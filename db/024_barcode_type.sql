-- =====================================================================
-- DriveGoLight! Web — migration 024 · ระบบบาร์โค้ดของสินค้า (UPC-A / EAN-13 / EAN-8 / Code 39 / Code 128)
-- เก็บว่าเลขบาร์โค้ดของสินค้าเป็นระบบไหน เพื่อพิมพ์ฉลากให้ถูกแบบ — ของเดิมที่ไม่ระบุ = Code 39 ตามฉลากรุ่นเดิม
-- =====================================================================
alter table products add column barcode_type text not null default 'CODE39'
  check (barcode_type in ('EAN13', 'EAN8', 'UPCA', 'CODE39', 'CODE128'));
