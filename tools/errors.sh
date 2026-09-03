#!/usr/bin/env bash
#
# ดูข้อผิดพลาดที่ระบบบันทึกไว้
#
#   tools/errors.sh          20 รายการล่าสุด
#   tools/errors.sh 100      100 รายการล่าสุด
#
# ตัวแปร — ADMIN_URL (จำเป็น) · PSQL (ค่าตั้งต้น psql)
set -euo pipefail
cd "$(dirname "$0")/.."

N="${1:-20}"
PSQL_BIN="${PSQL:-psql}"

if [ -z "${ADMIN_URL:-}" ]; then
  echo "ต้องตั้ง ADMIN_URL ก่อน" >&2
  exit 2
fi

$PSQL_BIN "$ADMIN_URL" -P pager=off -c "
  select to_char(at, 'DD/MM HH24:MI') as เวลา,
         kind as ชนิด,
         coalesce(path, '-') as หน้า,
         left(message, 90) as ข้อความ
  from ops.errors
  order by at desc
  limit $N;"

$PSQL_BIN "$ADMIN_URL" -At -c "
  select 'ยังไม่ได้อ่าน ' || count(*) filter (where not seen) ||
         ' จากทั้งหมด ' || count(*) || ' รายการ'
  from ops.errors;"
