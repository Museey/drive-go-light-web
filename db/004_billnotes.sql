-- =====================================================================
-- DriveGoLight! Web — migration 004 · ใบวางบิล
--
-- ใช้กับฐานข้อมูลที่สร้างไว้ก่อนหน้านี้เท่านั้น
-- การติดตั้งใหม่ได้ทุกอย่างจาก 001_init.sql อยู่แล้ว ไม่ต้องรันไฟล์นี้
--
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/004_billnotes.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- ใบวางบิล — DB.billnotes ของรุ่น 6.4
--
-- ลูกค้าองค์กรไม่จ่ายทีละใบ อู่รวมใบที่ค้างทั้งเดือนเป็นใบเดียวส่งไปแผนกการเงิน
--
-- แยกจาก documents โดยตั้งใจ เพราะใบวางบิล "ไม่ตั้งลูกหนี้ซ้ำและไม่นับรายได้"
-- (คำพูดของรุ่น 6.4 เอง) ยอดของมันคือผลรวมยอดค้างของใบอื่น ณ เวลาที่ถาม ไม่ใช่ยอดของตัวเอง
-- ถ้าใส่เข้า documents ต้องเขียน "and kind <> 'BN'" เพิ่มในทุกคิวรีที่นับเงิน
-- ลืมที่เดียวคือรายได้ซ้ำสองเท่า — แยกตารางแล้วลืมไม่ได้เลยโดยโครงสร้าง
-- ---------------------------------------------------------------------
create table billnotes (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  no              text        not null,                    -- BN-YYYYMM-NNN
  bill_date       date        not null default current_date,
  due_date        date,                                    -- วันนัดรับเงิน
  -- snapshot คู่ค้า ณ วันวางบิล เหมือนเอกสารอื่น
  party_id        uuid        references contacts(id) on delete set null,
  party_name      text        not null default '',
  party_tax_id    text        not null default '',
  party_addr_text text        not null default '',
  by_whom         text        not null default '',         -- ผู้นำเอกสารไปวางบิล
  note            text        not null default '',
  -- ยอด ณ วันที่บันทึก ไว้เทียบย้อนหลังว่าตอนวางบิลแจ้งไปเท่าไร
  -- หน้าจอและใบที่พิมพ์ใหม่ใช้ยอดสดที่คำนวณจากยอดค้างปัจจุบัน
  total_snapshot  numeric(14,2) not null default 0,
  status          doc_status  not null default 'issued',
  voided_at       timestamptz,
  voided_reason   text,
  created_by      uuid        references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, no),
  constraint billnote_void_stamp check (
    (status = 'void') = (voided_at is not null))
);

create index on billnotes (tenant_id, bill_date desc);

-- ใบแจ้งหนี้ที่รวมอยู่ในใบวางบิลใบหนึ่ง
--
-- voided เก็บซ้ำจาก billnotes.status เพราะ partial index อ้างตารางอื่นไม่ได้
-- ยอมเก็บซ้ำเพื่อให้ฐานข้อมูลบังคับ "ใบเดียวอยู่ในใบวางบิลที่ยังไม่ยกเลิกได้ครั้งเดียว" ได้เอง
-- การวางบิลซ้ำคือการทวงเงินก้อนเดียวสองรอบ ซึ่งเสียความน่าเชื่อถือกับลูกค้าองค์กร
create table billnote_docs (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  billnote_id     uuid        not null references billnotes(id) on delete cascade,
  doc_id          uuid        not null references documents(id) on delete restrict,
  voided          boolean     not null default false,
  primary key (billnote_id, doc_id)
);

create unique index billnote_doc_once on billnote_docs (tenant_id, doc_id)
  where not voided;
create index on billnote_docs (tenant_id, doc_id);

-- เลขที่ใบวางบิลนับแยกจาก doc_sequences เพราะ BN ไม่ได้อยู่ใน doc_kind
-- (ตั้งใจไม่ใส่ ไม่งั้นทุกที่ที่แยกตามชนิดเอกสารต้องคิดถึง BN ทั้งที่ไม่เกี่ยว)
create table billnote_sequences (
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  period          text        not null default '',
  last_no         integer     not null default 0,
  primary key (tenant_id, period)
);

create or replace function next_billnote_no(p_tenant uuid, p_period text default '')
returns integer language plpgsql as $$
declare v_next integer;
begin
  insert into billnote_sequences (tenant_id, period, last_no)
  values (p_tenant, p_period, 1)
  on conflict (tenant_id, period)
    do update set last_no = billnote_sequences.last_no + 1
  returning last_no into v_next;
  return v_next;
end;
$$;

-- เปิดการแยกข้อมูลรายอู่ให้ตารางใหม่ทั้งสาม
-- ลืมข้อนี้แล้วอู่หนึ่งจะเห็นใบวางบิลของอีกอู่ — เทสต์ tenant-isolation จับได้เอง
do $$
declare t text;
begin
  foreach t in array array['billnotes','billnote_docs','billnote_sequences']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolation on %I
       using (tenant_id = current_tenant_id())
       with check (tenant_id = current_tenant_id())', t);
  end loop;
end;
$$;

grant select, insert, update, delete on billnotes, billnote_docs, billnote_sequences to dgl_app;
grant execute on function next_billnote_no(uuid, text) to dgl_app;
