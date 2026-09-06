#!/usr/bin/env bash
#
# ตัวห่อบาง ๆ ของ tools/migrate.mjs — มีไว้ให้คำสั่งใน DEPLOY.md ไม่ต้องเปลี่ยน
# ตัวจริงเป็น Node เพราะอิมเมจของแพลตฟอร์มที่รัน Node ส่วนใหญ่ไม่มี psql
#
#   tools/migrate.sh --fresh | --dry-run | --mark-only | --status
set -euo pipefail
exec node "$(dirname "$0")/migrate.mjs" "$@"
