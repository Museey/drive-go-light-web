/**
 * กติกาของจุดตัดขนาดจอและการวางชั้น — บังคับที่ไฟล์ CSS โดยตรง
 *
 * สองเรื่องนี้พังแบบเงียบที่สุดในบรรดาเรื่อง UI ทั้งหมด — เพิ่ม `@media` ค่าใหม่
 * หรือใส่ `z-index: 999` ที่ไหนสักแห่ง แล้วเมนูไปบังปุ่มบนจอขนาดหนึ่งที่ไม่มีใครเปิด
 * ของเดิมมีสี่จุดตัด (560/820/980/1000) ซึ่งสองค่ากลางต่างกัน 20px โดยไม่มีเหตุผล
 * และมี z-index กระจายอยู่ห้าที่ตั้งแต่ 5 ถึง 200 ซึ่งไล่ไม่ออกว่าใครทับใคร
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/app/globals.css'), 'utf8');

/** ลบคอมเมนต์ออกก่อนตรวจ — ตัวเลขในคำอธิบายไม่ใช่กฎที่เบราว์เซอร์อ่าน */
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('จุดตัดขนาดจอ', () => {
  it('อ่านไฟล์ได้จริง', () => {
    expect(code.length).toBeGreaterThan(3000);
    expect(code).toContain('@media');
  });

  it('มีแค่ 768 กับ 1280 เท่านั้น', () => {
    const widths = [...code.matchAll(/@media[^{]*?\((?:min|max)-width:\s*(\d+)px\)/g)]
      .map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(4);
    expect([...new Set(widths)].sort((a, b) => a - b)).toEqual([768, 1280]);
  });

  /* เขียนแบบ min-width ทั้งหมด (ฐาน = จอแคบสุด) ปนสองทิศแล้วต้องอ่านย้อนขึ้นลง
     ถึงจะรู้ว่าจอไหนได้กฎอะไร ซึ่งเป็นที่มาของกฎที่ตายแล้วโดยไม่มีใครรู้ */
  it('ใช้ min-width อย่างเดียว ไม่ปนกับ max-width', () => {
    const maxes = [...code.matchAll(/@media[^{]*?max-width:\s*(\d+)px/g)].map((m) => m[0]);
    expect(maxes).toEqual([]);
  });

  it('มีตัวแปรบอกจุดตัดไว้ให้คนอ่านโค้ดรู้ว่าค่าไหนคืออะไร', () => {
    expect(css).toContain('--bp-tablet');
    expect(css).toContain('--bp-desktop');
  });
});

describe('ชั้นของสิ่งที่ลอยทับกัน', () => {
  it('ไม่มี z-index เป็นตัวเลขดิบ', () => {
    const raw = [...code.matchAll(/z-index:\s*([^;]+);/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => !v.startsWith('var(--z-'));
    expect(raw).toEqual([]);
  });

  it('ตัวแปรครบทุกชั้นและเรียงจากล่างขึ้นบน', () => {
    const order = ['content', 'sticky', 'nav', 'header', 'overlay', 'drawer', 'toast'];
    const vals = order.map((k) => {
      const m = css.match(new RegExp(`--z-${k}:\\s*(\\d+)`));
      expect(m, `ไม่มีตัวแปร --z-${k}`).toBeTruthy();
      return Number(m![1]);
    });
    expect(vals).toEqual([...vals].sort((a, b) => a - b));
    expect(new Set(vals).size, 'มีชั้นที่ค่าซ้ำกัน').toBe(vals.length);
  });

  /* ฉากหลังต้องอยู่ใต้ของที่มันรองรับเสมอ ไม่งั้นกดอะไรในแผงก็โดนฉากหลังแทน */
  it('ฉากหลังอยู่ใต้ลิ้นชักและแผง', () => {
    const overlay = Number(css.match(/--z-overlay:\s*(\d+)/)![1]);
    const drawer = Number(css.match(/--z-drawer:\s*(\d+)/)![1]);
    expect(overlay).toBeLessThan(drawer);
  });
});
