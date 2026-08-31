#!/usr/bin/env bash
#
# กู้ฐานข้อมูลจากไฟล์สำรอง
#
#   tools/restore-db.sh backups/dgl-20260831-030000.dump postgresql://postgres:x@localhost:5433/dgl_drill
#
# ปลายทางต้องเป็นฐานข้อมูลที่มีอยู่แล้วและว่างพอจะทับได้ สคริปต์จะล้าง schema ให้ก่อนกู้
# ค่าเริ่มต้นปฏิเสธการกู้ทับฐานข้อมูลที่ชื่อ dgl เฉย ๆ กันมือลั่นทับของจริง ให้ใส่ --force ถ้าตั้งใจ
set -euo pipefail

dump="${1:?ใส่ชื่อไฟล์สำรองด้วย}"
target="${2:?ใส่ DATABASE_URL ปลายทางด้วย}"
force="${3:-}"

PSQL="${PSQL:-psql}"
PGRESTORE="${PGRESTORE:-pg_restore}"

[ -f "$dump" ] || { echo "ไม่พบไฟล์ $dump" >&2; exit 1; }

case "$target" in
  */dgl|*/dgl\?*)
    if [ "$force" != "--force" ]; then
      echo "ปลายทางชื่อ dgl ซึ่งน่าจะเป็นของจริง ถ้าตั้งใจกู้ทับให้ใส่ --force ต่อท้าย" >&2
      exit 1
    fi ;;
esac

# เทียบลายนิ้วมือก่อนถ้ามีไฟล์ .sha256 คู่กันมา
if [ -f "$dump.sha256" ]; then
  echo "ตรวจลายนิ้วมือไฟล์…"
  if command -v shasum > /dev/null; then (cd "$(dirname "$dump")" && shasum -a 256 -c "$(basename "$dump").sha256")
  else (cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256"); fi
fi

echo "ล้าง schema เดิมที่ปลายทาง…"
$PSQL "$target" -v ON_ERROR_STOP=1 -q -c \
  'drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;'

echo "กู้ข้อมูล…"
# --no-owner เพื่อให้กู้ลงเครื่องที่ยังไม่มี role เดิมได้ ส่วน role จริงตั้งด้วย db/app-role.sql ทีหลัง
$PGRESTORE --dbname "$target" --no-owner --no-privileges --exit-on-error < "$dump"

echo "ตรวจผลหลังกู้…"
$PSQL "$target" -v ON_ERROR_STOP=1 -q -c "
  select
    (select count(*) from tenants)   as tenants,
    (select count(*) from users)     as users,
    (select count(*) from documents) as documents,
    (select count(*) from doc_items) as doc_items,
    (select coalesce(sum(grand_total),0) from documents where direction='sell') as sell_total;
"

# แถวที่กู้มาแล้วแต่ไม่ได้เปิดการแยกข้อมูลกลับมาด้วย คืออันตรายที่สุดหลังกู้ระบบ
echo "ตรวจว่าการแยกข้อมูลรายอู่ยังเปิดอยู่ทุกตาราง…"
$PSQL "$target" -v ON_ERROR_STOP=1 -t -c "
  do \$\$
  declare bad text;
  begin
    select string_agg(c.relname, ', ') into bad
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=c.relname
                      and column_name='tenant_id')
       and not (c.relrowsecurity and c.relforcerowsecurity);
    if bad is not null then
      raise exception 'ตารางเหล่านี้ยังไม่ได้เปิด row level security หลังกู้: %', bad;
    end if;
  end \$\$;
"

echo "กู้เรียบร้อย อย่าลืมสร้าง role ของแอปด้วย db/app-role.sql ถ้าเป็นเครื่องใหม่"
