/**
 * แถวในตาราง → การ์ดเอกสาร (จอต่ำกว่า 1280)
 *
 * การ์ดกับตารางต้องพูดเรื่องเดียวกัน — สถานะ ยอด และคงค้างคิดจากฟังก์ชันเดียวกัน
 * ไม่งั้นวันหนึ่งใบเดียวกันจะขึ้น "ค้างชำระ" บนมือถือ แต่ "เกินกำหนด" บนเดสก์ท็อป
 * เขียนเป็นโมดูลบริสุทธิ์เพื่อให้เทสต์ได้โดยไม่ต้องเปิดเบราว์เซอร์หรือต่อฐานข้อมูล
 */
import { describe, expect, it } from 'vitest';
import { billingDocCard, expenseDocCard, incomeDocCard, incomeStatus, owingDocCard, salesDocCard } from '../src/lib/doc-card';

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
  /* ออกใบต่อแล้ว = "เรียบร้อย" (ผู้ใช้กำหนด 17 ก.ย. 2569 — เดิม "ออกใบต่อแล้ว") */
  it('ใบเสนอราคา — ไม่มีบรรทัดคงค้าง สถานะบอกว่าค้างส่งมอบหรือเรียบร้อย', () => {
    const open = incomeDocCard(inc({ kind: 'QT', outstanding: 5350 }), TODAY);
    expect(open.outstanding).toBe(null);
    expect(open.status).toEqual({ label: 'ค้างส่งมอบ', tone: 'warn' });

    const done = incomeDocCard(inc({ kind: 'QT', outstanding: 5350, receipt: { id: 'x', no: 'RC-1' } }), TODAY);
    expect(done.outstanding).toBe(null);
    expect(done.status).toEqual({ label: 'เรียบร้อย', tone: 'ok' });

    const delivered = incomeDocCard(inc({ kind: 'QT', outstanding: 5350, invoice: { id: 'y', no: 'IVT-1' } }), TODAY);
    expect(delivered.status).toEqual({ label: 'เรียบร้อย', tone: 'ok' });
  });

  /* ใบส่งมอบ: บันทึกแล้ว = ส่งรถแล้ว "เรียบร้อย" · เลยวันครบกำหนดยังไม่ได้เงิน ยังต้องเตือน */
  it.each(['IV', 'IVT'])('%s — เรียบร้อยแม้ยังค้าง · ยอดคงค้างยังโชว์ · เลยครบกำหนดขึ้นเกินกำหนด', (kind) => {
    const fresh = incomeDocCard(inc({ kind, outstanding: 5350, dueDate: '2026-10-01' }), TODAY);
    expect(fresh.status).toEqual({ label: 'เรียบร้อย', tone: 'ok' });
    expect(fresh.outstanding).toBe(5350);

    expect(incomeStatus(inc({ kind, outstanding: 5350, dueDate: TODAY }), TODAY))
      .toEqual({ label: 'เรียบร้อย', tone: 'ok' });
    expect(incomeStatus(inc({ kind, outstanding: 5350, dueDate: '2026-09-15' }), TODAY))
      .toEqual({ label: 'เกินกำหนด', tone: 'due' });
    expect(incomeStatus(inc({ kind, outstanding: 0 }), TODAY)).toEqual({ label: 'เรียบร้อย', tone: 'ok' });
  });

  /* หนี้ย้ายไปอยู่ที่ใบเสร็จแล้ว (หน้าลูกหนี้ก็ไม่นับใบส่งมอบที่มีใบเสร็จ) — ไม่เตือนซ้ำที่ใบส่งมอบ */
  it('ใบส่งมอบที่ออกใบเสร็จแล้ว — เรียบร้อย ไม่เตือนเกินกำหนด', () => {
    expect(incomeStatus(inc({ kind: 'IVT', outstanding: 5350, dueDate: '2026-09-01', receipt: { id: 'r', no: 'RC-9' } }), TODAY))
      .toEqual({ label: 'เรียบร้อย', tone: 'ok' });
  });

  it('ใบส่งมอบที่ยกเลิก — ยกเลิก ไม่ใช่เรียบร้อย', () => {
    expect(incomeStatus(inc({ kind: 'IV', voided: true }), TODAY)).toEqual({ label: 'ยกเลิก', tone: 'plain' });
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

describe('owingDocCard — ใบค้างในหน้าลูกหนี้/เจ้าหนี้รายคน', () => {
  const owe = (over = {}) => ({
    id: 'o1', kind: 'IVT', docNo: 'IV-202609-004', docDate: '2026-09-02', dueDate: '2026-10-02',
    partyName: 'บริษัท ขนส่งไทย จำกัด', vehiclePlate: 'กข 1', payable: 5000, paid: 0, outstanding: 5000, daysOverdue: -16,
    ...over,
  });

  it('ลูกหนี้ลิงก์ไปหน้ารายรับ · เจ้าหนี้ลิงก์ไปหน้ารายจ่าย', () => {
    expect(owingDocCard(owe(), 'sell').href).toBe('/income/o1');
    expect(owingDocCard(owe({ kind: 'PO' }), 'buy').href).toBe('/expense/o1');
  });

  it('ยอดบนการ์ด = ยอดเต็มใบ · คงค้างแยกบรรทัด', () => {
    const c = owingDocCard(owe({ paid: 2000, outstanding: 3000 }), 'sell');
    expect(c.amount).toBe(5000);
    expect(c.outstanding).toBe(3000);
    expect(c.plate).toBe('กข 1');
  });

  it('ยังไม่ถึงกำหนด: ค้างชำระ (เหลือง) · จ่ายมาบางส่วน: ชำระบางส่วน', () => {
    expect(owingDocCard(owe(), 'sell').status).toEqual({ label: 'ค้างชำระ', tone: 'warn' });
    expect(owingDocCard(owe({ paid: 1, outstanding: 4999 }), 'sell').status).toEqual({ label: 'ชำระบางส่วน', tone: 'warn' });
  });

  it('เกินกำหนดบอกจำนวนวัน (แดง) — ครบกำหนดวันนี้ยังไม่เกิน', () => {
    expect(owingDocCard(owe({ daysOverdue: 12 }), 'sell').status).toEqual({ label: 'เกิน 12 วัน', tone: 'due' });
    expect(owingDocCard(owe({ daysOverdue: 0 }), 'sell').status.tone).toBe('warn');
  });

  it('เจ้าหนี้ไม่มีทะเบียนรถ', () => {
    const { vehiclePlate: _omit, ...ap } = owe({ kind: 'EX' });
    expect(owingDocCard(ap, 'buy').plate).toBe('');
  });
});

describe('salesDocCard — เอกสารขายรายใบในหน้ายอดขาย', () => {
  const d = (over = {}) => ({ id: 's1', kind: 'RC', docNo: 'RC-1', docDate: '2026-09-01', partyName: 'ก', payable: 1070, outstanding: 0, ...over });

  it('ยอดบนการ์ด = สุทธิรับ · ชำระครบเขียว', () => {
    const c = salesDocCard(d());
    expect(c.href).toBe('/income/s1');
    expect(c.amount).toBe(1070);
    expect(c.status).toEqual({ label: 'ชำระครบ', tone: 'ok' });
  });

  it('ยังค้าง — เหลือง พร้อมยอดคงค้าง', () => {
    const c = salesDocCard(d({ outstanding: 70 }));
    expect(c.outstanding).toBe(70);
    expect(c.status).toEqual({ label: 'ค้างชำระ', tone: 'warn' });
  });
});
