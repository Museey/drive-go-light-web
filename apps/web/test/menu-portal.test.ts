/**
 * เมนูที่ลอยทับต้องปิดได้และวางชั้นถูก — ปรับตามโครงใหม่ (เมนูหลักบน + เมนูย่อยซ้าย)
 *
 * โครงเดิมมี "แผงเมนูหล่น" (.mmenu) บนเดสก์ท็อป ที่ถูกยกเลิกแล้ว —
 * ตอนนี้เมนูหลักเป็น "ลิงก์" ที่พาไปหน้าแรกของเมนูนั้นทันที ไม่มีแผงลอยบนจอใหญ่
 * (นี่คือการแก้อาการ "กดเมนูหลักแล้วค้างหน้าเดิม" ที่ผู้ใช้แจ้ง)
 * เหลือของลอยชิ้นเดียวคือ "ลิ้นชัก" บนมือถือ เทสต์นี้จึงเฝ้าลิ้นชักแทน
 *
 * ทดสอบด้วยการอ่านโค้ดจริง เพราะชุดทดสอบนี้ไม่มีตัวเรนเดอร์ React
 * ส่วนการวัดกรอบจริงบนเบราว์เซอร์อยู่ที่ e2e/nav.spec.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const bar = readFileSync(resolve(here, '../src/components/menu-bar.tsx'), 'utf8');
const drawer = readFileSync(resolve(here, '../src/components/nav-drawer.tsx'), 'utf8');
const css = readFileSync(resolve(here, '../src/app/globals.css'), 'utf8');

describe('เมนูหลักเป็นลิงก์ ไม่ใช่แผงที่กางค้างหน้าเดิม', () => {
  it('อ่านไฟล์ได้จริง ไม่ใช่เทียบกับสตริงว่าง', () => {
    expect(bar.length).toBeGreaterThan(500);
  });

  it('ไม่มีแผงเมนูหล่น (.mmenu) บนจอใหญ่แล้ว', () => {
    expect(css).not.toContain('.mmenu');
    /* ปุ่มที่ "กางแผง" ใช้ aria-haspopup="true" — ต้องไม่เหลือในแถบหลัก */
    expect(bar).not.toContain('aria-haspopup="true"');
  });

  it('ปุ่มเมนูหลักในแถบเป็นลิงก์ที่นำทางได้ (แก้อาการค้างหน้าเดิม)', () => {
    /* เมนูหลักเรนเดอร์เป็น <Link className="navbtn" href=...> */
    expect(bar).toMatch(/className="navbtn"[^>]*\shref=/);
  });
});

describe('ลิ้นชัก — ของลอยชิ้นเดียวที่เหลือ ต้องปิดได้และวางชั้นถูก', () => {
  it('มีฉากหลังที่กดแล้วปิด กด Esc ปิดได้ และเป็น dialog จริง', () => {
    expect(drawer).toContain('scrim');
    expect(drawer).toContain('aria-label="ปิดเมนู"');
    expect(drawer).toContain("e.key === 'Escape'");
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal');
  });

  it('ฉากหลังอยู่ใต้ลิ้นชักเสมอ ไม่ใช่ทับลิ้นชัก', () => {
    const scrim = css.slice(css.indexOf('.scrim {'), css.indexOf('.scrim {') + 200);
    expect(scrim).toContain('var(--z-overlay)');
    const dr = css.slice(css.indexOf('.drawer {'), css.indexOf('.drawer {') + 260);
    expect(dr).toContain('var(--z-drawer)');
  });

  /* -webkit-overflow-scrolling: touch เลิกใช้ตั้งแต่ iOS 13 และเป็นตัวที่ทำให้
     WebKit สร้างขอบเขตตัดภาพให้ลูกที่เป็น fixed */
  it('ไม่ใช้ -webkit-overflow-scrolling อีกแล้ว', () => {
    expect(css).not.toMatch(/^\s*-webkit-overflow-scrolling:\s*touch/m);
  });
});
