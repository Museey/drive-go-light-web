/** วว/ดด/ปป (พ.ศ.) ↔ ISO — ช่องกำหนดเองของตัวกรองวันที่ทุกหน้า */
import { describe, expect, it } from 'vitest';
import { formatThaiDate, parseThaiDate } from '../src/lib/thai-date';

describe('parseThaiDate', () => {
  it('13/09/69 → 2026-09-13', () => { expect(parseThaiDate('13/09/69')).toBe('2026-09-13'); });
  it('ยอมรับปี 4 หลัก เลขหลักเดียว และตัวคั่น - .', () => {
    expect(parseThaiDate('13/09/2569')).toBe('2026-09-13');
    expect(parseThaiDate('1/9/69')).toBe('2026-09-01');
    expect(parseThaiDate('13-09-69')).toBe('2026-09-13');
    expect(parseThaiDate(' 13.9.69 ')).toBe('2026-09-13');
  });
  it('วันที่ไม่มีจริงหรือรูปผิด → null ไม่เดาให้', () => {
    for (const s of ['31/02/69', '13/13/69', '0/1/69', '2026-09-13', '13/09', 'abc', '']) {
      expect(parseThaiDate(s), s).toBeNull();
    }
  });
});

describe('formatThaiDate', () => {
  it('ISO → วว/ดด/ปป', () => {
    expect(formatThaiDate('2026-09-13')).toBe('13/09/69');
    expect(formatThaiDate('2026-01-05')).toBe('05/01/69');
  });
  it('ไป-กลับได้ค่าเดิม', () => {
    for (const iso of ['2026-09-13', '2025-12-31', '2027-02-28']) {
      expect(parseThaiDate(formatThaiDate(iso))).toBe(iso);
    }
  });
  it('ว่าง/พัง → สตริงว่าง', () => {
    expect(formatThaiDate(null)).toBe(''); expect(formatThaiDate('x')).toBe('');
  });
});
