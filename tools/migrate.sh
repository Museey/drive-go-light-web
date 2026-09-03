#!/usr/bin/env bash
#
# รันไฟล์ไมเกรชันที่ยังไม่เคยรัน แล้วจดไว้ว่ารันอะไรไปแล้ว
#
#   tools/migrate.sh --fresh                  ติดตั้งใหม่ — ฐานข้อมูลยังว่างเปล่า
#   tools/migrate.sh                          อัปเกรดฐานเดิม — รันเฉพาะที่ค้าง
#   tools/migrate.sh --dry-run                บอกว่าจะรันอะไรบ้าง แต่ไม่รัน
#   tools/migrate.sh --mark-only              จดว่ารันแล้วโดยไม่รันจริง
#   tools/migrate.sh --status                 ดูว่ารันอะไรไปแล้วบ้าง
#
# **ติดตั้งใหม่กับอัปเกรดใช้คนละคำสั่ง** เพราะ 001_init.sql เก็บสคีมาปัจจุบันไว้ครบ
# ไฟล์ 003 เป็นต้นไปจึงเป็น "ทางเดินจากของเก่ามาหาปัจจุบัน" ไม่ใช่ของที่ต้องรันซ้ำ
# ฐานใหม่ที่รัน 001 แล้วไปรัน 007 ต่อจะพังทันที เพราะ 007 สั่งลบคอลัมน์ที่ 001 ไม่มีแล้ว
# --fresh จึงรันเฉพาะไฟล์ฐาน แล้วจดที่เหลือว่ารันแล้ว
#
# ตัวแปร — ADMIN_URL (จำเป็น) · DIR (ค่าตั้งต้น db) · PSQL (ค่าตั้งต้น psql)
#
# PSQL มีไว้ให้ชี้ไปที่ psql ที่อยู่คนละที่ได้ เช่นตอนพัฒนาที่ฐานอยู่ใน Docker
#   PSQL="docker exec -i dgl_pg psql" tools/migrate.sh
#
# ทำไมต้องมี checksum: ไฟล์ที่ขึ้นเครื่องจริงไปแล้วห้ามแก้ ถ้าแก้แปลว่าโค้ดกับ
# ฐานข้อมูลไม่ตรงกันโดยไม่มีใครรู้ — สคริปต์นี้หยุดทันทีเมื่อเจอ
set -euo pipefail

cd "$(dirname "$0")/.."

DIR="${DIR:-db}"
MODE=run
for arg in "$@"; do
  case "$arg" in
    --fresh)     MODE=fresh ;;
    --dry-run)   MODE=dry ;;
    --mark-only) MODE=mark ;;
    --status)    MODE=status ;;
    *) echo "ไม่รู้จักตัวเลือก $arg" >&2; exit 2 ;;
  esac
done

PSQL_BIN="${PSQL:-psql}"

if [ -z "${ADMIN_URL:-}" ]; then
  echo "ต้องตั้ง ADMIN_URL ก่อน เช่น" >&2
  echo "  ADMIN_URL=postgresql://postgres@127.0.0.1/dgl tools/migrate.sh" >&2
  exit 2
fi

psql() { $PSQL_BIN "$ADMIN_URL" -v ON_ERROR_STOP=1 -q "$@"; }
sum() { shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1 || sha256sum "$1" | cut -d' ' -f1; }

# ไฟล์ไมเกรชันคือไฟล์ที่ขึ้นต้นด้วยตัวเลขเท่านั้น — app-role.sql ไม่ใช่ไมเกรชัน
# เพราะต้องรันซ้ำทุกครั้งหลังกู้ฐานข้อมูล ไม่ใช่รันครั้งเดียว
files() { ls "$DIR"/[0-9]*.sql 2>/dev/null | sort; }

# ตาราง ops.migrations อยู่ใน 008 ซึ่งเป็นไมเกรชันเอง — ไก่กับไข่
# แก้ด้วยการสร้างตารางเปล่าให้ก่อนถ้ายังไม่มี ส่วน 008 ใช้ if not exists อยู่แล้ว
psql -c "
  set client_min_messages = warning;
  create schema if not exists ops;
  create table if not exists ops.migrations (
    filename text primary key, checksum text not null,
    ran_at timestamptz not null default now(),
    ran_by text not null default current_user);" > /dev/null

