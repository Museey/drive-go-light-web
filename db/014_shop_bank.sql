-- =====================================================================
-- DriveGoLight! Web — migration 014 · บัญชีธนาคารของอู่
--
-- **อาการที่เจอ** — อู่ออกใบเสร็จแล้วลูกค้าไม่รู้ว่าจะโอนเงินไปที่ไหน
--
-- รุ่น 6.4 เก็บ bankName / bankAcc / bankHolder ไว้ในข้อมูลร้าน แล้วพิมพ์ลงบน
-- ใบเสร็จ ใบวางบิล และแบบฟอร์มเปล่าด้วยฟังก์ชัน bankLine() ของเราไม่มีเลย
-- ทั้งคอลัมน์ ช่องกรอก และบรรทัดบนกระดาษ
--
-- **ไม่มี CHECK บังคับรูปแบบเลขบัญชี** — แต่ละธนาคารเขียนไม่เหมือนกัน
-- (บางที่มีขีด บางที่ไม่มี ความยาวก็ต่างกัน) การบังคับรูปแบบผิด ๆ
-- จะทำให้อู่กรอกเลขบัญชีจริงของตัวเองไม่ได้ ซึ่งแย่กว่าปล่อยให้พิมพ์อิสระ
--
-- ว่างได้ทั้งสามช่อง อู่ที่ยังไม่กรอกจะได้เส้นว่างบนกระดาษให้เขียนด้วยมือ
-- =====================================================================

set local lock_timeout = '5s';

alter table tenants add column if not exists bank_name         text not null default '';
alter table tenants add column if not exists bank_account_no   text not null default '';
alter table tenants add column if not exists bank_account_name text not null default '';

comment on column tenants.bank_name         is 'ชื่อธนาคาร เช่น กสิกรไทย — ว่างได้';
comment on column tenants.bank_account_no   is 'เลขที่บัญชี พิมพ์อิสระ ไม่บังคับรูปแบบ';
comment on column tenants.bank_account_name is 'ชื่อบัญชี — ว่างได้';
