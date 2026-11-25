import { describe, expect, it } from 'vitest';
import { addressText, checkSignup, fullName, paidAtIso } from '../src/lib/signup-core';
import { taxIdChecksumOk } from '../src/lib/tax-id';

const NOW = Date.parse('2026-11-25T12:00:00+07:00');

/** ใบสมัครนิติบุคคลจด VAT ที่ผ่านทุกช่อง — แต่ละเทสต์แก้แค่ช่องที่สนใจ */
const BASE: Record<string, string> = {
  ctype: 'juristic', vat: 'yes', prefix: 'co', name: 'แสงทองแอร์', taxid: '0-1055-50000-01-5',
  branch: 'hq', brno: '', a_no: '12', a_moo: '', a_room: '', a_bld: '', a_soi: 'ซ.5', a_road: 'ถ.มิตรภาพ',
  a_sub: 'ในเมือง', a_dist: 'เมืองขอนแก่น', a_prov: 'ขอนแก่น', a_zip: '40000',
  inv_email: 'Acc@Example.com', wht: 'yes', shop: 'แสงทองแอร์', shop_prov: 'ขอนแก่น',
  c_name: 'สมชาย ใจดี', c_pos: '', c_tel: '081-234-5678', c_email: 'owner@example.com',
  paid_amount: '3,744.00', paid_date: '2026-11-25', paid_time: '10:12', ok1: 'on', ok2: 'on',
};
const run = (over: Record<string, string> = {}) => {
  const f = { ...BASE, ...over };
  return checkSignup((k) => f[k] ?? '', NOW);
};
const errorsOf = (over: Record<string, string>) => {
  const r = run(over);
  return r.ok ? {} : r.errors;
};

describe('เลขประจำตัวผู้เสียภาษี — หลักตรวจสอบ', () => {
  it('ถูก / ผิดหนึ่งหลัก / สั้น', () => {
    expect(taxIdChecksumOk('0105550000015')).toBe(true);
    expect(taxIdChecksumOk('0-1055-50000-01-5')).toBe(true);
    expect(taxIdChecksumOk('0105550000016')).toBe(false);
    expect(taxIdChecksumOk('010555000001')).toBe(false);
  });
});

