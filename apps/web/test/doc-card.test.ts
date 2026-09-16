/**
 * แถวในตาราง → การ์ดเอกสาร (จอต่ำกว่า 1280)
 *
 * การ์ดกับตารางต้องพูดเรื่องเดียวกัน — สถานะ ยอด และคงค้างคิดจากฟังก์ชันเดียวกัน
 * ไม่งั้นวันหนึ่งใบเดียวกันจะขึ้น "ค้างชำระ" บนมือถือ แต่ "เกินกำหนด" บนเดสก์ท็อป
 * เขียนเป็นโมดูลบริสุทธิ์เพื่อให้เทสต์ได้โดยไม่ต้องเปิดเบราว์เซอร์หรือต่อฐานข้อมูล
 */
import { describe, expect, it } from 'vitest';
import { billingDocCard, expenseDocCard, incomeDocCard, incomeStatus } from '../src/lib/doc-card';

const TODAY = '2026-09-16';

const inc = (over: Partial<Parameters<typeof incomeDocCard>[0]> = {}) => ({
  id: 'd1', kind: 'RC', docNo: 'RC-202509-001', docDate: '2026-09-01',
  partyName: 'นาย สมชาย ใจดี', vehiclePlate: 'กข 1234 กรุงเทพมหานคร',
  payable: 5350, outstanding: 0, dueDate: null as string | null,
  invoice: null as unknown, receipt: null as unknown, voided: false,
  ...over,
});

describe('incomeDocCard — เอกสารขาย', () => {
  it('ใบเสร็จที่ชำระครบ — ไม่มียอดคงค้าง ชิปสถานะเขียว', () => {
    const c = incomeDocCard(inc(), TODAY);
    expect(c.href).toBe('/income/d1');
    expect(c.kind).toBe('RC');
    expect(c.no).toBe('RC-202509-001');
    expect(c.name).toBe('นาย สมชาย ใจดี');
    expect(c.plate).toBe('กข 1234 กรุงเทพมหานคร');
    expect(c.amount).toBe(5350);
    expect(c.outstanding).toBe(0);
    expect(c.status).toEqual({ label: 'ชำระครบ', tone: 'ok' });
  });

  it('ใบที่ยังค้าง — คงค้างเท่าที่เหลือ ชิปเหลือง', () => {
    const c = incomeDocCard(inc({ outstanding: 2000 }), TODAY);
    expect(c.outstanding).toBe(2000);
    expect(c.status).toEqual({ label: 'ค้างชำระ', tone: 'warn' });
  });

  it('เลยวันครบกำหนดแล้วยังค้าง — ชิปแดง "เกินกำหนด"', () => {
    const c = incomeDocCard(inc({ outstanding: 2000, dueDate: '2026-09-15' }), TODAY);
    expect(c.status).toEqual({ label: 'เกินกำหนด', tone: 'due' });
  });

  it('ครบกำหนดวันนี้ยังไม่ถือว่าเกิน', () => {
    expect(incomeStatus(inc({ outstanding: 2000, dueDate: TODAY }), TODAY).label).toBe('ค้างชำระ');
  });

  /* ใบเสนอราคายังไม่ใช่หนี้ — ต้นแบบจึงไม่มีบรรทัดคงค้างบนการ์ดใบเสนอราคา */
  it('ใบเสนอราคา — ไม่มีบรรทัดคงค้าง สถานะบอกว่าค้างส่งมอบหรือออกใบต่อแล้ว', () => {
    const open = incomeDocCard(inc({ kind: 'QT', outstanding: 5350 }), TODAY);
    expect(open.outstanding).toBe(null);
    expect(open.status).toEqual({ label: 'ค้างส่งมอบ', tone: 'warn' });

    const done = incomeDocCard(inc({ kind: 'QT', outstanding: 5350, receipt: { id: 'x', no: 'RC-1' } }), TODAY);
    expect(done.outstanding).toBe(null);
    expect(done.status).toEqual({ label: 'ออกใบต่อแล้ว', tone: 'ok' });
  });

  it('ใบที่ยกเลิก — ชิปกลาง ไม่ใช่สีเตือน และการ์ดรู้ว่าต้องจาง', () => {
    const c = incomeDocCard(inc({ voided: true, outstanding: 2000, dueDate: '2026-01-01' }), TODAY);
    expect(c.voided).toBe(true);
    expect(c.status).toEqual({ label: 'ยกเลิก', tone: 'plain' });
  });

  it('ไม่มีทะเบียนรถก็ไม่พัง — ว่างคือไม่ต้องแสดงบรรทัดนั้น', () => {
    expect(incomeDocCard(inc({ vehiclePlate: '' }), TODAY).plate).toBe('');
  });
});

