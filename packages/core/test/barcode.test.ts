/**
 * บาร์โค้ด Code 39 — เทียบกับ barcodeSVG ของรุ่น 6.4 โดยตรง
 *
 * ฉลากที่พิมพ์ออกมาต้องยิงได้ด้วยปืนตัวเดิมที่อู่ใช้อยู่
 * ผิดหนึ่งแถบคือทั้งม้วนที่พิมพ์ไปแล้วใช้ไม่ได้ และไม่มีทางรู้จนกว่าจะไปยืนยิงหน้าชั้นวาง
 *
 *   DGL_LEGACY_HTML=legacy/drivegolight-6.4-cloud.html npx vitest run --root packages/core
 *
 * ถ้าไม่ได้ชี้ไปไฟล์ 6.4 ส่วนที่เทียบกับของเดิมจะข้ามไปเอง เพราะรุ่น 3.6 ยังไม่มีบาร์โค้ด
 */
import { describe, expect, it } from 'vitest';
import { makeLegacy } from './legacy.generated.mjs';
import { C39, barcodeSVG, genBarcode } from '../src/index.js';

const legacy = makeLegacy({
  shop: { vatRate: 7 }, invoices: [], receipts: [], purchases: [], expenses: [],
}) as Record<string, unknown>;
const hasBarcode = typeof legacy.barcodeSVG === 'function';
const L = legacy as unknown as {
  barcodeSVG: (t: string, w: number, h: number) => string;
  C39: Record<string, string>;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ALPHABET = Object.keys(C39).filter((k) => k !== '*');
/* ตัวที่ Code 39 เข้ารหัสไม่ได้ ต้องถูกตัดทิ้งเหมือนกันทั้งสองฝั่ง */
const JUNK = 'abcdefz/@#$%^&()_+=[]{}|\\:;"\'<>,?~`กข๛';

describe.skipIf(!hasBarcode)('บาร์โค้ดตรงกับรุ่น 6.4', () => {
  it('ทุกตัวอักษรที่ Code 39 รองรับ ให้แถบเดียวกัน', () => {
    for (const ch of ALPHABET) {
      expect(barcodeSVG(ch, 230, 48), `ตัวอักษร ${JSON.stringify(ch)}`)
        .toBe(L.barcodeSVG(ch, 230, 48));
    }
  });

  it('ตาราง C39 ตรงกันทุกช่อง', () => {
    expect(C39).toEqual(L.C39);
    expect(Object.keys(C39)).toHaveLength(40);
  });

  it('ข้อความสุ่ม 200 ชุดให้ SVG ตรงกันทุกตัวอักษร', () => {
    const rand = rng(77);
    for (let i = 0; i < 200; i++) {
      const len = 1 + Math.floor(rand() * 16);
      let t = '';
      for (let j = 0; j < len; j++) {
        const pool = rand() < 0.8 ? ALPHABET.join('') : JUNK;
        t += pool[Math.floor(rand() * pool.length)];
      }
      const w = 80 + Math.floor(rand() * 400);
      const h = 20 + Math.floor(rand() * 60);
      expect(barcodeSVG(t, w, h), `ข้อความ ${JSON.stringify(t)} ${w}×${h}`)
        .toBe(L.barcodeSVG(t, w, h));
    }
  });

  it('ตัวพิมพ์เล็กถูกแปลงเป็นพิมพ์ใหญ่เหมือนกัน', () => {
    expect(barcodeSVG('dg12ab', 230, 48)).toBe(L.barcodeSVG('dg12ab', 230, 48));
    expect(barcodeSVG('dg12ab', 230, 48)).toBe(barcodeSVG('DG12AB', 230, 48));
  });

  it('ข้อความว่างยังได้ตัวคั่นหัวท้ายเหมือนกัน ไม่พังทั้งคู่', () => {
    expect(barcodeSVG('', 230, 48)).toBe(L.barcodeSVG('', 230, 48));
  });
});

describe('บาร์โค้ดที่ออกให้อัตโนมัติ', () => {
  it('ขึ้นต้นด้วย DG และเป็นตัวอักษรที่ Code 39 อ่านได้ทั้งหมด', () => {
    const rand = rng(5);
    for (let i = 0; i < 500; i++) {
      const b = genBarcode(1_700_000_000_000 + Math.floor(rand() * 1e10), rand);
      expect(b).toMatch(/^DG[0-9A-Z]{8}$/);
      for (const ch of b) expect(C39[ch], `ตัวอักษร ${ch}`).toBeDefined();
    }
  });

  it('เวลาและตัวสุ่มชุดเดิมให้ผลเดิมเสมอ', () => {
    expect(genBarcode(1_700_000_000_000, () => 0.5))
      .toBe(genBarcode(1_700_000_000_000, () => 0.5));
  });

  it('ออกติด ๆ กันแล้วไม่ซ้ำ — เวลาต่างกันแค่มิลลิวินาทีเดียวก็พอ', () => {
    const rand = rng(9);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(genBarcode(1_700_000_000_000 + i, rand));
    /* ยอมให้ชนกันได้บ้างเพราะมีตัวสุ่มสองหลัก แต่ต้องไม่ใช่ชนกันเป็นกลุ่ม */
    expect(seen.size).toBeGreaterThan(1990);
  });
});