describe('ใบสมัคร', () => {
  it('ผ่าน — ชื่อเต็ม ที่อยู่ ยอดที่ต้องโอน และเวลาโอนเป็นเวลาไทย', () => {
    const r = run();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      billName: 'บริษัท แสงทองแอร์ จำกัด',
      taxId: '0105550000015',
      branchNo: '00000',
      billEmail: 'acc@example.com',
      wht: true,
      contactTel: '0812345678',
      amountDue: 3744,
      amountPaid: 3744,
      paidAt: '2026-11-25T10:12:00+07:00',
    });
    expect(r.value.billAddrText)
      .toBe('เลขที่ 12 ซอย5 ถนนมิตรภาพ ตำบลในเมือง อำเภอเมืองขอนแก่น จังหวัดขอนแก่น 40000');
  });

  it('ยอดที่โอนไม่ตรงก็ส่งได้ — ทีมเป็นคนตัดสิน', () => {
    const r = run({ paid_amount: '3852' });
    expect(r.ok && r.value.amountDue).toBe(3744);
    expect(r.ok && r.value.amountPaid).toBe(3852);
  });

  it('บุคคลธรรมดาไม่จด VAT — ไม่ต้องมีเลขผู้เสียภาษี ไม่มีสาขา ไม่มีหัก ณ ที่จ่าย', () => {
    const r = run({ ctype: 'person', vat: 'no', prefix: 'mr', name: 'สมชาย ใจดี', taxid: '', wht: '' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      billName: 'นายสมชาย ใจดี', taxId: null, branchNo: null, wht: null, amountDue: 3852,
    });
  });

  it('กรุงเทพฯ ใช้ แขวง/เขต ไม่มีคำว่าจังหวัด', () => {
    expect(addressText({
      no: '66', moo: '', room: '', bld: '', soi: 'แสมดำ 13', road: '', sub: 'แขวงแสมดำ',
      dist: 'บางขุนเทียน', prov: 'กรุงเทพมหานคร', zip: '10150',
    })).toBe('เลขที่ 66 ซอยแสมดำ 13 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร 10150');
  });

  it('คำนำหน้าทุกแบบ', () => {
    expect(fullName('pcl', 'เอ')).toBe('บริษัท เอ จำกัด (มหาชน)');
    expect(fullName('lp', 'เอ')).toBe('ห้างหุ้นส่วนจำกัด เอ');
    expect(fullName('ms', 'เอ บี')).toBe('นางสาวเอ บี');
  });

  it.each([
    [{ ctype: '' }, 'ctype'],
    [{ prefix: 'mr' }, 'prefix'],                                      // คำนำหน้าของบุคคลธรรมดา
    [{ name: 'บริษัท แสงทอง' }, 'name'],
    [{ ctype: 'person', prefix: 'mr', name: 'สมชาย' }, 'name'],          // ไม่มีนามสกุล
    [{ taxid: '' }, 'taxid'],
    [{ taxid: '1101700000010' }, 'taxid'],                             // นิติบุคคลต้องขึ้นต้น 0
    [{ taxid: '0105550000016' }, 'taxid'],                             // หลักตรวจผิด
    [{ branch: '' }, 'branch'],
    [{ branch: 'br', brno: '00000' }, 'branch'],
    [{ a_prov: 'กรุงเทพ' }, 'a_prov'],
    [{ a_zip: '0400' }, 'a_zip'],
    [{ inv_email: 'acc@' }, 'inv_email'],
    [{ wht: '' }, 'wht'],
    [{ c_tel: '021234567' }, 'c_tel'],
    [{ paid_amount: '0' }, 'paid_amount'],
    [{ paid_amount: '3,852.555' }, 'paid_amount'],
    [{ paid_time: '' }, 'paid_at'],
    [{ paid_time: '25:00' }, 'paid_at'],
    [{ paid_date: '2026-11-26' }, 'paid_at'],                       // อนาคต
    [{ paid_date: '2026-10-01' }, 'paid_at'],                       // เก่ากว่า 30 วัน
    [{ ok1: '' }, 'ok1'],
    [{ ok2: '' }, 'ok2'],
  ])('ไม่ผ่าน %o → ชี้ช่อง %s', (over, field) => {
    expect(Object.keys(errorsOf(over))).toContain(field);
  });

  it('ข้อความเรื่องเลขผู้เสียภาษีตรงกับปัญหา — ไม่ค้างของรอบก่อน (บั๊กของฟอร์มเดิม)', () => {
    expect(errorsOf({ taxid: '1101700000011' }).taxid).toBe('เลขทะเบียนนิติบุคคลต้องขึ้นต้นด้วย 0');
    expect(errorsOf({ taxid: '0105550000016' }).taxid).toMatch(/หลักตรวจสอบไม่ตรง/);
    expect(errorsOf({ taxid: '01055' }).taxid).toMatch(/ขณะนี้ 5 หลัก/);
  });

  it('สาขาเก็บเลขสาขา · ไม่จด VAT ไม่สนช่องสาขา', () => {
    const r = run({ branch: 'br', brno: '00012' });
    expect(r.ok && r.value.branchNo).toBe('00012');
    const n = run({ vat: 'no', branch: '' });
    expect(n.ok && n.value.branchNo).toBe(null);
  });

  it('เวลาโอน — วัน ISO จากปฏิทินไทย + ชม:นาที (จุดก็ได้ แบบที่สลิปบางธนาคารเขียน)', () => {
    expect(paidAtIso('2026-11-25', '10:12')).toBe('2026-11-25T10:12:00+07:00');
    expect(paidAtIso('2026-11-25', '9.05')).toBe('2026-11-25T09:05:00+07:00');
    expect(paidAtIso('25/11/69', '10:12')).toBe(null);
    expect(paidAtIso('2026-11-25', '1012')).toBe(null);
  });
});
