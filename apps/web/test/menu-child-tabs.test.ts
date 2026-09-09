/**
 * แท็บลูก (เช่น 03.2.1) ต้องใช้สิทธิ์ของแท็บแม่ ไม่มีสิทธิ์ของตัวเอง
 *
 * ถ้าวันหนึ่งมีคนให้แท็บลูกมีสิทธิ์เป็นของตัวเอง พนักงานเดิมทุกคนที่เคยติ๊ก
 * สิทธิ์รายแท็บไว้จะถูกซ่อนแท็บลูกทันที และไม่มีข้อความบอกว่าทำไม —
 * เพราะ canTab ถือว่าคีย์ที่ไม่มีในตารางสิทธิ์ = ไม่อนุญาต ไม่ใช่ยังไม่ได้ตั้ง
 *
 * ความเสียหายจะไปโผล่ที่หน้าจอของอู่ ไม่ใช่ที่นี่ เทสต์นี้จึงต้องแดงแทน
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MENU, SUB_ITEMS, SUB_KEYS, permSubKey, type SubItem } from '../src/components/menu-map';
import { canTab, tabKey, type PermKey, type PermSubject } from '../src/lib/perms';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');

/** แท็บลูกทั้งหมดในผัง คู่กับเมนูที่มันอยู่ */
const children: { menu: (typeof MENU)[number]; sub: SubItem }[] =
  MENU.flatMap((m) => (m.subs ?? []).filter((s) => s.parent).map((sub) => ({ menu: m, sub })));

describe('แท็บลูกในผังเมนู', () => {
  it('มีแท็บลูกอยู่จริง — ไม่งั้นเทสต์ข้างล่างไม่ได้ทดสอบอะไรเลย', () => {
    expect(children.length).toBeGreaterThan(0);
    expect(children.map((c) => c.sub.no)).toContain('03.2.1');
  });

  it('parent ของแท็บลูกชี้ไปที่แท็บพี่น้องที่มีอยู่จริง และแท็บแม่ไม่ใช่ลูกซ้อนลูก', () => {
    for (const { menu, sub } of children) {
      const parent = (menu.subs ?? []).find((s) => s.key === sub.parent);
      expect(parent, `${menu.key}:${sub.key} อ้าง parent '${sub.parent}' ที่ไม่มีในเมนูเดียวกัน`)
        .toBeTruthy();
      expect(parent!.parent, `${menu.key}:${sub.parent} เป็นลูกอีกที — ผังนี้รับแค่ชั้นเดียว`)
        .toBeUndefined();
    }
  });

  it('เลขกำกับของลูกขึ้นต้นด้วยเลขของแม่', () => {
    for (const { menu, sub } of children) {
      const parent = (menu.subs ?? []).find((s) => s.key === sub.parent)!;
      expect(sub.no.startsWith(parent.no + '.'), `${sub.no} ควรขึ้นต้นด้วย ${parent.no}.`).toBe(true);
    }
  });

  it('แท็บลูกไม่โผล่ในตารางติ๊กสิทธิ์ — ติ๊กแล้วไม่มีผลคือหลอกคนตั้งค่า', () => {
    for (const { menu, sub } of children) {
      const perm = menu.perm as string;
      expect(SUB_KEYS[perm] ?? [], `${perm} ไม่ควรมีแท็บลูก ${sub.key}`).not.toContain(sub.key);
      expect((SUB_ITEMS[perm] ?? []).map((s) => s.key)).not.toContain(sub.key);
    }
  });

  it('permSubKey คืนคีย์ของแม่ให้ลูก และคืนตัวเองให้แท็บธรรมดา', () => {
    for (const { sub } of children) expect(permSubKey(sub)).toBe(sub.parent);
    for (const m of MENU) {
      for (const s of (m.subs ?? []).filter((x) => !x.parent)) expect(permSubKey(s)).toBe(s.key);
    }
  });
});

