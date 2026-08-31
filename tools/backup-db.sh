#!/usr/bin/env bash
#
# สำรองฐานข้อมูลทั้งเครื่อง
#
# ต่างจากไฟล์สำรองในเมนู 07 ตรงที่อันนั้นคือข้อมูลของอู่รายเดียวในรูปแบบของโปรแกรมเดิม
# ส่วนอันนี้คือสำเนาทั้งฐานข้อมูลไว้กู้ระบบเวลาเครื่องพัง
#
#   DATABASE_URL=postgresql://... tools/backup-db.sh
#
# ตัวแปรที่ปรับได้
#   BACKUP_DIR  ที่เก็บไฟล์            ค่าเริ่มต้น ./backups
#   KEEP_DAYS   เก็บย้อนหลังกี่วัน       ค่าเริ่มต้น 90 (ตรงกับที่เขียนไว้ในนโยบายข้อมูลส่วนบุคคล)
#   PGDUMP      คำสั่ง pg_dump         เช่น "docker exec dgl_pg pg_dump" ตอนทดสอบในเครื่อง
#
# ตั้งให้รันทุกวันด้วย cron ตี 3 เช่น
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

echo "[$(date '+%F %T')] เริ่มสำรอง -> $out"

# -Fc คือรูปแบบบีบอัดของ Postgres เอง กู้ทีละตารางได้ และเล็กกว่า .sql มาก
# ไม่ใส่ --no-owner ตรงนี้ เพราะอยากได้สิทธิ์ของ role กลับมาครบตอนกู้ลงเครื่องเดิม
$PGDUMP "$DATABASE_URL" -Fc --clean --if-exists > "$out.part"
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