describe('expenseDocCard — รายจ่าย', () => {
  const ex = (over: Partial<Parameters<typeof expenseDocCard>[0]> = {}) => ({
    id: 'e1', kind: 'PO', docNo: 'PO-202509-004', docDate: '2026-09-03',
    partyName: 'ร้านอะไหล่รุ่งเรือง', payable: 12000, paid: 12000, outstanding: 0,
    status: 'issued', expenseCat: null as string | null,
    ...over,
  });

  it('ใบซื้อที่จ่ายครบ', () => {
    const c = expenseDocCard(ex());
    expect(c.href).toBe('/expense/e1');
    expect(c.kind).toBe('PO');
    expect(c.amount).toBe(12000);
    expect(c.status).toEqual({ label: 'ชำระแล้ว', tone: 'ok' });
  });

  it('จ่ายบางส่วน — เหลืองพร้อมยอดคงค้าง', () => {
    const c = expenseDocCard(ex({ paid: 5000, outstanding: 7000 }));
    expect(c.outstanding).toBe(7000);
    expect(c.status).toEqual({ label: 'ชำระบางส่วน', tone: 'warn' });
  });

  it('ยังไม่จ่ายเลย — แดง', () => {
    expect(expenseDocCard(ex({ paid: 0, outstanding: 12000 })).status)
      .toEqual({ label: 'ค้างชำระ', tone: 'due' });
  });

  it('ใบที่ยกเลิก', () => {
    const c = expenseDocCard(ex({ status: 'void' }));
    expect(c.voided).toBe(true);
    expect(c.status).toEqual({ label: 'ยกเลิก', tone: 'plain' });
  });

  /* ค่าใช้จ่ายไม่มีคู่ค้าเสมอไป — การ์ดต้องไม่ขึ้นช่องว่างเปล่า */
  it('ค่าใช้จ่ายที่ไม่ได้ระบุผู้รับเงิน ใช้ชื่อหมวดแทน', () => {
    expect(expenseDocCard(ex({ kind: 'EX', partyName: '', expenseCat: 'rent' })).name)
      .toBe('ค่าเช่า');
    expect(expenseDocCard(ex({ kind: 'EX', partyName: '', expenseCat: null })).name)
      .toBe('ค่าใช้จ่าย');
    expect(expenseDocCard(ex({ kind: 'PO', partyName: '' })).name).toBe('(ไม่ระบุผู้ขาย)');
  });
});

describe('billingDocCard — ใบวางบิล', () => {
  const bn = (over: Partial<Parameters<typeof billingDocCard>[0]> = {}) => ({
    id: 'b1', no: 'BN-202509-002', billDate: '2026-09-05', partyName: 'บริษัท ขนส่งไทย จำกัด',
    docCount: 4, totalSnapshot: 88000, total: 30000, status: 'issued', voidedReason: null as string | null,
    ...over,
  });

  it('ใบวางบิลที่ยังเก็บไม่ครบ — ยอดบนการ์ดคือยอดที่แจ้งไป คงค้างคือที่ยังเก็บไม่ได้', () => {
    const c = billingDocCard(bn());
    expect(c.href).toBe('/income/billing/b1');
    expect(c.kind).toBe('BN');
    expect(c.amount).toBe(88000);
    expect(c.outstanding).toBe(30000);
    expect(c.status).toEqual({ label: 'วางบิลแล้ว', tone: 'plain' });
    expect(c.name).toBe('บริษัท ขนส่งไทย จำกัด');
  });

  it('เก็บครบแล้ว — คงค้างศูนย์', () => {
    expect(billingDocCard(bn({ total: 0 })).outstanding).toBe(0);
  });

  it('ใบที่ยกเลิก — ไม่โชว์คงค้าง เพราะไม่ต้องเก็บแล้ว', () => {
    const c = billingDocCard(bn({ status: 'void' }));
    expect(c.voided).toBe(true);
    expect(c.outstanding).toBe(null);
    expect(c.status).toEqual({ label: 'ยกเลิก', tone: 'plain' });
  });
});
