#!/usr/bin/env bash
#
# สำรองฐานข้อมูลทั้งเครื่อง (pg_dump)
#
# ต่างจากไฟล์สำรองในเมนู 07 ตรงที่อันนั้นคือข้อมูลของอู่รายเดียวในรูปแบบของโปรแกรมเดิม
# ส่วนอันนี้คือสำเนาทั้งฐานข้อมูลไว้กู้ระบบเวลาเครื่องพัง
#
# **ใช้ได้เฉพาะเมื่อ DATABASE_URL เป็น role ที่ข้าม row level security ได้**
# (superuser หรือ BYPASSRLS) เช่นเซิร์ฟเวอร์ที่ดูแลเองแล้วต่อด้วย postgres
#
# **ใช้กับฐานข้อมูลบน Render ไม่ได้** — role ที่ Render ให้มาเป็นเจ้าของตารางแต่ไม่ใช่ superuser
# และตารางข้อมูลอู่ทุกตาราง force row level security ซึ่งมีผลกับเจ้าของด้วย
# pg_dump จึงหยุดที่ตารางแรกด้วย "query would be affected by row-level security policy"
#   - ห้ามแก้ด้วย --enable-row-security — ดัมป์ผ่านแต่ตารางข้อมูลอู่ว่างหมด (ไม่มีอู่ตั้งไว้ในการเชื่อมต่อ)
#   - ห้าม alter table ... no force row level security — คือปิดเกราะที่แยกข้อมูลของแต่ละอู่
# บน Render ใช้จุดกู้คืนของ Render คู่กับ tools/db-census.mjs — ดู DEPLOY.md หัวข้อ 0ค.
#
#   DATABASE_URL=postgresql://... tools/backup-db.sh
#
# ตัวแปรที่ปรับได้
#   BACKUP_DIR  ที่เก็บไฟล์            ค่าเริ่มต้น ./backups
#   KEEP_DAYS   เก็บย้อนหลังกี่วัน       ค่าเริ่มต้น 90 (ตรงกับที่เขียนไว้ในนโยบายข้อมูลส่วนบุคคล)
#   PGDUMP      คำสั่ง pg_dump         เช่น "docker exec dgl_pg pg_dump" ตอนทดสอบในเครื่อง
#   PGRESTORE   คำสั่ง pg_restore      ใช้อ่านสารบัญไฟล์ที่เพิ่งสำรองกลับเพื่อตรวจ
#
# ออกด้วยรหัส 0 สำเร็จ · 1 ล้มเหลว · 2 role ข้าม row level security ไม่ได้ (เช่นต่อฐานบน Render)
#
# ตั้งให้รันทุกวันด้วย cron ตี 3 บนเซิร์ฟเวอร์ที่ดูแลเอง เช่น
#   0 3 * * * DATABASE_URL=... /srv/drivegolight/tools/backup-db.sh >> /var/log/dgl-backup.log 2>&1
set -euo pipefail

: "${DATABASE_URL:?ต้องตั้ง DATABASE_URL ก่อน}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-90}"
PGDUMP="${PGDUMP:-pg_dump}"
PGRESTORE="${PGRESTORE:-pg_restore}"

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
out="$BACKUP_DIR/dgl-$stamp.dump"
err="$(mktemp)"

# ล้มกลางทางต้องไม่ทิ้งไฟล์ .part ครึ่ง ๆ ไว้ — เดิม set -e ออกก่อนถึงบรรทัด mv
# ไฟล์ครึ่งเดียวค้างอยู่ในโฟลเดอร์สำรองให้เข้าใจผิดว่ามีสำรอง
trap 'rm -f "$out.part" "$err"' EXIT

echo "[$(date '+%F %T')] เริ่มสำรอง -> $out"

# -Fc คือรูปแบบบีบอัดของ Postgres เอง กู้ทีละตารางได้ และเล็กกว่า .sql มาก
# ไม่ใส่ --no-owner ตรงนี้ เพราะอยากได้สิทธิ์ของ role กลับมาครบตอนกู้ลงเครื่องเดิม
if ! $PGDUMP "$DATABASE_URL" -Fc --clean --if-exists > "$out.part" 2> "$err"; then
  cat "$err" >&2
  if grep -q 'row-level security' "$err"; then
    cat >&2 <<'MSG'

!! สำรองไม่สำเร็จ — role ที่ต่ออยู่ข้าม row level security ไม่ได้
   ตารางข้อมูลอู่ force row level security ไว้ ซึ่งมีผลกับเจ้าของตารางด้วย pg_dump จึงอ่านไม่ได้
   ฐานข้อมูลบน Render เป็นแบบนี้เสมอ — สคริปต์นี้ใช้ได้เฉพาะ role ที่เป็น superuser หรือ BYPASSRLS

   บน Render ให้ทำแทน (DEPLOY.md หัวข้อ 0ค. ข้อ จ.)
     1. Dashboard → ฐานข้อมูล → Recovery ตรวจว่ากู้ย้อนจุดเวลาได้ แล้วจดเวลาไว้
     2. ADMIN_URL=... node tools/db-census.mjs --json > census-ก่อน.json

   อย่าใส่ --enable-row-security (ได้ไฟล์ที่ข้อมูลอู่ว่างหมด)
   และอย่าสั่ง no force row level security (ปิดเกราะแยกข้อมูลของอู่)
MSG
    exit 2
  fi
  echo "!! pg_dump ล้มเหลว — ดูข้อความข้างบน" >&2
  exit 1
fi
# คำเตือนที่ไม่ทำให้ล้ม (เช่นรุ่น pg_dump ต่างจากเซิร์ฟเวอร์) ยังต้องให้เห็น
if [ -s "$err" ]; then cat "$err" >&2; fi
mv "$out.part" "$out"

# อ่านสารบัญกลับทันที ไฟล์ที่เปิดไม่ออกไม่นับว่าสำรองสำเร็จ
if ! $PGRESTORE --list "$out" > /dev/null 2>&1; then
  echo "!! ไฟล์ที่เพิ่งสำรองเปิดไม่ออก ลบทิ้งและถือว่าล้มเหลว" >&2
  rm -f "$out"
  exit 1
fi

# ลายนิ้วมือไว้เทียบว่าไฟล์ไม่เพี้ยนระหว่างคัดลอกไปเก็บที่อื่น
if command -v shasum > /dev/null; then shasum -a 256 "$out" > "$out.sha256"
else sha256sum "$out" > "$out.sha256"; fi

size="$(du -h "$out" | cut -f1)"
echo "[$(date '+%F %T')] สำเร็จ $size"

# ลบไฟล์เก่าที่เกินกำหนดเก็บ
find "$BACKUP_DIR" -name 'dgl-*.dump*' -type f -mtime "+$KEEP_DAYS" -print -delete

count="$(find "$BACKUP_DIR" -name 'dgl-*.dump' -type f | wc -l | tr -d ' ')"
echo "ตอนนี้มีไฟล์สำรองอยู่ $count ไฟล์ เก็บย้อนหลัง $KEEP_DAYS วัน"

# เตือนถ้าไฟล์ล่าสุดเล็กผิดปกติ — ฐานข้อมูลว่างเปล่ามักแปลว่าต่อผิดเครื่อง
bytes="$(wc -c < "$out" | tr -d ' ')"
if [ "$bytes" -lt 10240 ]; then
  echo "!! ไฟล์เล็กกว่า 10KB ผิดปกติ ตรวจว่าต่อฐานข้อมูลถูกตัวหรือไม่" >&2
  exit 1
fi
