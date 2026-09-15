/**
 * กติกาของฟอร์มทั้งระบบ — บังคับที่ไฟล์โค้ดโดยตรง
 *
 * 1. ปฏิทิน/ช่องวันที่เป็นภาษาไทยทั้งหมด (ผู้ใช้กำหนด) — `<input type="date">` ของเบราว์เซอร์
 *    แสดง ค.ศ. และภาษาตามเครื่อง จึงห้ามใช้ ใช้ ThaiDateInput / ThaiDateField แทน
 * 2. ไม่ให้เบราว์เซอร์เด้งค่าที่เคยกรอก (ผู้ใช้กำหนด) — ทุกฟอร์มต้องระบุ autoComplete
 *    ช่องกรอกที่ไม่อยู่ในฟอร์มก็ต้องระบุเอง · ช่องล็อกอินระบุ username / current-password ที่ตัวช่องได้
 *
 * ตรวจแบบอ่านไฟล์ เพราะของที่ขาดคือ "ไม่มีแอตทริบิวต์" ซึ่งดูจากหน้าจอไม่เห็น และหน้าใหม่ที่เพิ่มทีหลังลืมได้ง่าย
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

/** ลบคอมเมนต์ก่อนตรวจ — คำอธิบายที่พูดถึง <input type="date"> ไม่ใช่โค้ด */
const code = (p: string) => readFileSync(p, 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const FILES = tsxFiles(SRC).map((p) => ({ rel: relative(SRC, p), src: code(p) }));
/** แท็กเปิดทั้งแท็ก (อาจยาวหลายบรรทัด) — ตัดที่ > ตัวแรกที่ไม่อยู่ใน {...} */
const tags = (src: string, name: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?=[\\s>/])`, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0, i = m.index + name.length + 1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
};

describe('ฟอร์มทั้งระบบ', () => {
  it('อ่านไฟล์ได้จริง', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.reduce((n, f) => n + tags(f.src, 'form').length, 0)).toBeGreaterThan(50);
  });

  it('ไม่มีช่องวันที่ของเบราว์เซอร์ (type="date") — ใช้ปฏิทินไทย', () => {
    const bad = FILES.flatMap((f) => tags(f.src, 'input')
      .filter((t) => /type=["'{`]*(date|datetime-local|month|week)["'`}]/.test(t))
      .map((t) => `${f.rel}: ${t.replace(/\s+/g, ' ').slice(0, 90)}`));
    expect(bad).toEqual([]);
  });

  it('ทุก <form> ระบุ autoComplete — เบราว์เซอร์ไม่เด้งค่าที่เคยกรอก', () => {
    const bad = FILES.flatMap((f) => tags(f.src, 'form')
      .filter((t) => !/autoComplete=/.test(t))
      .map((t) => `${f.rel}: ${t.replace(/\s+/g, ' ').slice(0, 90)}`));
    expect(bad).toEqual([]);
  });

  it('ช่องกรอกในไฟล์ที่ไม่มี <form> ระบุ autoComplete เอง', () => {
    const bad = FILES.filter((f) => tags(f.src, 'form').length === 0).flatMap((f) => tags(f.src, 'input')
      .filter((t) => !/type=["'](hidden|checkbox|radio|file)["']/.test(t))
      .filter((t) => !/autoComplete=/.test(t))
      .map((t) => `${f.rel}: ${t.replace(/\s+/g, ' ').slice(0, 90)}`));
    expect(bad).toEqual([]);
  });
});
