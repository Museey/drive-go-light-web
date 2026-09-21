/**
 * ห้ามขอ connection ฐานข้อมูลซ้อนจากข้างใน callback ที่ถือ connection อยู่แล้ว
 *
 * เจอจริง 21 ก.ย. 2569 — ยิงรับชำระพร้อมกัน 10 เครื่องแล้วเซิร์ฟเวอร์ค้างทั้งตัว เพราะโค้ดรับชำระเรียก
 * requireEdit ข้างใน mutate ซึ่งไปโหลดเซสชันด้วย connection เส้นที่สอง ห้าคำขอพร้อมกัน (ขนาด pool
 * บนเครื่องจริง) ถือคนละเส้นแล้วรอเส้นที่สองไม่มีวันได้ ทุกอู่บนเครื่องนั้นค้างตาม (ดู db-pool-db.test.ts)
 *
 * db.ts มีตัวจับตอนรัน (โยนตอนพัฒนา) แต่จับได้เฉพาะทางที่มีคนกดผ่านจริง เทสต์นี้อ่านไฟล์ทั้งหมด
 * จึงจับทางที่ไม่มีใครเปิดด้วย — ไล่หาฟังก์ชันทุกตัวที่ขอ connection เอง (ทั้งตรงและทางอ้อม)
 * แล้วดูว่ามีตัวไหนถูกเรียกใน callback ที่ส่งให้ query / mutate / withTenant / withoutTenant ไหม
 *
 * ที่ใช้ได้ใน callback: `c.query(...)` กับฟังก์ชันที่รับ client เข้าไป (ชื่อลงท้าย With)
 * ต้องตรวจสิทธิ์ข้างใน → ใช้ `session` ที่ mutate ส่งให้ กับ assertCanEdit แทน requireEdit
 *
 * ตัวตรวจเคยพิสูจน์แล้วว่าจับได้จริง — รันกับโค้ด main ก่อนแก้ เจอครบสามจุดของฝั่งรับชำระ
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** ลบคอมเมนต์ก่อนตรวจ — ตัวอย่างโค้ดในคำอธิบายไม่ใช่การเรียกจริง */
const strip = (s: string) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const FILES = walk(SRC).map((p) => ({ rel: relative(SRC, p), src: strip(readFileSync(p, 'utf8')) }));

/** ตัวที่ขอ connection เองแน่ ๆ — ที่เหลือหาจากการไล่ว่าใครเรียกตัวพวกนี้ */
const ROOTS = [
  'query', 'mutate', 'withTenant', 'withoutTenant',
  'requireSession', 'requirePerm', 'requireEdit', 'requireTab', 'requireExport', 'requireCost', 'currentSession',
];
const WRAPPERS = /(?<![\w.])(query|mutate|withTenant|withoutTenant)\s*(?:<[^>()]*>)?\(/g;

/** เรียกชื่อนี้ตรง ๆ — ไม่นับ obj.name( เช่น c.query( ซึ่งใช้ connection ที่ถืออยู่แล้ว */
const calls = (name: string, text: string) =>
  new RegExp(`(?<![\\w.])${name}\\s*(?:<[^>()]*>)?\\(`).test(text);

/**
 * เนื้อฟังก์ชัน — `i` ชี้หลังวงเล็บเปิดของพารามิเตอร์
 *
 * ต้องข้ามพารามิเตอร์ (อาจมี type เป็น object `{ … }`) และ return type
 * (อาจเป็น `Promise<{ … }>`) ไปก่อน ไม่งั้นได้ปีกกาของ type มาแทนเนื้อฟังก์ชัน
 */
function bodyAfterParams(s: string, i: number): string {
  let k = i;
  for (let d = 1; k < s.length && d; k++) d += s[k] === '(' ? 1 : s[k] === ')' ? -1 : 0;
  for (let angle = 0; k < s.length; k++) {
    if (s[k] === '<') angle++;
    else if (s[k] === '>' && s[k - 1] !== '=') angle--;
    else if (s[k] === '{' && angle === 0) break;
  }
  const j = k;
  for (let d = 0; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}' && --d === 0) return s.slice(j, k + 1);
  }
  return s.slice(j);
}

function acquirers(): Set<string> {
  const fns = FILES.flatMap(({ src }) =>
    [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g)]
      .map((m) => ({ name: m[1]!, body: bodyAfterParams(src, m.index! + m[0].length) })));
  const found = new Set(ROOTS);
  /* ไล่ซ้ำจนนิ่ง — ฟังก์ชันที่เรียกฟังก์ชันที่ขอ connection ก็นับว่าขอเองด้วย */
  for (let grew = true; grew;) {
    grew = false;
    for (const f of fns) {
      if (!found.has(f.name) && [...found].some((a) => calls(a, f.body))) {
        found.add(f.name);
        grew = true;
      }
    }
  }
  return found;
}

describe('ขอ connection ซ้อน', () => {
  const acq = acquirers();

  it('ไล่ฟังก์ชันที่ขอ connection เองเจอจริง (ตัวตรวจไม่ได้ว่างเปล่า)', () => {
    for (const name of ['requireEdit', 'getShop', 'recordPayment', 'saveSalesDoc']) {
      expect(acq.has(name), name).toBe(true);
    }
    /* ตัวที่รับ client เข้าไปต้องไม่ถูกนับ ไม่งั้นเทสต์นี้แดงทุกไฟล์ */
    for (const name of ['lockDocForEditWith', 'recordPaymentWith', 'consumeStock']) {
      expect(acq.has(name), name).toBe(false);
    }
  });

  it('ไม่มี callback ที่ถือ connection อยู่ไปเรียกตัวที่ขอ connection อีกเส้น', () => {
    const bad: string[] = [];
    for (const { rel, src } of FILES) {
      for (const m of src.matchAll(WRAPPERS)) {
        let i = m.index! + m[0].length;
        for (let d = 1; i < src.length && d; i++) d += src[i] === '(' ? 1 : src[i] === ')' ? -1 : 0;
        const args = src.slice(m.index! + m[0].length, i - 1);
        const arrow = args.indexOf('=>');
        if (arrow < 0) continue;
        const cb = args.slice(arrow);
        for (const a of acq) {
          if (calls(a, cb)) bad.push(`${rel}:${src.slice(0, m.index).split('\n').length} ${m[1]}(…) เรียก ${a}()`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
