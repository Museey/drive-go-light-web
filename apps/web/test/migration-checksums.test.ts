/**
 * ไฟล์ไมเกรชันที่ปล่อยไปแล้วห้ามแก้ — ด่านนี้จับได้ตั้งแต่ในเครื่อง
 *
 * ตัวรันเก็บ sha256 ของทุกไฟล์ที่รันไปแล้วใน `ops.migrations` แก้เนื้อไฟล์เมื่อไร
 * มันจะหยุดพร้อมบอกชื่อไฟล์ — บนเครื่องจริงคือ preDeployCommand ของ Render
 * **deploy ทั้งรอบจึงล้ม** (16 ก.ย. 2569 เกิดขึ้นจริงจากการแก้ db/011_ops_console.sql)
 *
 * ตัวรันรู้ตัวก็ต่อเมื่อมีฐานข้อมูลจริงให้เทียบ ไฟล์นี้จึงเก็บลายเซ็นไว้ในที่เก็บโค้ด
 * แก้ไฟล์เก่าแล้วแดงทันทีตั้งแต่ `npm test` ไม่ต้องรอ deploy ล้ม
 *
 * เพิ่มไมเกรชันใหม่ → เติมลายเซ็นใน fixtures/migration-checksums.json (ตั้งใจให้ต้องเติมเอง)
 * แก้ไฟล์ภาพรวมสคีมา (001/002) ได้ตามปกติ — ตัวรันยกเว้นให้อยู่แล้ว (SNAPSHOT_FILES)
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_FILES } from '../../../tools/migrate.impl.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DB = resolve(here, '../../../db');
const expected: Record<string, string> = JSON.parse(
  readFileSync(join(here, 'fixtures/migration-checksums.json'), 'utf8'),
);

const sha = (f: string) => createHash('sha256').update(readFileSync(join(DB, f))).digest('hex');
const files = readdirSync(DB).filter((f) => /^\d+.*\.sql$/.test(f)).sort();

describe('ลายเซ็นไฟล์ไมเกรชัน', () => {
  it('ไฟล์ที่ปล่อยไปแล้วต้องไม่ถูกแก้ (ยกเว้นไฟล์ภาพรวมสคีมา)', () => {
    const changed = files.filter(
      (f) => !SNAPSHOT_FILES.has(f) && expected[f] && expected[f] !== sha(f),
    );
    expect(changed, 'ไฟล์เหล่านี้รันบนเครื่องจริงไปแล้ว — ให้เขียนไฟล์ใหม่ต่อท้ายแทน').toEqual([]);
  });

  it('ไมเกรชันใหม่ต้องเติมลายเซ็นไว้ในรายการ', () => {
    expect(files.filter((f) => !expected[f]), 'เติมใน test/fixtures/migration-checksums.json').toEqual([]);
  });

  it('ลายเซ็นที่ค้างอยู่ทั้งที่ไฟล์ถูกลบไปแล้ว ต้องไม่มี', () => {
    expect(Object.keys(expected).filter((f) => !files.includes(f))).toEqual([]);
  });
});
