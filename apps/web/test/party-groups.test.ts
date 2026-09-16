/**
 * ลูกหนี้/เจ้าหนี้รายใบ → การ์ดรายคน (จอต่ำกว่า 1280 · ต้นแบบ mArGroups)
 *
 * รวมกลุ่มจากแถวที่หน้าดึงมาอยู่แล้ว ไม่แตะคิวรี — ผลรวมทุกกลุ่มต้องเท่ายอดค้างทั้งหมดเสมอ
 * ไม่งั้นมือถือกับเดสก์ท็อปบอกยอดลูกหนี้คนละตัวเลข
 */
import { describe, expect, it } from 'vitest';
import { groupByParty, partyKey, rowsOfParty } from '../src/lib/party-groups';

const row = (partyId: string | null, partyName: string, outstanding: number, daysOverdue = -3) =>
  ({ partyId, partyName, outstanding, daysOverdue });

describe('groupByParty', () => {
  it('รวมยอดและนับใบของคนเดียวกัน', () => {
    const g = groupByParty([row('a', 'นาย ก', 100), row('a', 'นาย ก', 250.5)]);
    expect(g).toEqual([{ key: 'a', name: 'นาย ก', count: 2, overdueCount: 0, amount: 350.5 }]);
  });

  it('นับใบที่เกินกำหนดแยก — ครบกำหนดวันนี้ (0 วัน) ยังไม่เกิน', () => {
    const g = groupByParty([row('a', 'นาย ก', 10, 5), row('a', 'นาย ก', 10, 0), row('a', 'นาย ก', 10, -1)]);
    expect(g[0]!.overdueCount).toBe(1);
  });

  it('เรียงยอดค้างมากไปน้อย — คนที่ต้องตามก่อนอยู่บนสุด', () => {
    const g = groupByParty([row('a', 'ก', 10), row('b', 'ข', 900), row('c', 'ค', 50)]);
    expect(g.map((x) => x.name)).toEqual(['ข', 'ค', 'ก']);
  });

  it('ยอดเท่ากันเรียงตามชื่อ — ลำดับไม่สลับไปมาทุกครั้งที่โหลด', () => {
    const g = groupByParty([row('b', 'ข', 10), row('a', 'ก', 10)]);
    expect(g.map((x) => x.name)).toEqual(['ก', 'ข']);
  });

  /* ลูกค้าชื่อซ้ำกันได้ (นาย สมชาย สองคน) — รวมด้วยชื่ออย่างเดียวจะทวงเงินผิดคน */
  it('ชื่อซ้ำแต่คนละทะเบียนผู้ติดต่อ ต้องแยกการ์ด', () => {
    const g = groupByParty([row('a', 'นาย สมชาย', 100), row('b', 'นาย สมชาย', 200)]);
    expect(g).toHaveLength(2);
  });

  it('ใบที่ไม่ได้ผูกทะเบียนผู้ติดต่อ รวมกันด้วยชื่อ', () => {
    const g = groupByParty([row(null, 'ลูกค้าหน้าร้าน', 100), row(null, 'ลูกค้าหน้าร้าน', 20)]);
    expect(g).toEqual([{ key: 'n:ลูกค้าหน้าร้าน', name: 'ลูกค้าหน้าร้าน', count: 2, overdueCount: 0, amount: 120 }]);
  });

  it('ไม่มีชื่อเลย แสดงว่าไม่ระบุ', () => {
    expect(groupByParty([row(null, '', 5)])[0]!.name).toBe('ไม่ระบุชื่อ');
  });

  it('ผลรวมทุกกลุ่มเท่ายอดค้างทั้งหมดทุกสตางค์ (ไม่มีเศษทศนิยมลอย)', () => {
    const rows = [row('a', 'ก', 0.1), row('a', 'ก', 0.2), row('b', 'ข', 1234.56), row(null, 'ค', 99.99)];
    const g = groupByParty(rows);
    const sum = Math.round(g.reduce((s, x) => s + x.amount, 0) * 100) / 100;
    expect(sum).toBe(1334.85);
    expect(g.find((x) => x.name === 'ก')!.amount).toBe(0.3);
  });
});

describe('rowsOfParty — หน้ารายคน', () => {
  const rows = [row('a', 'นาย สมชาย', 1), row('b', 'นาย สมชาย', 2), row(null, 'หน้าร้าน', 3), row('a', 'นาย สมชาย', 4)];

  it('เหลือเฉพาะใบของคนนั้น ลำดับเดิม', () => {
    expect(rowsOfParty(rows, 'a').map((r) => r.outstanding)).toEqual([1, 4]);
  });

  it('คีย์ของใบที่ไม่ได้ผูกทะเบียน', () => {
    expect(rowsOfParty(rows, partyKey(rows[2]!)).map((r) => r.outstanding)).toEqual([3]);
  });

  it('คีย์ที่ไม่มีอยู่ — ว่าง ไม่ใช่คืนทุกใบ', () => {
    expect(rowsOfParty(rows, 'zzz')).toEqual([]);
  });
});
