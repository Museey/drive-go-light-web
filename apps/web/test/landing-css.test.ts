/**
 * กติกาของหน้าแนะนำระบบ (หน้าตาใหม่ 26 พ.ย. 2569 · PLAN-landing-redesign-2569-11-26.md)
 *
 * หน้านี้ย้ายออกจาก globals.css มาอยู่ที่ components/landing.css และใช้หน่วย rem ล้วน
 * ชุดกติกาของ globals.css (css-layers.test.ts — จุดตัด 768/1280px) จึงไม่ครอบคลุมไฟล์นี้อีกต่อไป
 * ถ้าไม่มีเทสต์ของตัวเอง วันหนึ่งจะมีคนเติม px หรือจุดตัดค่าใหม่เข้ามาโดยไม่มีอะไรเตือน
 *
 * แผนของทีมระบุว่ามีไฟล์นี้ แต่ชุดไฟล์ที่ส่งมา 27 พ.ย. 2569 ไม่มี — เขียนขึ้นตามกติกาที่แผนบอกไว้
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');

/** ลบคอมเมนต์ก่อนตรวจ — ตัวเลขในคำอธิบายไม่ใช่กฎที่เบราว์เซอร์อ่าน */
const css = read('../src/components/landing.css').replace(/\/\*[\s\S]*?\*\//g, '');
const globals = read('../src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const svg = read('../public/garage-lines.svg');

describe('landing.css', () => {
  it('อ่านไฟล์ได้จริง', () => {
    expect(css.length).toBeGreaterThan(5000);
    expect(css).toContain('.lp');
  });

  it('ใช้ rem ล้วน ไม่มี px', () => {
    expect(css.match(/\d*\.?\d+px/g) ?? []).toEqual([]);
  });

  it('จุดตัดมีแค่ 48rem กับ 80rem และเขียนแบบ min-width อย่างเดียว', () => {
    const widths = [...css.matchAll(/@media[^{]*\((min|max)-width:\s*([\d.]+)(rem|px|em)\)/g)]
      .map((m) => `${m[1]}:${m[2]}${m[3]}`);
    expect([...new Set(widths)].sort()).toEqual(['min:48rem', 'min:80rem']);
  });

  /* ชั้นติดลบใช้กับของตกแต่งหลังเนื้อหาภายในกล่องของตัวเอง — แทนด้วยตัวแปร --z-* ไม่ได้
     นอกนั้นต้องอ้างตัวแปรชุดเดียวกับทั้งระบบ ไม่งั้นแถบบนของหน้านี้จะไปทับหรือถูกทับโดยไม่รู้ตัว */
  it('z-index เป็นตัวแปร --z-* หรือค่าติดลบเท่านั้น', () => {
    const bad = [...css.matchAll(/z-index:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => !v.startsWith('var(--z-') && !/^-\d+$/.test(v));
    expect(bad).toEqual([]);
  });

  it('คนที่ตั้งเครื่องให้ลดการเคลื่อนไหว ไม่เจอ animation และไม่มีอะไรซ่อนค้าง', () => {
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/)?.[1] ?? '';
    expect(block, 'ต้องมีบล็อก prefers-reduced-motion').not.toBe('');
    expect(block).toMatch(/animation:\s*none/);
    expect(block).toMatch(/transition:\s*none/);
    /* ของที่รอ "โผล่ตอนเลื่อนถึง" ต้องเห็นเลย — ไม่งั้นเนื้อหาครึ่งหน้าจะมองไม่เห็นตลอดไป */
    expect(block).toMatch(/\[data-reveal\][^}]*opacity:\s*1/);
  });

  it('globals.css ไม่มีคลาส lp- เหลืออยู่ — หน้าตาของหน้านี้มีที่เดียว', () => {
    expect(globals.match(/\.lp[-\s{.:,]/g) ?? []).toEqual([]);
  });
});

describe('garage-lines.svg', () => {
  /* ฝังด้วย <img> เบราว์เซอร์จึงไม่รันสคริปต์ในไฟล์อยู่แล้ว — ตรวจซ้ำที่ตัวไฟล์
     เผื่อวันหนึ่งมีคนเปลี่ยนไปฝังแบบ inline ซึ่งสคริปต์จะทำงานในหน้าเว็บทันที */
  it('ไม่มีสคริปต์ และไม่ดึงอะไรจากข้างนอก', () => {
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    const external = [...svg.matchAll(/(?:href|src)\s*=\s*["'](https?:[^"']+)/g)].map((m) => m[1]);
    expect(external).toEqual([]);
  });

  it('ลายเส้นหยุดเคลื่อนไหวเมื่อผู้ใช้ตั้งให้ลดการเคลื่อนไหว', () => {
    expect(svg).toMatch(/prefers-reduced-motion/);
  });
});
