/**
 * แผนภูมิสรุปยอดขายหน้าแรก — แต่ละเดือนสีเข้ม-อ่อนต่างกัน (ผู้ใช้กำหนด)
 * เดิมเดือนปัจจุบันเขียว เดือนอื่นเทาเท่ากันหมด แยกไม่ออกว่าแท่งไหนเดือนไหน
 */
import { describe, expect, it } from 'vitest';
import { BAR_SHADES, barShade } from '../src/components/sales-bars';

/** ความสว่างของสี (0 มืด – 255 สว่าง) */
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

describe('สีแท่งยอดขายรายเดือน', () => {
  it('หกเดือนได้หกสีไม่ซ้ำกัน', () => {
    const colors = Array.from({ length: 6 }, (_, i) => barShade(i, 6));
    expect(new Set(colors).size).toBe(6);
  });

  it('ไล่จากอ่อน (เดือนเก่าสุด) ไปเข้ม (เดือนปัจจุบัน)', () => {
    const l = Array.from({ length: 6 }, (_, i) => lum(barShade(i, 6)));
    for (let i = 1; i < l.length; i++) expect(l[i], `แท่งที่ ${i + 1}`).toBeLessThan(l[i - 1]!);
  });

  it('เดือนปัจจุบันเข้มสุดเสมอ แม้ข้อมูลไม่ครบหกเดือน', () => {
    const darkest = BAR_SHADES[BAR_SHADES.length - 1];
    for (const n of [1, 2, 3, 6]) expect(barShade(n - 1, n), `${n} เดือน`).toBe(darkest);
    expect(new Set([0, 1, 2].map((i) => barShade(i, 3))).size).toBe(3);
  });
});
