/**
 * ค้นหาแบบพิมพ์แล้วขึ้นทันที — กติกาเรื่องเวลาที่พังแล้วผู้ใช้เห็นเป็น "ผลสลับ"
 *
 * ทดสอบแกนล้วน ๆ (live-search-core.ts) ด้วย fake timer
 * ไม่มีตัวเรนเดอร์ React ในชุดนี้ จึงแยกตรรกะออกมาให้ทดสอบได้ตรง ๆ
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveSearch, type Patch } from '../src/components/live-search-core';

/** Promise ที่สั่ง resolve/reject จากข้างนอกได้ — เอาไว้จำลองเซิร์ฟเวอร์ตอบช้า/เร็วไม่เท่ากัน */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type Row = { id: string };

function harness(delay = 250) {
  const calls: string[] = [];
  const pending = new Map<string, ReturnType<typeof deferred<Row[]>>>();
  const state: { results: Row[] | null; busy: boolean } = { results: null, busy: false };

  const run = (q: string) => {
    calls.push(q);
    const d = deferred<Row[]>();
    pending.set(q, d);
    return d.promise;
  };
  const emit = (p: Patch<Row>) => Object.assign(state, p);
  const ls = createLiveSearch<Row>(run, emit, { delay });

  /** ตอบกลับคำค้น q ด้วยผลที่ให้ */
  const answer = async (q: string, rows: Row[]) => { pending.get(q)!.resolve(rows); await vi.advanceTimersByTimeAsync(0); };
  const fail = async (q: string) => { pending.get(q)!.reject(new Error('boom')); await vi.advanceTimersByTimeAsync(0); };

  return { ls, calls, state, answer, fail };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('หน่วงเวลา — พิมพ์รัว ๆ ยิงเซิร์ฟเวอร์ครั้งเดียว', () => {
  it('พิมพ์ a → ab → abc ภายในช่วงหน่วง ยิงแค่ "abc"', async () => {
    const h = harness();
    h.ls.query('a');
    await vi.advanceTimersByTimeAsync(100);
    h.ls.query('ab');
    await vi.advanceTimersByTimeAsync(100);
    h.ls.query('abc');
    expect(h.calls).toEqual([]);            // ยังไม่ครบช่วงหน่วง ไม่ยิง
    await vi.advanceTimersByTimeAsync(250);
    expect(h.calls).toEqual(['abc']);
  });

  it('ระหว่างรอ busy = true และกลับเป็น false เมื่อผลมา', async () => {
    const h = harness();
    h.ls.query('x');
    expect(h.state.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    await h.answer('x', [{ id: '1' }]);
    expect(h.state.busy).toBe(false);
    expect(h.state.results).toEqual([{ id: '1' }]);
  });
});

describe('ผลเก่ามาช้ากว่าต้องถูกทิ้ง — ไม่ทับผลของคำค้นใหม่', () => {
  it('ค้น a แล้วค้น b, b ตอบก่อน, a ตอบทีหลัง → ผลยังเป็นของ b', async () => {
    const h = harness();
    h.ls.query('a');
    await vi.advanceTimersByTimeAsync(250);        // ยิง a แล้ว รอเซิร์ฟเวอร์
    h.ls.query('b');
    await vi.advanceTimersByTimeAsync(250);        // ยิง b
    expect(h.calls).toEqual(['a', 'b']);

    await h.answer('b', [{ id: 'B' }]);
    expect(h.state.results).toEqual([{ id: 'B' }]);

    await h.answer('a', [{ id: 'A' }]);            // ของเก่ามาถึงช้า
    expect(h.state.results).toEqual([{ id: 'B' }]); // ต้องไม่เปลี่ยน
    expect(h.state.busy).toBe(false);
  });
});

describe('ลบคำค้นจนว่าง = ปิดผลทันที (ข้อ 9)', () => {
  it('ช่องว่างไม่ยิงเซิร์ฟเวอร์และล้างผลเดิม', async () => {
    const h = harness();
    h.ls.query('x');
    await vi.advanceTimersByTimeAsync(250);
    await h.answer('x', [{ id: '1' }]);
    expect(h.state.results).toHaveLength(1);

    h.ls.query('   ');                              // เว้นวรรคล้วน = ว่าง
    expect(h.state.results).toBeNull();
    expect(h.state.busy).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.calls).toEqual(['x']);                 // ไม่ยิงเพิ่ม
  });

  it('ผลของคำค้นที่ค้างอยู่ตอนลบจนว่าง มาถึงทีหลังก็ต้องไม่โผล่', async () => {
    const h = harness();
    h.ls.query('x');
    await vi.advanceTimersByTimeAsync(250);         // ยิง x แล้ว ยังไม่ตอบ
    h.ls.query('');
    await h.answer('x', [{ id: '1' }]);
    expect(h.state.results).toBeNull();
  });
});

describe('clear() — ใช้ตอนเลือกแล้ว (ข้อ 2)', () => {
  it('ยกเลิกคำค้นที่ยังไม่ทันยิง และล้างผล', async () => {
    const h = harness();
    h.ls.query('x');                                 // ยังอยู่ในช่วงหน่วง
    h.ls.clear();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.calls).toEqual([]);
    expect(h.state.results).toBeNull();
    expect(h.state.busy).toBe(false);
  });
});

describe('เซิร์ฟเวอร์ล้มเหลว', () => {
  it('ไม่โชว์ "ไม่พบ" หลอก — ปล่อยผลเดิมไว้ แค่เลิก busy', async () => {
    const h = harness();
    h.ls.query('x');
    await vi.advanceTimersByTimeAsync(250);
    await h.answer('x', [{ id: '1' }]);

    h.ls.query('y');
    await vi.advanceTimersByTimeAsync(250);
    await h.fail('y');
    expect(h.state.results).toEqual([{ id: '1' }]);
    expect(h.state.busy).toBe(false);
  });
});
