/**
 * เลขเมนูที่พิมพ์อยู่บนหน้าจอ ต้องมีอยู่จริงในผังเมนู
 *
 * ผู้ใช้เดิมจำเลขเมนูได้ขึ้นใจ และใช้เลขเป็นตัวนำทางมากกว่าชื่อ
 * เลขที่พิมพ์มือแล้วเพี้ยนจึงไม่มีอะไรฟ้อง จนกว่าจะมีคนกดตามเลขแล้วไปโผล่ผิดที่
 *
 * เทสต์นี้เกิดขึ้นเพราะหน้ารายจ่ายเขียน 04.3 ให้ปุ่มค่าใช้จ่าย
 * ทั้งที่ผังเมนูคือ 04.2 — ไม่มีใครสังเกตจนผู้ใช้ทักเรื่องปุ่มที่ไม่เปลี่ยนตามแท็บ
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU } from '../src/components/menu-map';
import { NEW_BTNS } from '../src/lib/doc-flow';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../src/app');

/** เลขทุกตัวที่ผังเมนูรู้จัก — ทั้งเมนูหลักและแท็บย่อย */
const KNOWN = new Set<string>();
for (const m of MENU) {
  if (m.no) KNOWN.add(m.no);
  for (const s of m.subs ?? []) KNOWN.add(s.no);
}

describe('เลขเมนูบนหน้าจอ', () => {
  it('ผังเมนูอ่านได้จริง ไม่ใช่เซ็ตว่าง', () => {
    expect(KNOWN.size).toBeGreaterThan(20);
    expect(KNOWN.has('03.2.1')).toBe(true);
  });

  it('ปุ่มเปิดเอกสารใหม่ทุกตัวใช้เลขที่มีอยู่ในผังเมนู', () => {
    const bad: string[] = [];
    for (const [view, btns] of Object.entries(NEW_BTNS)) {
      for (const b of btns) {
        if (!KNOWN.has(b.no)) bad.push(`${view}: ${b.no} (${b.label})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('ทุกแท็บของหน้ารายรับมีปุ่มเปิดเอกสารใหม่ของตัวเอง', () => {
    for (const view of ['all', 'quote', 'invoice', 'receipt']) {
      expect(NEW_BTNS[view]?.length, `แท็บ ${view} ไม่มีปุ่ม`).toBeGreaterThan(0);
    }
  });

  /**
   * ไล่ไฟล์หน้าจอเองแทนการเขียนรายชื่อไว้ — หน้าใหม่ที่เพิ่มทีหลังจะโดนตรวจด้วย
   *
   * จับเฉพาะเลขที่อยู่ในป้าย `.mono` ซึ่งเป็นรูปแบบที่ใช้แสดงเลขเมนูจริง ๆ
   * ไม่ไปโดนตัวเลขอื่นอย่างจำนวนเงินหรือวันที่
   */
  function pages(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return pages(full);
      return /\.tsx$/.test(e.name) ? [full] : [];
    });
  }

  it('ไล่ไฟล์หน้าจอได้จริง', () => {
    expect(pages(APP).length).toBeGreaterThan(30);
  });

  it('เลขที่พิมพ์ตรง ๆ ในหน้าจอ มีอยู่ในผังเมนูทุกตัว', () => {
    const bad: string[] = [];
    for (const f of pages(APP)) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/className="mono"[^>]*>\s*(\d{2}\.\d(?:\.\d)?)\s*</g)) {
        const no = m[1]!;
        if (!KNOWN.has(no)) bad.push(`${f.slice(APP.length + 1)} → ${no}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