if [ "$MODE" = status ]; then
  echo "รันไปแล้ว:"
  psql -c "select filename, left(checksum, 12) as checksum, ran_at::timestamp(0), ran_by
           from ops.migrations order by filename;"
  echo
  echo "ยังไม่ได้รัน:"
  for f in $(files); do
    n=$(basename "$f")
    got=$(psql -At -c "select 1 from ops.migrations where filename = '$n'")
    [ -z "$got" ] && echo "  $n"
  done
  exit 0
fi

# ไฟล์ที่ต้องรันจริงตอนติดตั้งใหม่ — ที่เหลือรวมอยู่ใน 001 แล้ว จึงแค่จดว่ารันแล้ว
# เพิ่มไฟล์ใหม่ที่สร้างของที่ 001 ไม่มี (เช่น 008) เข้ามาในรายการนี้ด้วย
FRESH_FILES="001_init.sql 002_auth.sql 008_ops.sql"

is_fresh_file() {
  case " $FRESH_FILES " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

if [ "$MODE" = fresh ]; then
  existing=$(psql -At -c "select count(*) from information_schema.tables
                          where table_schema = 'public' and table_name = 'tenants'")
  if [ "$existing" != "0" ]; then
    echo "!! ฐานข้อมูลนี้มีตารางอยู่แล้ว — --fresh ใช้กับฐานว่างเท่านั้น" >&2
    echo "   ถ้าตั้งใจจะอัปเกรดของเดิม ให้รัน tools/migrate.sh เฉย ๆ" >&2
    exit 1
  fi
fi

pending=0
changed=0

for f in $(files); do
  n=$(basename "$f")
  c=$(sum "$f")
  old=$(psql -At -c "select checksum from ops.migrations where filename = '$n'")

  if [ -n "$old" ]; then
    if [ "$old" != "$c" ]; then
      echo "!! $n รันไปแล้วแต่เนื้อหาเปลี่ยน" >&2
      echo "   ตอนรัน  $old" >&2
      echo "   ตอนนี้  $c" >&2
      changed=1
    fi
    continue
  fi

  pending=$((pending + 1))

  case "$MODE" in
    dry)  echo "จะรัน  $n" ;;
    mark) psql -c "insert into ops.migrations (filename, checksum) values ('$n', '$c')" > /dev/null
          echo "จดว่ารันแล้ว  $n" ;;
    fresh)
          if is_fresh_file "$n"; then
            echo "รัน  $n"
            psql -f - < "$f"
          else
            echo "ข้าม (รวมอยู่ใน 001 แล้ว)  $n"
          fi
          psql -c "insert into ops.migrations (filename, checksum) values ('$n', '$c')" > /dev/null ;;
    run)  echo "รัน  $n"
          # ไฟล์เดียวหนึ่งทรานแซกชันไม่ได้ — alter type ... add value ห้ามอยู่ในทรานแซกชัน
          # เดียวกับที่ใช้ค่าใหม่ psql จึง commit ทีละคำสั่งให้ ซึ่งเป็นสิ่งที่เราต้องการ
          psql -f - < "$f"
          psql -c "insert into ops.migrations (filename, checksum) values ('$n', '$c')" > /dev/null ;;
  esac
done

if [ "$changed" = 1 ]; then
  echo >&2
  echo "หยุดเพราะมีไฟล์ที่รันไปแล้วถูกแก้เนื้อหา" >&2
  echo "ไฟล์ไมเกรชันที่ขึ้นเครื่องจริงแล้วห้ามแก้ — ให้เขียนไฟล์ใหม่ต่อท้ายแทน" >&2
  exit 1
fi

if [ "$pending" = 0 ]; then
  echo "ไม่มีไมเกรชันค้าง — ฐานข้อมูลตรงกับโค้ดแล้ว"
else
  case "$MODE" in
    dry)   echo "ค้างอยู่ $pending ไฟล์ (ยังไม่ได้รัน เพราะสั่ง --dry-run)" ;;
    mark)  echo "จดไปแล้ว $pending ไฟล์" ;;
    run)   echo "รันเสร็จ $pending ไฟล์" ;;
    fresh) echo "ติดตั้งใหม่เสร็จ — จดไว้ $pending ไฟล์" ;;
  esac
fi