describe('พนักงานที่ติ๊กสิทธิ์รายแท็บไว้', () => {
  it('เห็นแท็บลูกถ้าเห็นแท็บแม่ — และคีย์ดิบของลูกใช้ไม่ได้ ซึ่งคือเหตุผลที่ permSubKey มีอยู่', () => {
    for (const { menu, sub } of children) {
      const perm = menu.perm as PermKey;

      /* ติ๊กเฉพาะแท็บแม่ ปิดพี่น้องที่เหลือ — สภาพเดียวกับพนักงานที่ถูกตั้งสิทธิ์ละเอียด */
      const tabs: Record<string, boolean> = {};
      for (const s of menu.subs ?? []) tabs[tabKey(perm, s.key)] = s.key === sub.parent;
      const staff: PermSubject = { role: 'staff', perms: { menus: { [perm]: true }, tabs } };

      expect(canTab(staff, perm, permSubKey(sub)), `${menu.key}:${sub.key} ควรเห็น`).toBe(true);
      expect(canTab(staff, perm, sub.key), `คีย์ดิบของ ${sub.key} ต้องใช้ไม่ได้`).toBe(false);
    }
  });

  it('ไม่เห็นแท็บลูกถ้าปิดแท็บแม่', () => {
    for (const { menu, sub } of children) {
      const perm = menu.perm as PermKey;
      const tabs: Record<string, boolean> = {};
      for (const s of menu.subs ?? []) tabs[tabKey(perm, s.key)] = false;
      const staff: PermSubject = { role: 'staff', perms: { menus: { [perm]: true }, tabs } };

      expect(canTab(staff, perm, permSubKey(sub))).toBe(false);
    }
  });
});

describe('ทุกที่ที่กรองแท็บด้วยสิทธิ์', () => {
  /** ไล่ไฟล์เองแทนการเขียนรายชื่อไว้ — ไฟล์ใหม่ที่ลืมจะโดนจับด้วย */
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return sources(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  it('ไล่ไฟล์ได้จริง ไม่ใช่ลิสต์ว่าง', () => {
    expect(sources(SRC).length).toBeGreaterThan(50);
  });

  /**
   * `canTab(…, บางอย่าง.key)` — ส่งคีย์ของแท็บเข้าไปตรง ๆ
   *
   * ดูรูปคำสั่งจริง ไม่ใช่ดูว่าไฟล์เอ่ยชื่อ permSubKey หรือเปล่า
   * เพราะแค่ import ไว้เฉย ๆ ก็ทำให้การตรวจแบบหลังผ่านได้ทั้งที่โค้ดยังผิด
   * (เคยเขียนแบบนั้นแล้วการกลายพันธุ์รอด — เทสต์ที่ฆ่าไม่ได้ก็ไม่ได้คุ้มครองอะไร)
   */
  const RAW_KEY = /canTab\([^()]*\.key\s*\)/;

  it('รูปแบบที่ใช้จับ ตรงกับคำสั่งที่ผิดจริง', () => {
    expect(RAW_KEY.test('canTab(session, m.perm as PermKey, sub.key)')).toBe(true);
    expect(RAW_KEY.test('canTab(session, m.perm as PermKey, permSubKey(sub))')).toBe(false);
  });

  it('ไฟล์ที่ไล่ .subs เองต้องเรียก canTab ผ่าน permSubKey ไม่ใช่ส่ง .key ตรง ๆ', () => {
    /*
     * ดูเฉพาะไฟล์ที่ไล่ `.subs` ซึ่งเป็นรายการดิบที่มีแท็บลูกปนอยู่
     * ส่วนไฟล์ที่ใช้ SUB_ITEMS ไม่ต้องระวัง เพราะกรองแท็บลูกออกไปแล้วตั้งแต่ต้นทาง
     * และมีเทสต์ข้างบนบังคับไว้ว่าต้องไม่มีลูกหลุดเข้าไป
     */
    const offenders = sources(SRC).filter((f) => {
      const text = readFileSync(f, 'utf8');
      return text.includes('.subs') && RAW_KEY.test(text);
    });

    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});
