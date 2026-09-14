/**
 * ฟอร์มเอกสารขายแบบใหม่ (13 ก.ย. 69) — โครงที่ตกลงกับผู้ใช้ ต้องไม่หลุดไปเงียบ ๆ
 * อ่านโค้ดจริง (ชุดนี้ไม่มีตัวเรนเดอร์ React)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../src/app/income/doc-editor.tsx'), 'utf8');
const confirm = readFileSync(resolve(here, '../src/components/confirm-save.tsx'), 'utf8');
const css = readFileSync(resolve(here, '../src/app/globals.css'), 'utf8');

describe('โครงฟอร์ม', () => {
  it('หัวและท้ายเอกสารเป็นสองคอลัมน์ (.docgrid) และมี CSS รองรับ', () => {
    expect((src.match(/className="docgrid"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(css).toMatch(/\.docgrid \{ display: grid/);
  });
  it('ใบเสนอราคายังมี "อาการที่แจ้ง" และ "อาการที่พบ"', () => {
    expect(src).toContain('อาการที่แจ้ง');
    expect(src).toContain('อาการที่พบ');
    expect(src).toMatch(/\(\['complaints', 'findings'\] as const\)/);
  });
  it('ตารางเปิดมามี 5 บรรทัดว่าง และเติมกลับเมื่อลบจนต่ำกว่า', () => {
    expect(src).toContain('const MIN_ROWS = 5;');
    expect(src).toMatch(/removeRow = .*padRows\(/s);
  });
  it('ค้นหาสินค้าในบรรทัด — ผลเป็นแถวใต้บรรทัด ราว 5 แถว ไม่ลอย', () => {
    expect(src).toContain('className="hitrow"');
    expect(src).toMatch(/hitrow[\s\S]*?className="tablewrap hits5"/);
    expect(src).not.toMatch(/position:\s*'?absolute'?/);
  });
  it('มีคอลัมน์ส่วนลด % รายบรรทัด และส่วนลดท้ายบิลสลับ %/บาท', () => {
    expect(src).toContain('ส่วนลด %');
    expect(src).toContain('className="pctswitch"');
    expect(src).toMatch(/set\('discountMode', m\)/);
  });
  it('ยิงบาร์โค้ดได้ทุกชนิดเอกสาร (ScanBox ไม่ถูกจำกัดด้วยชนิด)', () => {
    expect(src).toContain('<ScanBox onScan={onScan} />');
    expect(src).not.toMatch(/\{!isQuote \? \(\s*<ScanBox/);
  });
  it('บรรทัดว่างไม่ถูกส่งไปบันทึก', () => {
    expect(src).toMatch(/JSON\.stringify\(\{ \.\.\.doc, items: realItems \}\)/);
  });
});

describe('แผงยืนยันบันทึก "ตรวจสอบถูกต้องแล้ว:"', () => {
  it('ปุ่มบันทึกในฟอร์มเป็น type=button เปิดแผง · ปุ่ม submit จริงอยู่ในแผง', () => {
    /* ปุ่มบันทึกเป็น type=button ที่ตรวจเงื่อนไขก่อนแล้วค่อยเปิดแผง (tryConfirm → setConfirm(true)) */
    expect(src).toMatch(/type="button" onClick=\{\(\) => \{ setPrintAfter\(false\); tryConfirm\(\); \}\}/);
    /* ปุ่มพิมพ์เอกสาร (อำพัน) อยู่ข้างปุ่มบันทึก */
    expect(src).toMatch(/className="btn amber"[^>]*>🖨 พิมพ์เอกสาร/);
    expect(src).toMatch(/if \(!bad\) setConfirm\(true\)/);
    expect(src).toContain('<ConfirmSave');
    expect(confirm).toContain('ตรวจสอบถูกต้องแล้ว:');
    expect(confirm).toMatch(/className="btn ok" type="submit"/);
    expect(confirm).toMatch(/className="btn amber" type="button"/);
  });
  it('Enter ในช่องกรอกไม่ส่งฟอร์มข้ามแผง', () => {
    expect(src).toMatch(/e\.key === 'Enter' && el\.tagName === 'INPUT'\) e\.preventDefault\(\)/);
  });
  it('แผงอยู่ชั้นลิ้นชัก มีฉากหลังกดปิด และสีปุ่มตามที่ขอ (เขียว/อำพัน)', () => {
    expect(css).toMatch(/\.confirm \{[^}]*z-index: var\(--z-drawer\)/);
    expect(confirm).toContain('className="scrim"');
    expect(css).toMatch(/\.btn\.ok \{[^}]*background: var\(--ok\)/);
    expect(css).toMatch(/\.btn\.amber \{[^}]*background: var\(--accent\)/);
  });
});
