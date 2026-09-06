#!/usr/bin/env node
/**
 * สร้างรายชื่อไฟล์ไมเกรชันเป็นโมดูล TypeScript
 *
 * เดิม lib/ops.ts อ่านโฟลเดอร์ db/ ตอน runtime ซึ่งพึ่งพา cwd และพึ่งพาว่าโฟลเดอร์นั้น
 * ถูกคัดลอกไปด้วยตอน deploy — สองอย่างที่ต่างกันไปตามแพลตฟอร์ม
 * ถ้าอ่านไม่ได้ ตัวตรวจสุขภาพจะบอกว่าไมเกรชันไม่ครบทั้งที่ครบ
 *
 * ฝังรายชื่อไว้ตอน build แทน แล้วมีเทสต์คอยจับว่าลืมสร้างใหม่หลังเพิ่มไฟล์
 * (รูปแบบเดียวกับ legacy.generated.mjs ในแพ็กเกจ core)
 *
 *   node tools/gen-migrations.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationFiles } from './migrate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'apps/web/src/lib/migrations.generated.ts');

const files = migrationFiles();

writeFileSync(OUT, `/* สร้างอัตโนมัติจากโฟลเดอร์ db/ — ห้ามแก้ด้วยมือ
   สร้างใหม่ด้วย: node tools/gen-migrations.mjs
   มีเทสต์ตรวจว่าตรงกับโฟลเดอร์จริง (ops.test.ts) */

export const EXPECTED_MIGRATIONS: readonly string[] = [
${files.map((f) => `  '${f}',`).join('\n')}
];
`, 'utf8');

console.log(`เขียน ${OUT}\nไฟล์ไมเกรชัน ${files.length} ไฟล์`);
