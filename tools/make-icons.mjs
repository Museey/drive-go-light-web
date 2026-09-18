/**
 * สร้างไอคอนของเว็บจากภาพโลโก้ต้นฉบับ (apps/web/brand/logo-source.jpg)
 *
 * ผู้ใช้ส่งภาพวงกลมเหลืองพื้นขาว 1280×1280 (18 ก.ย. 2569) และเลือกให้ "ตัดขอบขาวออกครึ่งเดียว"
 * วัดจากภาพจริง: โลโก้เริ่มที่ 192px จากซ้าย/บน และมีเงาทอดไปทางขวา/ล่าง
 * จึงครอปสี่เหลี่ยมจัตุรัสที่กึ่งกลางโลโก้ ขนาดกึ่งกลางระหว่างขอบโลโก้กับขอบภาพ
 *
 * รันใหม่เมื่อเปลี่ยนภาพต้นฉบับ:  bash tools/with-node.sh node tools/make-icons.mjs
 * ใช้เบราว์เซอร์ของชุดทดสอบวาดภาพ (ไม่ต้องเพิ่มไลบรารีรูปภาพเข้าโปรเจกต์)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = resolve(ROOT, 'apps/web');
const SRC = resolve(WEB, 'brand/logo-source.jpg');

/** ไฟล์ที่ต้องมี — ดู apps/web/test/app-icon.test.ts */
const OUT = [
  ['src/app/icon.png', 512],
  ['src/app/apple-icon.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
];

const browser = await chromium.launch({ channel: 'msedge-dev' });
const page = await browser.newPage();
const src = readFileSync(SRC).toString('base64');

const shots = await page.evaluate(async ({ src, sizes }) => {
  const img = new Image();
  img.src = 'data:image/jpeg;base64,' + src;
  await img.decode();

  /* กรอบของโลโก้ — ตัดเงาอ่อน ๆ ที่ทอดไปทางขวา/ล่างออกจากการวัด (เกณฑ์ 225 ไม่ใช่ 245)
     ไม่งั้นจุดกึ่งกลางถูกเงาดึงไปขวาล่าง วงกลมในไอคอนจะเยื้องขึ้นซ้าย */
  const probe = document.createElement('canvas');
  probe.width = img.width; probe.height = img.height;
  const pg = probe.getContext('2d');
  pg.drawImage(img, 0, 0);
  const d = pg.getImageData(0, 0, probe.width, probe.height).data;
  let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1;
  for (let y = 0; y < probe.height; y++) for (let x = 0; x < probe.width; x++) {
    const i = (y * probe.width + x) * 4;
    if (d[i] < 225 || d[i + 1] < 225 || d[i + 2] < 225) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  /* ครึ่งทางระหว่าง "ชิดโลโก้" กับ "เต็มภาพ" — เหลือขอบขาวไว้ครึ่งเดียวตามที่ผู้ใช้เลือก */
  const logo = Math.max(maxX - minX + 1, maxY - minY + 1);
  const side = Math.min(img.width, img.height, Math.round((logo + Math.min(img.width, img.height)) / 2));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const sx = Math.max(0, Math.min(img.width - side, Math.round(cx - side / 2)));
  const sy = Math.max(0, Math.min(img.height - side, Math.round(cy - side / 2)));

  const out = [];
  for (const size of sizes) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    g.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    out.push([size, c.toDataURL('image/png').split(',')[1]]);
  }
  return { crop: { sx, sy, side }, out };
}, { src, sizes: [...new Set(OUT.map(([, s]) => s))] });

const bySize = new Map(shots.out);
for (const [file, size] of OUT) {
  writeFileSync(resolve(WEB, file), Buffer.from(bySize.get(size), 'base64'));
  console.log(`เขียน ${file} (${size}px)`);
}
console.log('ครอป', JSON.stringify(shots.crop));
await browser.close();
