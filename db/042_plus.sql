-- =====================================================================
-- 042 — DriveGo Light Plus (24 พ.ย. 2569)
--
-- ผู้ใช้ขอ: เพิ่มฟีเจอร์เป็นแพ็กเกจ "Light Plus" ในระบบเดียวกับ Light แยกตามแพ็กเกจ
--   1. เงินเดือนและพนักงาน      employees · payroll_runs · payroll_items
--   2. นัดหมายและแจ้งเตือนลูกค้า  appointments
--   3. เอกสารภาษี               ไม่มีตารางใหม่ — อ่านจาก documents กับ payroll_items
--
-- **แพ็กเกจไม่มีคอลัมน์ใหม่** — ใช้ subscriptions.plan ที่มีอยู่แล้ว
-- แถวล่าสุดขึ้นต้นด้วย 'plus' = Light Plus (เช่น 'plus-yearly') คอนโซลผู้ให้บริการ
-- เลือกแพ็กเกจตอนบันทึกการต่ออายุ (ops.record_renewal รับ p_plan อยู่แล้ว)
-- ตัวตัดสินอยู่ที่ apps/web/src/lib/plan-core.ts ที่เดียว
--
-- ตารางทั้งสี่มีคู่อยู่ใน 001_init.sql แล้ว (migrations.test.ts เทียบสองทาง)
-- =====================================================================

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- ทะเบียนพนักงาน — คนที่อู่จ่ายเงินเดือนให้ คนละเรื่องกับ users (บัญชีเข้าระบบ)
-- ช่างส่วนใหญ่ไม่มีบัญชีเข้าระบบ และผู้ใช้ระบบบางคนก็ไม่ได้รับเงินเดือนจากอู่
-- ---------------------------------------------------------------------
create table employees (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  code            text        not null,                    -- EMP-001
  name            text        not null,
  position        text        not null default '',
  emp_type        text        not null default 'full'
                  constraint employees_type_known check (emp_type in ('full', 'probation', 'temp')),
  tax_id          text,                                    -- เลขประจำตัวผู้เสียภาษี 13 หลัก (ใช้บน ภ.ง.ด.1 / 50 ทวิ)
  addr_text       text        not null default '',
  tel             text        not null default '',
  base_salary     numeric(14,2) not null default 0
                  constraint employees_salary_sane check (base_salary >= 0),
  sso_enabled     boolean     not null default true,       -- หักประกันสังคมหรือไม่
  wht_rate        numeric(6,3) not null default 0          -- % หักภาษี ณ ที่จ่ายของเงินเดือน
                  constraint employees_wht_sane check (wht_rate >= 0 and wht_rate <= 100),
  bank_name       text        not null default '',
  bank_account_no text        not null default '',
  started_on      date,
  active          boolean     not null default true,
  note            text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, code),
  constraint employees_tax_id_digits check (tax_id is null or tax_id ~ '^[0-9]{13}$')
);

comment on table employees is
  'ทะเบียนพนักงานของอู่ (Light Plus · 042) — ไม่ลบ มีแต่ปิดใช้งาน เพราะงวดเงินเดือนเก่าอ้างถึง';

-- ---------------------------------------------------------------------
-- งวดเงินเดือน — เดือนละหนึ่งงวดต่ออู่
-- เพดานประกันสังคมคิดต่อเดือน ถ้าเดือนเดียวมีหลายงวดต้องรวมฐานข้ามงวด ซึ่งยังไม่ได้ทำ
-- ---------------------------------------------------------------------
create table payroll_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  period          text        not null                     -- 'YYYY-MM' ค.ศ.
                  constraint payroll_runs_period_format check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  pay_date        date        not null,
  note            text        not null default '',
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, period)
);

comment on table payroll_runs is
  'งวดเงินเดือน เดือนละหนึ่งงวดต่ออู่ (Light Plus · 042)';

