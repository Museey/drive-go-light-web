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

  /*
   * แถบเมนูยังเป็นบรรพบุรุษที่มี overflow อยู่ดี — เดสก์ท็อปเป็นแถบซ้ายที่
   * เลื่อนแนวตั้งได้ (`overflow-y: auto`) ซึ่งสร้างขอบเขตตัดภาพแบบเดียวกับ
   * `overflow-x` ของเดิมเป๊ะ เหตุผลที่ต้องใช้ portal จึงไม่ได้หายไปไหน
   */
  it('แถบเมนูยังมี overflow — เหตุผลที่ต้องใช้ portal ไม่ได้หายไปกับการเปลี่ยนรูปแบบ', () => {
    expect(css).toMatch(/\.rail\s*\{[^}]*\}|overflow-y:\s*auto/);
    const desktop = css.slice(css.indexOf('@media (min-width: 1280px)'));
    expect(desktop).toContain('overflow-y: auto');
  });

  /*
   * -webkit-overflow-scrolling: touch เลิกใช้แล้วตั้งแต่ iOS 13
   * และเป็นตัวที่ทำให้ WebKit สร้างขอบเขตตัดภาพให้ลูกที่เป็น fixed
   */
  it('ไม่ใช้ -webkit-overflow-scrolling อีกแล้ว', () => {
    expect(css).not.toMatch(/^\s*-webkit-overflow-scrolling:\s*touch/m);
  });

  /*
   * ปิดแผงด้วย **ฉากหลังที่กดได้** แทนการดักคลิกทั้งหน้า
   *
   * ตัวดักคลิกทั้งหน้าต้องคอยไล่ว่าอะไรนับเป็น "ข้างใน" ซึ่งพลาดง่ายทุกครั้ง
   * ที่โครงสร้างเปลี่ยน (เคยพลาดมาแล้วตอนย้ายแผงออกไป body แล้วกดการ์ดไม่ติด)
   * ฉากหลังเป็นชิ้นเดียวที่กินพื้นที่ทั้งจอและอยู่ใต้แผง — กดโดนเมื่อไรคือกดนอกแผงเสมอ
   */
  it('มีฉากหลังที่กดแล้วปิด และกด Esc ปิดได้', () => {
    expect(bar).toContain('scrim');
    expect(bar).toContain("aria-label=\"ปิดเมนู\"");
    expect(bar).toContain("e.key === 'Escape'");
  });

  it('ฉากหลังอยู่ใต้แผงเสมอ ไม่ใช่ทับแผง', () => {
    expect(css).toContain('.scrim');
    const scrim = css.slice(css.indexOf('.scrim {'), css.indexOf('.scrim {') + 200);
    expect(scrim).toContain('var(--z-overlay)');
    const mmenu = css.slice(css.indexOf('.mmenu {'), css.indexOf('.mmenu {') + 200);
    expect(mmenu).toContain('var(--z-drawer)');
  });
});
