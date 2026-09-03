#!/usr/bin/env bash
#
# ตั้งฐานข้อมูลสำหรับเล่นในเครื่องใหม่ทั้งชุด
#
# ชุดทดสอบที่แตะฐานข้อมูลล้าง schema ทิ้งทุกครั้งที่รัน ข้อมูลที่เปิดดูอยู่จึงหายไปด้วย
# สคริปต์นี้เรียกใช้หลังรันเทสต์เพื่อเอาข้อมูลตัวอย่างกลับมา
#
#   tools/dev-seed.sh
#
# ตัวแปรที่ปรับได้ — PG_CONTAINER (ค่าตั้งต้น dgl_pg) · PG_DB (dgl) · APP_PASS (apppass)
set -euo pipefail

cd "$(dirname "$0")/.."

C="${PG_CONTAINER:-dgl_pg}"
DB="${PG_DB:-dgl}"
PASS="${APP_PASS:-apppass}"
psql() { docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }

# ตัวนำเข้าใช้ไวยากรณ์ที่ Node เก่าอ่านไม่ออก แล้วพังด้วย SyntaxError ที่ไม่บอกสาเหตุ
# เช็คก่อนดีกว่าปล่อยให้ไปตายตอนนำเข้าแล้วเหลือฐานข้อมูลว่างไว้
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ต้องใช้ Node 20 ขึ้นไป (ตอนนี้ $(node -v 2>/dev/null || echo 'ไม่พบ node'))" >&2
  echo "ถ้าใช้ nvm ให้สั่ง  nvm use 22  ก่อน แล้วรันใหม่" >&2
  exit 1
fi

echo "ล้างและสร้าง schema ใหม่…"
psql -c 'drop schema if exists auth cascade; drop schema if exists ops cascade; drop schema if exists public cascade; create schema public;' > /dev/null

# ใช้ตัวรันไมเกรชันตัวเดียวกับเครื่องจริง ไม่ใช่ psql ตรง ๆ
# ไม่งั้นเครื่องพัฒนาจะไม่มีตาราง ops.migrations แล้ว /healthz จะแดงตลอด
# และเราจะไม่มีวันเจอปัญหาของตัวรันจนกว่าจะไปเจอบนเครื่องจริง
PSQL="docker exec -i $C psql -U postgres" ADMIN_URL="$DB" ./tools/migrate.sh --fresh > /dev/null
sed "s/เปลี่ยนรหัสนี้ก่อนใช้จริง/$PASS/" db/app-role.sql | psql > /dev/null

echo "นำเข้าข้อมูลตัวอย่าง…"

# เก็บผลไว้ก่อนแล้วค่อยกรอง — เดิมต่อท่อเข้า grep ตรง ๆ แล้วปิดท้ายด้วย || true
# ซึ่งกลืนความล้มเหลวของตัวนำเข้าไปเงียบ ๆ แล้วเหลือฐานข้อมูลว่างเปล่าไว้ให้งง
out=$(DATABASE_URL="postgresql://dgl_app:$PASS@localhost:5433/$DB" \
  node packages/importer/dist/cli.js fixtures/demo-backup.json \
  --owner-email=owner@example.com 2>&1) || {
    echo "$out" >&2
    echo >&2
    echo "นำเข้าข้อมูลตัวอย่างไม่สำเร็จ — ดูข้อความข้างบน" >&2
    exit 1
  }
echo "$out" | grep -E "tenant_id|http://" 

echo
echo "เจ้าของอู่ยังไม่มีรหัสผ่าน — เปิดลิงก์ตั้งรหัสผ่านด้านบนเพื่อเข้าใช้งาน"
