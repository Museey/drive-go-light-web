/**
 * ออกรหัสถัดไปจาก "เลขสูงสุดที่มีอยู่ + 1" — ทุกจุดต้องนับเฉพาะเลขท้าย 1–9 หลัก
 *
 * ช่องรหัสพิมพ์อะไรก็ได้ อู่จริงตั้งรหัสลูกค้าเป็น CUS-100302306445 แล้ว `::int` ล้น
 * จนเปิดฟอร์มเพิ่มลูกค้าใหม่ไม่ได้ทั้งอู่ (31 ต.ค. 2569) — ฟังก์ชันพวกนี้เรียกผ่าน query()
 * ที่ต้องมีบริบทของ request จึงตรวจจากซอร์สแทน: จุดที่คัดลอกไปใหม่โดยไม่จำกัดหลักจะแดงเอง
 * พฤติกรรมจริงตรวจใน contacts-csv-db.test.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib');

describe('ออกรหัสถัดไป', () => {
  it('ทุก max(...::int) ของเลขท้ายรหัส จำกัดไม่เกิน 9 หลัก', () => {
    const hits: string[] = [];
    for (const f of readdirSync(LIB).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(LIB, f), 'utf8');
      for (const m of src.matchAll(/max\(\(?substring\(code from[^`]*?`/gs)) {
        hits.push(`${f}: ${m[0].includes('{1,9}') ? 'ok' : m[0].replace(/\s+/g, ' ')}`);
      }
    }
    expect(hits.length, 'ต้องเจออย่างน้อย 4 จุด — ถ้าน้อยกว่านี้รูปแบบการค้นหาพังแล้ว').toBeGreaterThanOrEqual(4);
    expect(hits.filter((h) => !h.endsWith(': ok'))).toEqual([]);
  });
});