-- บรรทัดของงวด — ชื่อ ตำแหน่ง เลขผู้เสียภาษี ตรึงไว้ ณ วันจ่าย
-- สลิปและ ภ.ง.ด.1 ของงวดเก่าต้องไม่เปลี่ยนตามทะเบียนพนักงานที่แก้ทีหลัง
create table payroll_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  run_id          uuid        not null references payroll_runs(id) on delete cascade,
  employee_id     uuid        not null references employees(id) on delete restrict,
  line_no         integer     not null,
  name            text        not null,
  position        text        not null default '',
  tax_id          text        not null default '',
  base            numeric(14,2) not null default 0 constraint payroll_items_base_sane check (base >= 0),
  overtime        numeric(14,2) not null default 0 constraint payroll_items_ot_sane check (overtime >= 0),
  other_income    numeric(14,2) not null default 0 constraint payroll_items_income_sane check (other_income >= 0),
  sso             numeric(14,2) not null default 0 constraint payroll_items_sso_sane check (sso >= 0),
  wht             numeric(14,2) not null default 0 constraint payroll_items_wht_sane check (wht >= 0),
  other_deduct    numeric(14,2) not null default 0 constraint payroll_items_deduct_sane check (other_deduct >= 0),
  net             numeric(14,2) generated always as
                    (base + overtime + other_income - sso - wht - other_deduct) stored,
  note            text        not null default '',
  unique (run_id, employee_id),
  unique (run_id, line_no)
);

create index on payroll_items (tenant_id, employee_id);

comment on column payroll_items.net is
  'เงินได้รวม − ประกันสังคม − ภาษีหัก ณ ที่จ่าย − หักอื่น · ฐานข้อมูลคิดเอง ไม่เชื่อค่าที่หน้าเว็บส่งมา';

-- ---------------------------------------------------------------------
-- นัดหมายและแจ้งเตือนลูกค้า
--
-- ชื่อ เบอร์ ทะเบียน ตรึงเป็นข้อความไว้ในแถว และคีย์นอกเป็น on delete set null
-- การกู้คืนไฟล์สำรองลบลูกค้าและรถทั้งหมดแล้วสร้างใหม่ (restore-core.ts) —
-- นัดที่จดไว้ต้องไม่หายและต้องยังอ่านรู้เรื่องว่านัดใคร
-- ---------------------------------------------------------------------
create table appointments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  kind            text        not null default 'repair'     -- repair = นัดเข้าซ่อม · remind = เตือนลูกค้า (เช็กระยะ ต่อ พ.ร.บ.)
                  constraint appointments_kind_known check (kind in ('repair', 'remind')),
  appt_date       date        not null,
  appt_time       time,                                    -- null = ไม่ระบุเวลา
  contact_id      uuid        references contacts(id) on delete set null,
  vehicle_id      uuid        references vehicles(id) on delete set null,
  party_name      text        not null default '',
  tel             text        not null default '',
  plate           text        not null default '',
  title           text        not null,
  note            text        not null default '',
  status          text        not null default 'open'
                  constraint appointments_status_known check (status in ('open', 'done', 'cancelled')),
  notified_at     timestamptz,                             -- กดว่าแจ้งลูกค้าแล้วเมื่อไร
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on appointments (tenant_id, appt_date);
create index appointments_open_idx on appointments (tenant_id, appt_date) where status = 'open';

comment on table appointments is
  'นัดเข้าซ่อมและรายการเตือนลูกค้า (Light Plus · 042) — ชื่อ/เบอร์/ทะเบียนตรึงเป็นข้อความ รอดจากการกู้คืนไฟล์สำรอง';

-- updated_at อัตโนมัติ — ฟังก์ชันเดียวกับตารางหลัก (001)
create trigger employees_touch before update on employees
  for each row execute function touch_updated_at();
create trigger payroll_runs_touch before update on payroll_runs
  for each row execute function touch_updated_at();
create trigger appointments_touch before update on appointments
  for each row execute function touch_updated_at();

-- แยกข้อมูลรายอู่ — เปิดและ force ทุกตาราง ไม่มีข้อยกเว้น (tenant-isolation.test.ts ไล่ตรวจ)
alter table employees     enable row level security;  alter table employees     force row level security;
alter table payroll_runs  enable row level security;  alter table payroll_runs  force row level security;
alter table payroll_items enable row level security;  alter table payroll_items force row level security;
alter table appointments  enable row level security;  alter table appointments  force row level security;
create policy tenant_isolation on employees     using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy tenant_isolation on payroll_runs  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy tenant_isolation on payroll_items using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy tenant_isolation on appointments  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'dgl_app') then
    execute 'grant select, insert, update, delete on employees, payroll_runs, payroll_items, appointments to dgl_app';
  end if;
end $grant$;
