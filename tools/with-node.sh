#!/usr/bin/env bash
#
# รันคำสั่งด้วย Node รุ่นที่โปรเจกต์ต้องการ (>= 20)
#
#   tools/with-node.sh npm run dev -w @drivegolight/web
#
# มีไว้เพราะ node ตัวปริยายของเครื่องพัฒนาอาจเป็นรุ่นเก่ากว่าที่โปรเจกต์ใช้
# ซึ่งพังด้วย SyntaxError ที่ไม่บอกสาเหตุ — เคยเสียเวลาไล่หามาแล้วสามรอบ
# ตัวนี้หา Node รุ่นใหม่พอจาก nvm ให้เอง โดยไม่ไปแตะค่าปริยายของเครื่อง
set -euo pipefail

MIN=20

major() { "$1" -v 2>/dev/null | sed 's/^v//; s/\..*//'; }

pick() {
  if command -v node >/dev/null 2>&1; then
    local m; m=$(major "$(command -v node)")
    if [ -n "$m" ] && [ "$m" -ge "$MIN" ]; then return 0; fi
  fi
  # เลือกรุ่นสูงสุดที่ nvm ติดตั้งไว้ เรียงตามตัวเลขจริง ไม่ใช่ตามตัวอักษร
  local best=""
  for d in "$HOME"/.nvm/versions/node/*/bin; do
    [ -x "$d/node" ] || continue
    local m; m=$(major "$d/node")
    [ -n "$m" ] && [ "$m" -ge "$MIN" ] || continue
    if [ -z "$best" ] || [ "$m" -gt "$(major "$best/node")" ]; then best="$d"; fi
  done
  if [ -n "$best" ]; then
    PATH="$best:$PATH"
    export PATH
    return 0
  fi
  echo "หา Node รุ่น $MIN ขึ้นไปไม่เจอ — ติดตั้งด้วย  nvm install $MIN" >&2
  return 1
}

pick
exec "$@"
