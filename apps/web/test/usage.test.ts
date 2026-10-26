/**
 * เกณฑ์การใช้งานของอู่ในคอนโซล — lib/usage.ts ไม่ต้องต่อฐานข้อมูล
 */
import { describe, expect, it } from 'vitest';
import { agoLabel, lastUsed, needsFollowUp, quietDays, usageLevel } from '../src/lib/usage';

const NOW = new Date('2026-10-26T12:00:00+07:00');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe('การใช้งานของอู่', () => {
  it('จัดกลุ่มตามเวลาที่เงียบไป', () => {
    expect(usageLevel(null, NOW)).toBe('never');
    expect(usageLevel(ago(3 * HOUR), NOW)).toBe('fresh');
    expect(usageLevel(ago(DAY), NOW), 'ครบ 24 ชม.พอดียังนับว่าใช้อยู่').toBe('fresh');
    expect(usageLevel(ago(3 * DAY), NOW)).toBe('idle');
    expect(usageLevel(ago(7 * DAY), NOW)).toBe('idle');
    expect(usageLevel(ago(8 * DAY), NOW)).toBe('dormant');
  });

  it('ใช้ล่าสุด = เวลาที่ใหม่กว่าระหว่างเข้าระบบกับสร้างเอกสาร', () => {
    expect(lastUsed(null, null)).toBeNull();
    expect(lastUsed(ago(5 * DAY), ago(2 * DAY))).toBe(ago(2 * DAY));
    expect(lastUsed(ago(HOUR), null)).toBe(ago(HOUR));
  });

  it('ข้อความกี่วันก่อน', () => {
    expect(agoLabel(null, NOW)).toBe('—');
    expect(agoLabel(ago(2 * MIN), NOW)).toBe('เมื่อสักครู่');
    expect(agoLabel(ago(35 * MIN), NOW)).toBe('35 นาทีก่อน');
    expect(agoLabel(ago(3 * HOUR), NOW)).toBe('3 ชม.ก่อน');
    expect(agoLabel(ago(30 * HOUR), NOW)).toBe('เมื่อวาน');
    expect(agoLabel(ago(12 * DAY), NOW)).toBe('12 วันก่อน');
    expect(agoLabel(ago(130 * DAY), NOW)).toBe('4 เดือนก่อน');
  });

  it('ควรโทรตาม — เฉพาะช่วงทดลองใช้ที่เงียบตั้งแต่ 3 วัน หรือยังไม่เคยเข้า', () => {
    expect(needsFollowUp('trial', null, NOW)).toBe(true);
    expect(needsFollowUp('trial', ago(2 * DAY), NOW)).toBe(false);
    expect(needsFollowUp('trial', ago(3 * DAY), NOW)).toBe(true);
    expect(needsFollowUp('active', ago(30 * DAY), NOW), 'อู่ที่จ่ายแล้วดูจากตัวกรองเงียบเกิน 7 วันแทน').toBe(false);
    expect(quietDays(ago(DAY + HOUR), NOW)).toBe(1);
  });
});
