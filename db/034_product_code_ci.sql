-- 034 — รหัสสินค้าห้ามซ้ำแบบไม่สนตัวพิมพ์ใหญ่เล็ก (21 ก.ย. 2569)
-- เทสต์ apps/web/test/product-code-ci-db.test.ts
--
-- ผู้ใช้สั่ง: BRK-101 กับ brk-101 ต้องถือเป็นรหัสเดียวกัน
--
-- เดิมฐานบังคับแค่ unique (tenant_id, code) ซึ่งนับสองตัวนี้เป็นคนละรหัส แต่การยิงบาร์โค้ด
-- และการค้นด้วยรหัสเทียบแบบไม่สนตัวพิมพ์ (apps/web/src/lib/scan.ts) พอมีทั้งคู่ ระบบหยิบตัวไหน
-- ก็ได้ตัวเดียวแล้วไปต่อเงียบ ๆ — ของผิดตัวเข้าบิลหรือใบตรวจนับ แล้วสต๊อกตัดผิดตัวตาม
--
-- เก็บ unique เดิมไว้ด้วย ไม่ได้ลบ — ของใหม่ครอบของเดิมอยู่แล้ว ลบไปก็ไม่ได้อะไรเพิ่ม
-- แต่เสี่ยงให้ที่อื่นที่อ้างชื่อ constraint เดิมพังแบบไม่มีใครเห็น

-- ---------------------------------------------------------------------
-- ตรวจก่อนว่ามีอู่ไหนมีคู่ที่ต่างกันแค่ตัวพิมพ์อยู่แล้วหรือไม่
--
-- ถ้ามีแล้วปล่อยให้สร้าง index เลย Postgres ก็ล้มอยู่ดี แต่บอกแค่รหัสอู่เป็น uuid
-- ที่นี่บอกชื่ออู่และรหัสทุกคู่ คนที่ดู log ของ deploy รู้ทันทีว่าต้องไปแก้ที่ไหน
--
-- **ไล่ทีละอู่ ตั้ง app.tenant_id แล้วใส่เงื่อนไข tenant_id เอง** — products บังคับ RLS
-- กับเจ้าของตารางด้วย (force) อ่านรวดเดียวโดยไม่ตั้งอู่จะได้ 0 แถวเสมอ แล้วผ่านทั้งที่มีคู่ซ้ำ
-- ห้ามแก้ด้วยการปิด force แม้ชั่วคราว (DEPLOY.md หัวข้อ ง.) · วิธีเดียวกับ tools/db-census
-- ---------------------------------------------------------------------
do $$
declare
  t     record;
  pairs text;
  found text := '';
begin
  for t in select id, name from tenants order by name loop
    perform set_config('app.tenant_id', t.id::text, true);
    /* เรียงแบบ C — ลำดับในข้อความต้องเหมือนกันทุกเครื่อง ไม่ขึ้นกับ collation ที่ติดตั้ง */
    select string_agg(g.codes, ' · ' order by g.codes) into pairs
      from (select string_agg(code, ' / ' order by code collate "C") as codes
              from products
             where tenant_id = t.id
             group by upper(code)
            having count(*) > 1) g;
    if pairs is not null then
      found := found || format(E'\n  %s: %s', t.name, pairs);
    end if;
  end loop;
  perform set_config('app.tenant_id', '', true);

  /* รายชื่อต้องอยู่ใน message ไม่ใช่ detail — ตัวรันไมเกรชันพิมพ์แค่ message ลง log ของ deploy */
  if found <> '' then
    raise exception using message =
      'มีรหัสสินค้าที่ต่างกันแค่ตัวพิมพ์ใหญ่เล็กอยู่แล้ว — ให้อู่เปลี่ยนรหัสตัวใดตัวหนึ่งก่อน แล้วค่อย deploy ใหม่'
      || E'\nคู่ที่ชนกัน:' || found;
  end if;
end;
$$;

create unique index if not exists products_code_ci_uidx on products (tenant_id, upper(code));
