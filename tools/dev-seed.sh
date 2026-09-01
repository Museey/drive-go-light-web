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

echo "ล้างและสร้าง schema ใหม่…"
psql -c 'drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;' > /dev/null
psql < db/001_init.sql > /dev/null
psql < db/002_auth.sql > /dev/null
sed "s/เปลี่ยนรหัสนี้ก่อนใช้จริง/$PASS/" db/app-role.sql | psql > /dev/null

echo "นำเข้าข้อมูลตัวอย่าง…"
DATABASE_URL="postgresql://dgl_app:$PASS@localhost:5433/$DB" \
  node packages/importer/dist/cli.js fixtures/demo-backup.json \
  --owner-email=owner@example.com 2>&1 | grep -E "tenant_id|http://" || true

echo
echo "เจ้าของอู่ยังไม่มีรหัสผ่าน — เปิดลิงก์ตั้งรหัสผ่านด้านบนเพื่อเข้าใช้งาน"
