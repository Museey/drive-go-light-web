/** ขั้นตอน A→B→C — ขั้นปัจจุบันสีเข้ม ขั้นถัดไปอำพันกดได้ ผ่านมาแล้วมีเลขที่ (เจ๊ก ข้อ 4, 5, 7) */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../src/components/doc-steps.tsx'), 'utf8');
const css = readFileSync(resolve(here, '../src/app/globals.css'), 'utf8');
const detail = readFileSync(resolve(here, '../src/app/income/[id]/page.tsx'), 'utf8');
const editor = readFileSync(resolve(here, '../src/app/income/doc-editor.tsx'), 'utf8');

describe('DocSteps', () => {
  it('สามขั้น A/B/C และ B แยก B.1/B.2', () => {
    expect(src).toContain("{ key: 'A', label: 'ใบเสนอราคา'");
    expect(src).toContain("sub: 'B.1 ใบกำกับภาษี · B.2 ใบแจ้งหนี้'");
    expect(src).toContain("{ key: 'C', label: 'ใบเสร็จรับเงิน'");
  });
  it('ขั้นถัดไปเป็นลิงก์ออกใบต่อ (IVT ถ้ายังไม่ส่งมอบ / RC ถ้าส่งมอบแล้ว)', () => {
    expect(src).toMatch(/href = `\/income\/new\?kind=\$\{i === 1 \? 'IVT' : 'RC'\}&from=\$\{id\}`/);
  });
  it('สีตามที่ตกลง: ปัจจุบันเขียวเข้ม · ถัดไปอำพัน · ผ่านแล้วขอบเขียว · พื้นขาว', () => {
    expect(css).toMatch(/\.step\.current \{ background: var\(--steel-dk\)/);
    expect(css).toMatch(/\.step\.next \{ background: var\(--accent\)/);
    expect(css).toMatch(/\.step\.done \{ border-color: var\(--ok\)/);
    expect(css).toMatch(/\.steps \{[^}]*background: #fff/);
  });
  it('ใช้ทั้งหน้าเอกสาร (รู้แม่/ลูก) และในฟอร์ม', () => {
    expect(detail).toContain('<DocSteps kind={doc.kind} id={id}');
    expect(detail).toContain('childOf(id)');
    expect(editor).toContain('<DocSteps kind={doc.kind} canContinue={false} />');
  });
});
