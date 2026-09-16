/**
 * ผู้ติดต่อ → การ์ด (จอต่ำกว่า 1280 · ต้นแบบ a.mparty / .mdetail)
 *
 * การ์ดบรรทัดรองมีที่ให้แค่บรรทัดเดียว — ตัดสินที่นี่ว่าอะไรได้ขึ้นก่อน
 * แล้วเทสต์ได้โดยไม่ต้องเปิดเบราว์เซอร์
 */
import { describe, expect, it } from 'vitest';
import { contactCard, contactDetailRows, contactHistoryCard, plateOf } from '../src/lib/contact-card';

const cust = (over: Partial<Parameters<typeof contactCard>[0]> = {}) => ({
  id: 'c1', code: 'CUS-0001', kind: 'customer' as const, displayName: 'นาย สมชาย ใจดี',
  tel: '082-710-1929', taxId: '3041079593356', plates: ['กค 3279 กรุงเทพมหานคร'],
  ...over,
});

describe('contactCard — การ์ดในหน้ารายชื่อ', () => {
  it('ลิงก์ · ชื่อ · ชิปชนิด', () => {
    const c = contactCard(cust());
    expect(c.href).toBe('/customers/c1');
    expect(c.name).toBe('นาย สมชาย ใจดี');
    expect(c.kind).toEqual({ label: 'ลูกค้า', tone: 'ok' });
  });

  /* ลูกค้าอู่ถูกค้นด้วยทะเบียนรถบ่อยกว่าเลขภาษี — ทะเบียนจึงได้ที่ในบรรทัดรอง */
  it('ลูกค้า: บรรทัดรอง = รหัส · โทร · ทะเบียนรถ', () => {
    expect(contactCard(cust()).meta).toEqual(['CUS-0001', '082-710-1929', 'กค 3279 กรุงเทพมหานคร']);
  });

  it('รถหลายคัน: สองคันแรก แล้วบอกว่ามีอีกกี่คัน', () => {
    const c = contactCard(cust({ plates: ['กข 1', 'กข 2', 'กข 3', 'กข 4'] }));
    expect(c.meta[2]).toBe('กข 1, กข 2 +2 คัน');
  });

  it('ลูกค้าที่ไม่มีรถ ใช้เลขผู้เสียภาษีแทน', () => {
    expect(contactCard(cust({ plates: [] })).meta).toEqual(['CUS-0001', '082-710-1929', '3041079593356']);
  });

  it('ผู้ขาย: ชิปเทา · บรรทัดรองใช้เลขผู้เสียภาษี ไม่ใช่ทะเบียนรถ', () => {
    const c = contactCard(cust({ kind: 'vendor', code: 'VEN-0003', plates: [] }));
    expect(c.kind).toEqual({ label: 'ผู้ขาย', tone: 'plain' });
    expect(c.meta).toEqual(['VEN-0003', '082-710-1929', '3041079593356']);
  });

  it('ค่าว่างไม่ทิ้งจุดคั่นลอย ๆ ไว้ในบรรทัด', () => {
    expect(contactCard(cust({ tel: '', plates: [], taxId: '' })).meta).toEqual(['CUS-0001']);
  });

  it('ไม่มีชื่อ — บอกว่าไม่ระบุ ไม่ใช่การ์ดหัวว่าง', () => {
    expect(contactCard(cust({ displayName: '' })).name).toBe('ไม่ระบุชื่อ');
  });
});

describe('plateOf — ทะเบียนรถหนึ่งคัน', () => {
  it('ประกอบหมวด เลข จังหวัด แบบเดียวกับคิวรีรายชื่อ', () => {
    expect(plateOf({ plateA: '1กก', plateB: '1234', plateProvince: 'กรุงเทพมหานคร' })).toBe('1กก 1234 กรุงเทพมหานคร');
  });
  it('ช่องว่างไม่ทิ้งช่องไฟซ้อน', () => {
    expect(plateOf({ plateA: '', plateB: '1234', plateProvince: '' })).toBe('1234');
    expect(plateOf({ plateA: ' ', plateB: '', plateProvince: '' })).toBe('');
  });
});

describe('contactDetailRows — การ์ดข้อมูลในหน้ารายคน', () => {
  const base = {
    kind: 'customer' as const, code: 'CUS-0001', tel: '082-710-1929', tel2: '', email: 'a@b.co',
    plates: ['กค 3279 กรุงเทพมหานคร', 'ขข 1 นนทบุรี'], taxId: '', creditDays: 30,
    addrLine: '12 ถ.สุขุมวิท', note: '',
  };

  it('แถวที่ค่าว่างต้องไม่แสดง (ตามต้นแบบ) · ลำดับคงที่', () => {
    expect(contactDetailRows(base).map((r) => r.label)).toEqual(
      ['รหัส', 'โทรศัพท์', 'อีเมล', 'ทะเบียนรถ', 'เครดิต', 'ที่อยู่']);
  });

  it('ทะเบียนรถทุกคัน · เครดิตมีหน่วย', () => {
    const rows = Object.fromEntries(contactDetailRows(base).map((r) => [r.label, r.value]));
    expect(rows['ทะเบียนรถ']).toBe('กค 3279 กรุงเทพมหานคร, ขข 1 นนทบุรี');
    expect(rows['เครดิต']).toBe('30 วัน');
  });

  it('เครดิตศูนย์ = ขายสด ไม่ใช่แถวที่หายไป', () => {
    const rows = Object.fromEntries(contactDetailRows({ ...base, creditDays: 0 }).map((r) => [r.label, r.value]));
    expect(rows['เครดิต']).toBe('เงินสด');
  });

  it('ผู้ขายไม่มีแถวทะเบียนรถ แม้มีข้อมูลค้างมา', () => {
    expect(contactDetailRows({ ...base, kind: 'vendor' }).map((r) => r.label)).not.toContain('ทะเบียนรถ');
  });
});

describe('contactHistoryCard — เอกสารในประวัติซื้อขาย', () => {
  const doc = (over = {}) => ({
    id: 'd1', kind: 'RC', docNo: 'RC-202609-001', docDate: '2026-09-01',
    payable: 5000, paid: 5000, outstanding: 0, ...over,
  });

  it('เอกสารขายลิงก์ไปหน้ารายรับ · ชื่อบนการ์ดคือผู้ติดต่อรายนี้', () => {
    const c = contactHistoryCard(doc(), 'นาย สมชาย ใจดี');
    expect(c.href).toBe('/income/d1');
    expect(c.name).toBe('นาย สมชาย ใจดี');
    expect(c.amount).toBe(5000);
    expect(c.outstanding).toBe(0);
    expect(c.status).toEqual({ label: 'ชำระแล้ว', tone: 'ok' });
  });

  /* ประวัติของผู้ขายเป็นใบซื้อ/ค่าใช้จ่าย — ลิงก์ไปรายรับจะเปิดไม่เจอ */
  it('ใบซื้อและค่าใช้จ่ายลิงก์ไปหน้ารายจ่าย', () => {
    expect(contactHistoryCard(doc({ kind: 'PO' }), 'ร้าน A').href).toBe('/expense/d1');
    expect(contactHistoryCard(doc({ kind: 'EX' }), 'ร้าน A').href).toBe('/expense/d1');
  });

  it('ค้างบางส่วน', () => {
    const c = contactHistoryCard(doc({ paid: 2000, outstanding: 3000 }), 'x');
    expect(c.outstanding).toBe(3000);
    expect(c.status).toEqual({ label: 'ชำระบางส่วน', tone: 'warn' });
  });
});
