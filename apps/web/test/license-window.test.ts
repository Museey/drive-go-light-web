/**
 * วันหมดอายุการใช้งาน
 *
 * เรื่องนี้เถียงกับลูกค้าไม่ได้ ถ้าคำนวณผิดวันเดียวก็คือระบบล็อกอู่ออกทั้งที่จ่ายเงินแล้ว
 * หรือแถมฟรีให้ทั้งที่ไม่ได้จ่าย
 */
import { describe, expect, it } from 'vitest';
import {
  addDays, computeLicense, daysBetween, renewalWindow, TRIAL_DAYS,
} from '../src/lib/license-window';

const trial = (today: string, created = '2026-08-01') =>
  computeLicense({ today, tenantCreated: created, latestExpiry: null, plan: null });

const paid = (today: string, until: string) =>
  computeLicense({ today, tenantCreated: '2020-01-01', latestExpiry: until, plan: 'light-yearly' });

describe('ช่วงทดลองใช้', () => {
  it('เปิดอู่วันแรกได้ทดลอง 15 วัน', () => {
    const s = trial('2026-08-01');
    expect(s.mode).toBe('trial');
    expect(s.until).toBe('2026-08-16');
    expect(s.daysLeft).toBe(TRIAL_DAYS);
    expect(s.everPaid).toBe(false);
  });

  it('วันสุดท้ายยังใช้งานได้เต็มวัน ไม่ตัดตอนเข้าวันนั้น', () => {
    const s = trial('2026-08-16');
    expect(s.mode).toBe('trial');
    expect(s.daysLeft).toBe(0);
  });

  it('เลยวันหมดอายุหนึ่งวันคือหมด', () => {
    const s = trial('2026-08-17');
    expect(s.mode).toBe('expired');
    expect(s.daysLeft).toBe(-1);
    expect(s.everPaid).toBe(false);   // ยังไม่เคยจ่าย ข้อความต้องเป็น "หมดทดลอง"
  });
});

describe('อู่ที่จ่ายเงินแล้ว', () => {
  it('ยังไม่ถึงวันหมดอายุคือใช้งานได้', () => {
    const s = paid('2026-08-31', '2027-08-31');
    expect(s.mode).toBe('active');
    expect(s.daysLeft).toBe(365);
    expect(s.plan).toBe('light-yearly');
  });

  it('เลยวันหมดอายุคือขาดต่ออายุ ไม่ใช่หมดทดลอง', () => {
    const s = paid('2026-09-01', '2026-08-31');
    expect(s.mode).toBe('expired');
    expect(s.everPaid).toBe(true);
  });
});

describe('ต่ออายุ', () => {
  it('ต่อล่วงหน้าตอนยังไม่หมด นับต่อจากวันหมดอายุเดิม ไม่เสียวันที่จ่ายไปแล้ว', () => {
    const status = paid('2026-08-31', '2026-12-31');
    const r = renewalWindow(status, '2026-08-31', 1);
    expect(r.startedOn).toBe('2026-08-31');
    expect(r.expiresOn).toBe('2027-12-31');
  });

  it('ต่อหลังหมดอายุ นับใหม่จากวันนี้ ไม่ต้องจ่ายชดเชยวันที่ไม่ได้ใช้', () => {
    const status = paid('2026-08-31', '2026-01-31');
    const r = renewalWindow(status, '2026-08-31', 1);
    expect(r.expiresOn).toBe('2027-08-31');
  });

  it('อู่ที่ยังทดลองอยู่แล้วจ่ายเงิน นับจากวันนี้ ไม่ใช่ต่อท้ายวันทดลอง', () => {
    const status = trial('2026-08-05');
    expect(status.mode).toBe('trial');
    const r = renewalWindow(status, '2026-08-05', 1);
    expect(r.expiresOn).toBe('2027-08-05');
  });

  it('ต่อหลายปีคูณ 365 วันต่อปี', () => {
    const status = paid('2026-08-31', '2026-01-31');
    expect(renewalWindow(status, '2026-08-31', 3).expiresOn).toBe('2029-08-30');
  });
});

describe('การนับวัน', () => {
  it('ข้ามเดือนและปีอธิกสุรทินได้', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('ไม่เพี้ยนตอนข้ามวันเปลี่ยนเวลา — เขตเวลาไทยไม่มี แต่เซิร์ฟเวอร์อาจตั้งเขตอื่น', () => {
    // ปัดเป็นจำนวนวันเต็มไว้แล้ว ต่างกันหนึ่งชั่วโมงจึงไม่ทำให้ผลเปลี่ยน
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
  });
});
