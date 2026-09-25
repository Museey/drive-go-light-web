/**
 * เพดานจำนวนครั้งของทางเข้าที่ไม่ต้องล็อกอิน
 * (ตรวจความปลอดภัย 24 ก.ย. 2569 — reportClientError เขียนฐานข้อมูลได้ไม่จำกัด)
 */
import { describe, expect, it } from 'vitest';
import { callerIp, RateLimiter } from '../src/lib/rate-limit';

describe('RateLimiter', () => {
  it('ยอมให้ถึงเพดาน แล้วปฏิเสธครั้งถัดไป', () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 });
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('a', 0).ok).toBe(false);
  });

  it('บอกโควตาที่เหลือ', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.check('a', 0).remaining).toBe(1);
    expect(rl.check('a', 0).remaining).toBe(0);
  });

  it('ขึ้นช่วงเวลาใหม่แล้วเริ่มนับใหม่', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('a', 999).ok).toBe(false);
    expect(rl.check('a', 1000).ok).toBe(true);
  });

  it('แต่ละกุญแจนับแยกกัน — คนก่อกวนหนึ่งรายไม่ปิดทางคนอื่น', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('a', 0).ok).toBe(false);
    expect(rl.check('b', 0).ok).toBe(true);
  });

  /** ข้อสำคัญที่สุด — ตัวจำกัดอัตราที่จำทุกกุญแจไม่อั้นคือช่องโหว่ตัวใหม่ */
  it('จำนวนกุญแจไม่โตเกินเพดาน แม้ยิงมาจากไอพีคนละตัวทุกครั้ง', () => {
    const rl = new RateLimiter({ limit: 5, windowMs: 1000, maxKeys: 10 });
    for (let i = 0; i < 500; i++) rl.check(`ip-${i}`, 0);
    expect(rl.size).toBeLessThanOrEqual(10);
  });

  it('กุญแจเต็มแล้วปฏิเสธรายใหม่ ไม่ใช่ปล่อยผ่าน', () => {
    const rl = new RateLimiter({ limit: 5, windowMs: 1000, maxKeys: 2 });
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('b', 0).ok).toBe(true);
    expect(rl.check('c', 0).ok).toBe(false);
  });

  it('ช่วงเวลาหมดอายุแล้วคืนที่ว่างให้รายใหม่', () => {
    const rl = new RateLimiter({ limit: 5, windowMs: 1000, maxKeys: 2 });
    rl.check('a', 0);
    rl.check('b', 0);
    expect(rl.check('c', 0).ok).toBe(false);
    /* พ้นช่วงเวลาเดิมแล้ว a กับ b ถูกกวาดทิ้ง c จึงเข้าได้ */
    expect(rl.check('c', 1500).ok).toBe(true);
    expect(rl.size).toBeLessThanOrEqual(2);
  });

  it('กุญแจเดิมที่หมดอายุแล้วไม่กินที่เพิ่ม', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000, maxKeys: 1 });
    expect(rl.check('a', 0).ok).toBe(true);
    expect(rl.check('a', 2000).ok).toBe(true);
    expect(rl.size).toBe(1);
  });
});

describe('callerIp', () => {
  const h = (map: Record<string, string>) => ({ get: (n: string) => map[n] ?? null });

  it('เอาค่าแรกของ x-forwarded-for — ตัวที่ proxy เขียนให้คือไอพีต้นทางจริง', () => {
    expect(callerIp(h({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
  });

  it('ไม่มี x-forwarded-for ใช้ x-real-ip', () => {
    expect(callerIp(h({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('ไม่มีอะไรเลยคืน null ให้ผู้เรียกตัดสินใจเอง', () => {
    expect(callerIp(h({}))).toBeNull();
  });

  it('ค่ายาวผิดปกติถูกตัด — กันคนยัดสตริงยาวมาเป็นกุญแจ', () => {
    const long = 'x'.repeat(5000);
    expect(callerIp(h({ 'x-forwarded-for': long }))!.length).toBe(64);
  });
});
