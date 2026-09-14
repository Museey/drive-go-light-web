/**
 * หน้ารายใบทุกหน้าต้องกันรหัสที่ไม่ใช่ uuid ก่อนถึงฐานข้อมูล
 *
 * ถ้าไม่กัน Postgres ปฏิเสธด้วย invalid input syntax for type uuid แล้วหน้าพังเป็น 500
 * เจอจริงตอนเมนู 03.5 ชี้ไป /income/walkin ก่อนที่หน้านั้นจะมีไฟล์ — ตกไปที่ /income/[id]
 *
 * ตรวจด้วยการอ่านไฟล์ เพราะหน้าใหม่ที่เพิ่มทีหลังจะลืมใส่ได้ง่ายที่สุด
 * ส่วนการตอบ 404 จริงตรวจบนเบราว์เซอร์ใน e2e/not-found.spec.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isUuid } from '../src/lib/ids';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../src/app');

function idPages(dir: string, inId = false): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return idPages(full, inId || name === '[id]');
    return inId && name === 'page.tsx' ? [full] : [];
  });
}

describe('รหัสใน URL', () => {
  it('isUuid รับเฉพาะ uuid', () => {
    expect(isUuid('0ace6dc0-64d5-4bad-b6b0-4a934e61d6de')).toBe(true);
    expect(isUuid('0ACE6DC0-64D5-4BAD-B6B0-4A934E61D6DE')).toBe(true);
    for (const bad of ['walkin', 'new', '', '0ace6dc0-64d5-4bad-b6b0-4a934e61d6d', "x' or 1=1 --"]) {
      expect(isUuid(bad), bad).toBe(false);
    }
  });

  const pages = idPages(APP);

  it('เจอหน้ารายใบจริง ไม่ใช่ผ่านเพราะหาไฟล์ไม่เจอ', () => {
    expect(pages.length).toBeGreaterThanOrEqual(16);
  });

  it.each(pages.map((p) => [p.slice(APP.length)]))('%s กันรหัสก่อนใช้', (rel) => {
    const src = readFileSync(join(APP, rel), 'utf8');
    expect(src).toMatch(/!isUuid\(id\)\) notFound\(\)/);
    /* ตัวกันต้องมาก่อนการอ่านข้อมูลครั้งแรก */
    const guard = src.indexOf('!isUuid(id)');
    const firstRead = src.search(/await (get|load|read|find|query|list)[A-Z]?\w*\(/);
    if (firstRead >= 0) expect(guard).toBeLessThan(firstRead);
  });
});
