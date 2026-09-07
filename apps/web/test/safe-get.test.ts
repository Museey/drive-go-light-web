/**
 * GET ต้องไม่เปลี่ยนแปลงอะไร
 *
 * เคยพลาดมาแล้วและเจ็บมาก — `/ops/logout` เขียนเป็น GET แล้วผูกกับ `<Link>`
 * Next โหลดล่วงหน้าให้กับลิงก์ที่โผล่อยู่ในหน้าจอ ลิงก์ "ออกจากระบบ" อยู่บนแถบบน
 * ของทุกหน้า **ผู้ใช้จึงถูกลบ session ทิ้งตั้งแต่วินาทีแรกที่ล็อกอินเข้ามา**
 * หน้าที่เปิดอยู่ยังแสดงผลปกติเพราะเรนเดอร์ไปแล้ว แต่กดอะไรต่อก็เด้งกลับหน้าล็อกอิน
 *
 * ไม่ได้เจอตอนพัฒนาเพราะทดสอบด้วย curl ซึ่งไม่โหลดล่วงหน้าให้
 * และไม่ใช่แค่เรื่อง Next — ตัวสแกนลิงก์ ตัวเก็บหน้าเว็บ และปุ่มย้อนกลับ
 * ก็ยิง GET ซ้ำได้ทั้งนั้น
 *
 * เทสต์นี้ไล่จากไฟล์จริงในโฟลเดอร์ route ใหม่ที่ทำผิดจะแดงเอง
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../src/app');

function walk(dir: string, hit: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, hit));
    else if (hit(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(APP.length).replace(/\\/g, '/');

/** ฟังก์ชันที่เปลี่ยนแปลงสถานะ — เรียกจาก GET ไม่ได้ */
const DESTRUCTIVE = [
  'signOut(', 'opsSignOut(', 'mutate(', 'deletePic(', 'savePic(',
  'importContactsWith(', 'restoreFromBackup(', 'wipeTenantData(',
];

describe('GET ต้องไม่เปลี่ยนแปลงอะไร', () => {
  const routes = walk(APP, (p) => p.endsWith('route.ts'));

  it('เจอ route ครบทุกไฟล์', () => {
    expect(routes.length).toBeGreaterThan(4);
  });

  it('ไม่มี route ไหนที่ export GET แล้วเรียกฟังก์ชันที่เปลี่ยนแปลงข้อมูล', () => {
    const bad: string[] = [];
    for (const p of routes) {
      const src = readFileSync(p, 'utf8');
      if (!/export\s+(async\s+)?function\s+GET\b/.test(src)) continue;
      for (const fn of DESTRUCTIVE) {
        if (src.includes(fn)) bad.push(`${rel(p)} เรียก ${fn.replace('(', '()')} ใน GET`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('ทุกเส้นทางออกจากระบบเป็น POST เท่านั้น', () => {
    const outs = routes.filter((p) => /\/logout\/route\.ts$/.test(rel(p)));
    expect(outs.length, 'ต้องมีทั้งของอู่และของคอนโซล').toBe(2);

    for (const p of outs) {
      const src = readFileSync(p, 'utf8');
      expect(src, `${rel(p)} ต้องรับ POST`).toMatch(/export\s+async\s+function\s+POST\b/);
      expect(src, `${rel(p)} ต้องไม่รับ GET — <Link> กับตัวโหลดล่วงหน้าจะยิงเอง`)
        .not.toMatch(/export\s+(async\s+)?function\s+GET\b/);
    }
  });

  it('ไม่มีหน้าไหนผูกเส้นทางออกจากระบบไว้กับ <Link>', () => {
    const pages = walk(APP, (p) => p.endsWith('.tsx'))
      .concat(walk(resolve(here, '../src/components'), (p) => p.endsWith('.tsx')));

    const bad: string[] = [];
    for (const p of pages) {
      const src = readFileSync(p, 'utf8');
      /* <Link href="/logout"> หรือ href="/ops/logout" — ทั้งสองแบบผิด */
      if (/<Link[^>]*href=["'{`][^"'`}]*\/logout/.test(src)) bad.push(p.slice(APP.length));
      if (/<a[^>]*href=["'][^"']*\/logout/.test(src)) bad.push(p.slice(APP.length));
    }
    expect(bad, 'ต้องใช้ form + method="post" แทน').toEqual([]);
  });
});
