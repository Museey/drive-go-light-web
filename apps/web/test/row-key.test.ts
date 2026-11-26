/**
 * กุญแจประจำบรรทัดของตัวแก้เอกสาร และการเลือกรถตามทะเบียนที่ค้น
 * (ตรวจ 24 พ.ย. 2569 — ลบบรรทัดแล้วคำค้นไปโผล่ผิดแถว · ค้นทะเบียนแล้วได้รถคันแรกของลูกค้า)
 */
import { describe, expect, it } from 'vitest';
import { keyedDoc, keyRows, rowKey, stripRowKeys } from '../src/lib/row-key';
import { vehicleForPlate } from '../src/lib/pick-vehicle';
import { patchLine } from '../src/lib/line-qty';

type Line = { code: string; qty: number };
const real = (l: Line) => l.code !== '';

describe('กุญแจประจำบรรทัด', () => {
  it('ทุกบรรทัดได้กุญแจไม่ซ้ำกัน และบรรทัดที่มีแล้วไม่ถูกเปลี่ยน', () => {
    const first = keyRows<Line>([{ code: 'A', qty: 1 }, { code: 'B', qty: 1 }]);
    const keys = first.map((it, i) => rowKey(it, i));
    expect(new Set(keys).size).toBe(2);

    const more = keyRows<Line>([...first, { code: 'C', qty: 1 }]);
    expect(more.slice(0, 2).map((it, i) => rowKey(it, i))).toEqual(keys);
    expect(new Set(more.map((it, i) => rowKey(it, i))).size).toBe(3);
  });

  it('ไม่มีอะไรต้องเติม คืนอาเรย์ตัวเดิม — หน้าจอจะได้ไม่วาดใหม่โดยไม่จำเป็น', () => {
    const rows = keyRows<Line>([{ code: 'A', qty: 1 }]);
    expect(keyRows(rows)).toBe(rows);
    const doc = { items: rows, note: 'x' };
    expect(keyedDoc(doc)).toBe(doc);
  });

  it('ลบบรรทัดกลาง — บรรทัดที่เลื่อนขึ้นมายังถือกุญแจของตัวเอง ไม่ใช่ของบรรทัดที่ถูกลบ', () => {
    const rows = keyRows<Line>([{ code: 'A', qty: 1 }, { code: 'B', qty: 1 }, { code: 'C', qty: 1 }]);
    const [, kB, kC] = rows.map((it, i) => rowKey(it, i));
    const after = rows.filter((_, i) => i !== 1);
    expect(rowKey(after[1]!, 1)).toBe(kC);
    expect(rowKey(after[1]!, 1)).not.toBe(kB);
  });

  it('แก้ช่องในบรรทัดแล้วกุญแจยังอยู่ (ทางแก้ทุกทางใช้ patchLine)', () => {
    const [row] = keyRows<Line>([{ code: '', qty: 0 }]);
    const k = rowKey(row!, 0);
    expect(rowKey(patchLine(row!, { code: 'OIL' }, real), 0)).toBe(k);
  });

  it('กุญแจไม่ถูกส่งไปบันทึก', () => {
    const rows = keyRows<Line>([{ code: 'A', qty: 2 }]);
    expect(stripRowKeys(rows)).toEqual([{ code: 'A', qty: 2 }]);
    expect(JSON.stringify(stripRowKeys(rows))).not.toContain('_k');
  });
});

describe('เลือกรถตามทะเบียนที่ค้น', () => {
  const cars = [
    { id: 'v1', data: { plateA: '1กก', plateB: '1234' } },
    { id: 'v2', data: { plateA: '2ขข', plateB: '5678' } },
    { id: 'v3', data: { plateA: 'ฮฮ', plateB: '999' } },
  ];

  it('ไม่ได้ค้นด้วยทะเบียน — ได้คันแรกตามเดิม', () => {
    expect(vehicleForPlate(cars, '')!.id).toBe('v1');
    expect(vehicleForPlate(cars, '   ')!.id).toBe('v1');
  });

  it('ค้นด้วยเลขทะเบียนของคันที่สาม — ได้คันที่สาม ไม่ใช่คันแรก', () => {
    expect(vehicleForPlate(cars, '999')!.id).toBe('v3');
    expect(vehicleForPlate(cars, '5678')!.id).toBe('v2');
  });

  it('พิมพ์หมวดกับเลขติดกัน มีเว้นวรรค หรือมีขีด ก็เจอคันเดียวกัน', () => {
    expect(vehicleForPlate(cars, '2ขข5678')!.id).toBe('v2');
    expect(vehicleForPlate(cars, '2ขข 5678')!.id).toBe('v2');
    expect(vehicleForPlate(cars, '2ขข-5678')!.id).toBe('v2');
  });

  it('คำค้นไม่ตรงรถคันไหน (ค้นเจอลูกค้าจากชื่อ) — ถอยไปคันแรก', () => {
    expect(vehicleForPlate(cars, 'สมชาย')!.id).toBe('v1');
  });

  it('ลูกค้าไม่มีรถ — ไม่มีคันให้เลือก', () => {
    expect(vehicleForPlate([], '999')).toBeNull();
  });
});
