/** ข้อความนับถอยหลังวันหมดอายุบนแถบเมนู — ต้องบอกสถานะถูกและเป็น พ.ศ. */
import { describe, expect, it } from 'vitest';
import { licenseLine } from '../src/components/license-line';

describe('licenseLine', () => {
  it('ใช้งานปกติ เหลือมาก → โทนปกติ วันที่เป็น พ.ศ.', () => {
    const r = licenseLine({ mode: 'active', until: '2026-10-10', daysLeft: 27 });
    expect(r.text).toBe('ใช้ได้อีก 27 วัน (ถึง 10 ต.ค. 2569)');
    expect(r.tone).toBe('warn');   // 27 วัน ≤ 30 → อำพัน (ผู้ใช้กำหนด 30 วันก่อนหมด)
  });
  it('เหลือ ≤30 วัน → เตือนสีอำพัน · เกิน 30 → ปกติ (เขียว)', () => {
    expect(licenseLine({ mode: 'active', until: '2026-09-20', daysLeft: 7 }).tone).toBe('warn');
    expect(licenseLine({ mode: 'active', until: '2026-10-13', daysLeft: 30 }).tone).toBe('warn');
    expect(licenseLine({ mode: 'active', until: '2026-10-14', daysLeft: 31 }).tone).toBe('');
  });
  it('ทดลองใช้ → ขึ้นต้นว่าทดลองใช้', () => {
    expect(licenseLine({ mode: 'trial', until: '2026-10-01', daysLeft: 18 }).text)
      .toMatch(/^ทดลองใช้ เหลือ 18 วัน/);
  });
  it('หมดอายุ → สีแดง บอกจำนวนวันที่เลยมา และชี้ไป 08 ลิขสิทธิ์', () => {
    const r = licenseLine({ mode: 'expired', until: '2026-09-01', daysLeft: -12 });
    expect(r.tone).toBe('due');
    expect(r.text).toContain('หมดอายุแล้ว 12 วัน');
    expect(r.text).toContain('08 ลิขสิทธิ์');
  });
});
