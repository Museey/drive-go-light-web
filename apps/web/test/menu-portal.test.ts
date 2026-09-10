/**
 * แผงหล่นของแถบเมนูต้องไม่ถูกวาดไว้ข้างในแถบ
 *
 * **อาการที่เจอบน Safari** — กดเมนูแล้วได้แถบขาวเปล่าแทนที่จะเห็นการ์ดเมนูย่อย
 *
 * `.rail` มี `overflow-x: auto` เพื่อให้แถบเลื่อนซ้ายขวาบนมือถือ
 * WebKit ใช้ overflow เป็นขอบเขตตัดภาพของลูกที่เป็น `position: fixed` ด้วย
 * ต่างจาก Chrome ที่ปล่อยให้หลุดออกไปได้ แผงจึงถูกตัดเหลือความสูงของแถบ
 *
 * ทดสอบด้วยการอ่านโค้ดจริง เพราะชุดทดสอบนี้ไม่มีตัวเรนเดอร์ React
 * และบั๊กแบบนี้ไม่มีทางเห็นบนเครื่องที่ใช้ Chrome พัฒนา — ต้องมีอะไรกันไว้
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const BAR = resolve(here, '../src/components/menu-bar.tsx');
const CSS = resolve(here, '../src/app/globals.css');

const bar = readFileSync(BAR, 'utf8');
const css = readFileSync(CSS, 'utf8');

describe('แผงหล่นของแถบเมนู', () => {
  it('อ่านไฟล์ได้จริง ไม่ใช่เทียบกับสตริงว่าง', () => {
    expect(bar.length).toBeGreaterThan(500);
    expect(css).toContain('.mmenu');
  });

  it('ย้ายไปแขวนที่ body ด้วย portal ไม่ได้วาดไว้ในแถบ', () => {
    expect(bar).toContain('createPortal');
    expect(bar).toContain('document.body');
  });

  it('แผงเป็น position: fixed — จึงต้องอยู่นอกบรรพบุรุษที่มี overflow', () => {
    const block = css.slice(css.indexOf('.mmenu'), css.indexOf('.mmenu') + 200);
    expect(block).toContain('position: fixed');
  });

  it('แถบเมนูยังมี overflow-x สำหรับเลื่อนบนมือถือ — เหตุผลที่ต้องใช้ portal', () => {
    const rail = css.slice(css.indexOf('.rail {'), css.indexOf('.rail {') + 400);
    expect(rail).toContain('overflow-x: auto');
  });

  /*
   * -webkit-overflow-scrolling: touch เลิกใช้แล้วตั้งแต่ iOS 13
   * และเป็นตัวที่ทำให้ WebKit สร้างขอบเขตตัดภาพให้ลูกที่เป็น fixed
   */
  it('ไม่ใช้ -webkit-overflow-scrolling อีกแล้ว', () => {
    expect(css).not.toMatch(/^\s*-webkit-overflow-scrolling:\s*touch/m);
  });

  /*
   * แผงอยู่นอกแถบแล้ว ตัวจับคลิกนอกพื้นที่ต้องนับแผงว่าเป็น "ข้างใน" ด้วย
   * ไม่งั้นกดการ์ดในแผงจะปิดแผงตั้งแต่ mousedown แล้วลิงก์ไม่ทันทำงาน
   */
  it('ตัวจับคลิกนอกพื้นที่รู้จักแผงที่ย้ายออกไปแล้ว', () => {
    expect(bar).toContain('panelRef');
    const onDown = bar.slice(bar.indexOf('const onDown'), bar.indexOf('const onDown') + 400);
    expect(onDown).toContain('panelRef.current?.contains');
  });
});
