import { describe, expect, it } from 'vitest';
import { payAtIssue } from '../src/lib/print';

const doc = (payable: number, payments: { amount: number; method: string; ref?: string; atIssue: boolean }[]) =>
  ({ payable, payments: payments.map((p) => ({ paidOn: '2026-01-01', ref: '', ...p })) }) as any;

describe('แยกยอดรับชำระตอนออกเอกสาร', () => {
  it('แยกตามช่องทางถูกต้อง', () => {
    const a = payAtIssue(doc(1000, [
      { amount: 400, method: 'เงินสด', atIssue: true },
      { amount: 600, method: 'เงินโอน', atIssue: true, ref: 'KBANK 123' },
    ]));
    expect(a.cash).toBe(400);
    expect(a.transfer).toBe(600);
    expect(a.paid).toBe(1000);
    expect(a.remain).toBe(0);
    expect(a.ref).toBe('KBANK 123');
  });

  it('ไม่นับรายการที่ตัดชำระภายหลัง — ใบเสร็จต้องแสดงเฉพาะที่รับ ณ วันออกเอกสาร', () => {
    const a = payAtIssue(doc(1000, [
      { amount: 300, method: 'เงินสด', atIssue: true },
      { amount: 700, method: 'เงินโอน', atIssue: false },
    ]));
    expect(a.paid).toBe(300);
    expect(a.remain).toBe(700);
  });

  it('รับหลายครั้งทางเดียวกันรวมเป็นยอดเดียว', () => {
    const a = payAtIssue(doc(500, [
      { amount: 200, method: 'เงินสด', atIssue: true },
      { amount: 150, method: 'เงินสด', atIssue: true },
    ]));
    expect(a.cash).toBe(350);
  });

  it('ช่องทางนอกเหนือสามอย่างหลักไปรวมที่ other ไม่หายไปเฉย ๆ', () => {
    const a = payAtIssue(doc(1000, [
      { amount: 400, method: 'เงินสด', atIssue: true },
      { amount: 600, method: 'เช็ค', atIssue: true },
    ]));
    expect(a.cash).toBe(400);
    expect(a.other).toBe(600);
    expect(a.paid).toBe(1000);
  });

  it('ยังไม่รับชำระเลย ยอดคงเหลือเท่ากับยอดที่ต้องชำระ', () => {
    const a = payAtIssue(doc(2869.5, []));
    expect(a.paid).toBe(0);
    expect(a.remain).toBe(2869.5);
  });

  it('เศษสตางค์ไม่สะสมจากการบวกทศนิยม', () => {
    const a = payAtIssue(doc(0.3, [
      { amount: 0.1, method: 'เงินสด', atIssue: true },
      { amount: 0.2, method: 'เงินสด', atIssue: true },
    ]));
    expect(a.cash).toBe(0.3);
    expect(a.remain).toBe(0);
  });
});
