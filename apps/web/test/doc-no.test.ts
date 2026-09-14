/** เลขที่เอกสารรูปแบบใหม่ — คำนำหน้า + ปปดดวว (พ.ศ.) + ลำดับ 4 หลัก รีเซ็ตรายเดือน */
import { describe, expect, it } from 'vitest';
import { docNoPeriod, formatDocNo } from '../src/lib/doc-no';

describe('formatDocNo', () => {
  it('ตัวอย่างจากผู้ใช้: 13 ก.ย. 2569 ใบที่ 7 → QT6909130007', () => {
    expect(formatDocNo('QT', '2026-09-13', 7)).toBe('QT6909130007');
  });
  it('ปีเป็น พ.ศ. 2 หลักท้าย ไม่ใช่ ค.ศ.', () => {
    expect(formatDocNo('RC', '2026-01-05', 1)).toBe('RC6901050001');
    expect(formatDocNo('RC', '2031-12-31', 42)).toBe('RC7412310042');   // 2574
  });
  it('คำนำหน้ายาว/สั้นต่างกันได้ ลำดับเต็ม 4 หลักเสมอ', () => {
    expect(formatDocNo('IVT', '2026-03-01', 1234)).toBe('IVT6903011234');
    expect(formatDocNo('BN', '2026-03-31', 9999)).toBe('BN6903319999');
  });
  it('ลำดับต้องเป็นจำนวนเต็มบวก', () => {
    expect(() => formatDocNo('QT', '2026-09-13', 0)).toThrow();
    expect(() => formatDocNo('QT', '2026-09-13', 1.5)).toThrow();
  });
});

describe('docNoPeriod — คีย์รีเซ็ตรายเดือน', () => {
  it('เดือนเดียวกันได้คีย์เดียวกัน คนละเดือนได้คนละคีย์', () => {
    expect(docNoPeriod('2026-09-01')).toBe('6909');
    expect(docNoPeriod('2026-09-30')).toBe('6909');
    expect(docNoPeriod('2026-10-01')).toBe('6910');
  });
  it('วันที่พังต้อง throw ไม่ปล่อยเลขเพี้ยนออกไป', () => {
    expect(() => docNoPeriod('')).toThrow();
    expect(() => docNoPeriod('2026-9')).toThrow();
  });
});
