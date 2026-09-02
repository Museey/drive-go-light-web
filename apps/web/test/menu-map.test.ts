/**
 * ผังเมนูต้องตรงกับรุ่น 6.4 ทุกช่อง
 *
 * เลขกำกับ ชื่อแท็บ และไอคอน เป็นของที่พิมพ์ผิดได้ง่ายและไม่มีใครสังเกต
 * จนกว่าผู้ใช้เดิมจะกด 05.3 แล้วไปโผล่ผิดที่ เทสต์นี้อ่านจากไฟล์ต้นฉบับโดยตรง
 * ไม่ได้ลอกค่าที่คาดหวังมาไว้ในเทสต์ — ถ้าลอกมาก็ไม่ได้เทียบกับอะไร
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLANK_FORM, MENU } from '../src/components/menu-map';
import { ICON_NAMES } from '../src/components/icon';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, '../../../legacy/drivegolight-6.4-cloud.html');
const html = readFileSync(SOURCE, 'utf8');

/** อ่านออบเจกต์ const ชื่อ ... = { ... }; ออกมาเป็นข้อความ */
function block(name: string): string {
  const start = html.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`ไม่พบ ${name} ในไฟล์ต้นฉบับ`);
  const end = html.indexOf('\n};', start);
  return html.slice(start, end);
}

/** ชุดแท็บย่อย เช่น INCOME_TABS = [['quote','03.1','ใบเสนอราคา…'], …] */
function tabs(name: string): [string, string, string][] {
  const start = html.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`ไม่พบ ${name}`);
  const end = html.indexOf('\n];', start);
  const body = html.slice(start, end);
  return [...body.matchAll(/\['([a-z]+)',\s*'([\d.]+)',\s*'([^']*)'\]/g)]
    .map((m) => [m[1]!, m[2]!, m[3]!]);
}

const menuIcon = Object.fromEntries(
  [...block('MENU_ICON').matchAll(/(\w+):\{ic:'([^']+)',c:'([^']+)'\}/g)]
    .map((m) => [m[1]!, { ic: m[2]!, c: m[3]! }]),
);
const subIcon = Object.fromEntries(
  [...block('SUB_ICON').matchAll(/'([\w:]+)':\{ic:'([^']+)',c:'([^']+)'\}/g)]
    .map((m) => [m[1]!, { ic: m[2]!, c: m[3]! }]),
);
const subDesc = Object.fromEntries(
  [...block('SUB_DESC').matchAll(/'([\w:]+)':'([^']*)'/g)].map((m) => [m[1]!, m[2]!]),
);
const menuDesc = Object.fromEntries(
  [...block('MENU_DESC').matchAll(/(\w+):'([^']*)'/g)].map((m) => [m[1]!, m[2]!]),
);

const TAB_SETS: Record<string, string> = {
  customer: 'CUSTOMER_TABS',
  income: 'INCOME_TABS',
  expense: 'EXPENSE_TABS',
  stock: 'STOCK_TABS',
  finance: 'FIN_TABS',
  settings: 'SETTINGS_TABS',
};

describe('ผังเมนูเทียบกับรุ่น 6.4', () => {
  it('อ่านค่าจากไฟล์ต้นฉบับได้จริง ไม่ใช่เทียบกับค่าว่าง', () => {
    expect(Object.keys(menuIcon).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(subIcon).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(subDesc).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(menuDesc).length).toBeGreaterThanOrEqual(9);
  });

  it('ไอคอนและสีของเมนูหลักตรงกันทุกเมนู', () => {
    for (const m of [...MENU, BLANK_FORM]) {
      const want = menuIcon[m.key];
      expect(want, `ไม่มี ${m.key} ใน MENU_ICON`).toBeTruthy();
      expect({ key: m.key, ic: m.icon, c: m.color })
        .toEqual({ key: m.key, ic: want!.ic, c: want!.c });
    }
  });

  it('คำอธิบายเมนูหลักตรงกัน', () => {
    for (const m of [...MENU, BLANK_FORM]) {
      expect(m.desc, `คำอธิบายของ ${m.key}`).toBe(menuDesc[m.key]);
    }
  });

  it('เลขกำกับและชื่อแท็บย่อยตรงกับชุดแท็บของต้นฉบับ', () => {
    for (const [menuKey, setName] of Object.entries(TAB_SETS)) {
      const ours = MENU.find((m) => m.key === menuKey)?.subs ?? [];
      const theirs = tabs(setName);

      expect(ours.map((s) => [s.key, s.no, s.label]), `แท็บของเมนู ${menuKey}`)
        .toEqual(theirs);
    }
  });

  it('ไอคอน สี และคำอธิบายของแท็บย่อยตรงกันทุกช่อง', () => {
    for (const m of MENU) {
      for (const s of m.subs ?? []) {
        const k = `${m.key}:${s.key}`;
        expect(subIcon[k], `ไม่มี ${k} ใน SUB_ICON`).toBeTruthy();
        expect({ ic: s.icon, c: s.color, d: s.desc })
          .toEqual({ ic: subIcon[k]!.ic, c: subIcon[k]!.c, d: subDesc[k] });
      }
    }
  });

  it('ไอคอนทุกตัวที่ผังอ้างถึงมีอยู่จริงในชุดไอคอน', () => {
    const used = [...MENU.flatMap((m) => [m.icon, ...(m.subs ?? []).map((s) => s.icon)]),
                  BLANK_FORM.icon];
    const missing = used.filter((i) => !ICON_NAMES.includes(i));
    expect(missing).toEqual([]);
  });

  it('ทุกแท็บของรุ่น 6.4 ทำครบแล้ว ไม่มีแท็บจางเหลือ', () => {
    const todo = MENU.flatMap((m) => (m.subs ?? []).filter((s) => s.todo).map((s) => s.no));
    expect(todo).toEqual([]);
  });
});
