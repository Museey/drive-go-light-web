/**
 * แจ้งเตือนข้อผิดพลาดเข้า Telegram — รวบเป็นรอบ และไม่พาข้อมูลลูกค้าออกไป
 */
import { describe, expect, it } from 'vitest';
import { alertPath, createAlerter } from '../src/lib/error-alerts';

function rig(opts: { batchMs?: number; gapMs?: number } = {}) {
  let t = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const sent: string[] = [];
  const alerter = createAlerter({
    ...opts,
    send: async (text) => { sent.push(text); },
    link: 'https://app.example/ops/errors',
    now: () => t,
    setTimer: (fn, ms) => { timers.push({ at: t + ms, fn }); },
  });
  /** เดินเวลาไปข้างหน้าแล้วยิงตัวจับเวลาที่ถึงกำหนด */
  async function advance(ms: number) {
    t += ms;
    for (const tm of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (tm.at <= t) { tm.fn(); await Promise.resolve(); } else timers.push(tm);
    }
  }
  return { alerter, sent, advance, timers };
}

describe('alertPath', () => {
  it('ตัด query และ hash ทิ้ง — คำค้นที่พิมพ์มักเป็นชื่อหรือเบอร์โทรลูกค้า', () => {
    expect(alertPath('/customers?q=สมชาย 0812345678')).toBe('/customers');
    expect(alertPath('/income#row-3')).toBe('/income');
  });

  it('ไม่มี path ก็ยังมีอะไรให้แสดง', () => {
    expect(alertPath(null)).toBe('-');
    expect(alertPath('')).toBe('-');
  });

  it('path ยาวเกินถูกตัด', () => {
    expect(alertPath('/' + 'a'.repeat(500)).length).toBeLessThanOrEqual(61);
  });
});

describe('createAlerter', () => {
  it('รวบข้อผิดพลาดที่มาติด ๆ กันเป็นข้อความเดียว', async () => {
    const { alerter, sent, advance } = rig({ batchMs: 30_000 });
    alerter.note({ kind: 'server', path: '/customers/new' });
    alerter.note({ kind: 'server', path: '/customers/new' });
    alerter.note({ kind: 'client', path: '/income' });
    await advance(29_999);
    expect(sent).toHaveLength(0);
    await advance(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('ข้อผิดพลาด 3 ครั้ง');
    expect(sent[0]).toContain('server ที่ /customers/new × 2');
    expect(sent[0]).toContain('client ที่ /income');
    expect(sent[0]).toContain('https://app.example/ops/errors');
  });

  it('รอบถัดไปต้องเว้นระยะจากรอบก่อน ไม่ให้โทรศัพท์สั่นไม่หยุด', async () => {
    const { alerter, sent, advance } = rig({ batchMs: 30_000, gapMs: 600_000 });
    alerter.note({ kind: 'server', path: '/a' });
    await advance(30_000);
    expect(sent).toHaveLength(1);

    alerter.note({ kind: 'server', path: '/b' });
    await advance(60_000);
    expect(sent).toHaveLength(1);
    await advance(540_000);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('/b');
  });

  it('จำนวนกลุ่มที่เก็บรอไม่โตไม่จำกัด แม้ path สุ่มมาทุกครั้ง', async () => {
    const { alerter, sent, advance } = rig();
    for (let i = 0; i < 1000; i++) alerter.note({ kind: 'client', path: `/x${i}` });
    await advance(30_000);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('ข้อผิดพลาด 1000 ครั้ง');
    expect(sent[0].split('\n').length).toBeLessThan(15);
  });

  it('ส่งไม่สำเร็จต้องไม่โยนออกมา', async () => {
    let t = 0;
    const fire: (() => void)[] = [];
    const alerter = createAlerter({
      send: async () => { throw new Error('network down'); },
      now: () => t,
      setTimer: (fn) => { fire.push(fn); },
    });
    alerter.note({ kind: 'server', path: '/a' });
    t = 30_000;
    await expect(alerter.flush()).resolves.toBeUndefined();
  });
});
