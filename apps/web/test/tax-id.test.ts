/**
 * ช่องเลขประจำตัวผู้เสียภาษี 13 ช่องแบบแบบฟอร์มสรรพากร (ผู้ใช้กำหนด 19 ก.ย. 2569)
 * ตัวจัดค่าอยู่ตรงนี้เพื่อให้ทดสอบได้โดยไม่ต้องผ่านเบราว์เซอร์
 */
import { describe, expect, it } from 'vitest';
import { TAX_ID_LEN, taxIdBoxes, taxIdDigits } from '../src/lib/tax-id';

describe('เลขประจำตัวผู้เสียภาษี', () => {
  it('ยาว 13 หลักตามกรมสรรพากร', () => {
    expect(TAX_ID_LEN).toBe(13);
  });

  it('เก็บเฉพาะตัวเลข — วางมาแบบมีขีดหรือเว้นวรรคก็ใช้ได้', () => {
    expect(taxIdDigits('0-1055-61000-44-4')).toBe('0105561000444');
    expect(taxIdDigits('0105 5610 00444')).toBe('0105561000444');
    expect(taxIdDigits('เลขที่ 0105561000444')).toBe('0105561000444');
  });

  it('ยาวเกิน 13 ตัดทิ้ง ไม่ให้ล้นช่อง', () => {
    expect(taxIdDigits('01055610004449999')).toBe('0105561000444');
  });

  it('กระจายลงช่องได้ครบ 13 ช่องเสมอ ช่องที่ยังไม่มีเลขเป็นค่าว่าง', () => {
    expect(taxIdBoxes('0105561000444')).toEqual('0105561000444'.split(''));
    const partial = taxIdBoxes('010');
    expect(partial).toHaveLength(13);
    expect(partial.slice(0, 3)).toEqual(['0', '1', '0']);
    expect(partial.slice(3).every((c) => c === '')).toBe(true);
  });

  it('ค่าว่างหรือค่าที่ไม่มีตัวเลขเลย ได้ช่องว่างทั้งแถว', () => {
    expect(taxIdBoxes('')).toEqual(Array(13).fill(''));
    expect(taxIdBoxes('ไม่มี')).toEqual(Array(13).fill(''));
    expect(taxIdDigits(null)).toBe('');
    expect(taxIdDigits(undefined)).toBe('');
  });
});
