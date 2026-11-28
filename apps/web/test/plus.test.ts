/**
 * DriveGo Light Plus — ส่วนที่ไม่ต้องใช้ฐานข้อมูล: แพ็กเกจ สูตรเงินเดือน ข้อความแจ้งลูกค้า ตัวเลือกงวดภาษี
 *
 * เรื่องเงินเดือนกับประกันสังคมเถียงกับพนักงานไม่ได้ ต้องมีเทสต์ยืนยันทุกขอบ
 * ส่วนที่คุยกับฐานข้อมูลอยู่ที่ plus-db.test.ts
 */
import { describe, expect, it } from 'vitest';
import { appointmentMessage, appointmentProblem, apptViewOf } from '../src/lib/appointments-core';
import {
  isPeriod, lineNet, payLineProblem, payTotals, periodEnd, SSO_MAX_WAGE, ssoOf, suggestLine, whtOf,
} from '../src/lib/payroll-calc';
import { employeeProblem } from '../src/lib/payroll-core';
import { isPlusPlan, PLAN_CHOICES, PLAN_LIGHT, PLAN_PLUS, planLabel } from '../src/lib/plan-core';
import { canTab, type PermSubject } from '../src/lib/perms';
import { recentMonths, TAX_DOCS, taxDocNeedsPayroll, taxDocOf, taxMonthOf } from '../src/lib/tax-core';

describe('แพ็กเกจ Light / Light Plus', () => {
  it('ขึ้นต้นด้วย plus เท่านั้นที่เป็น Plus — ทดลองใช้และค่าที่ไม่รู้จักเป็น Light', () => {
    expect(isPlusPlan(PLAN_PLUS)).toBe(true);
    expect(isPlusPlan(' Plus-Yearly ')).toBe(true);
    expect(isPlusPlan(PLAN_LIGHT)).toBe(false);
    expect(isPlusPlan(null)).toBe(false);
    expect(isPlusPlan(undefined)).toBe(false);
    expect(isPlusPlan('')).toBe(false);
    expect(isPlusPlan('light-plus')).toBe(false);
  });

  it('ตัวเลือกในคอนโซลมีทั้งสองแพ็กเกจ และแพ็กเกจ Plus ที่เลือกได้ถูกอ่านเป็น Plus จริง', () => {
    expect(PLAN_CHOICES.map((c) => c.value)).toEqual([PLAN_LIGHT, PLAN_PLUS]);
    expect(PLAN_CHOICES.filter((c) => isPlusPlan(c.value)).map((c) => c.value)).toEqual([PLAN_PLUS]);
  });

  it('ชื่อแพ็กเกจที่แสดงให้ผู้ใช้', () => {
    expect(planLabel(null)).toBe('ทดลองใช้');
    expect(planLabel(PLAN_LIGHT)).toBe('Light!');
    expect(planLabel(PLAN_PLUS)).toBe('Light Plus');
  });
});

describe('สิทธิ์แท็บเงินเดือน — ต้องติ๊กให้ตรง ๆ เท่านั้น', () => {
  const staff = (perms: PermSubject['perms']): PermSubject => ({ role: 'staff', perms });

  it('เจ้าของเข้าได้เสมอ', () => {
    expect(canTab({ role: 'owner', perms: {} }, 'finance', 'payroll')).toBe(true);
  });

  it('พนักงานที่ได้เมนูบัญชีทั้งเมนู (ไม่เคยตั้งรายแท็บ) ไม่เห็นเงินเดือน แต่ยังเห็นแท็บอื่นตามเดิม', () => {
    const s = staff({ menus: { finance: true } });
    expect(canTab(s, 'finance', 'payroll')).toBe(false);
    expect(canTab(s, 'finance', 'ar')).toBe(true);
    expect(canTab(s, 'finance', 'tax')).toBe(true);
  });

  it('ติ๊กแท็บเงินเดือนให้แล้วจึงเข้าได้ — และต้องมีสิทธิ์เห็นต้นทุนด้วย', () => {
    const tabs = { 'finance.payroll': true };
    expect(canTab(staff({ menus: { finance: true }, tabs }), 'finance', 'payroll')).toBe(true);
    expect(canTab(staff({ menus: { finance: true }, tabs, cost: false }), 'finance', 'payroll')).toBe(false);
  });

  it('ไม่มีเมนูบัญชีเลย ติ๊กแท็บไว้ก็เข้าไม่ได้', () => {
    expect(canTab(staff({ tabs: { 'finance.payroll': true } }), 'finance', 'payroll')).toBe(false);
  });
});

describe('ประกันสังคม', () => {
  it('5% ของค่าจ้าง', () => {
    expect(ssoOf(10000)).toBe(500);
    expect(ssoOf(12345)).toBe(617);   /* 617.25 ปัดทิ้ง */
    expect(ssoOf(12350)).toBe(618);   /* 617.50 ปัดขึ้น */
  });

  it('เพดานค่าจ้าง 17,500 — สูงสุด 875 บาท', () => {
    expect(SSO_MAX_WAGE).toBe(17500);
    expect(ssoOf(17500)).toBe(875);
    expect(ssoOf(17501)).toBe(875);
    expect(ssoOf(80000)).toBe(875);
  });

  it('ค่าจ้างต่ำกว่า 1,650 คิดจากฐาน 1,650', () => {
    expect(ssoOf(1000)).toBe(83);     /* 1,650 × 5% = 82.50 ปัดขึ้น */
    expect(ssoOf(1650)).toBe(83);
  });

  it('ไม่หักเมื่อปิดไว้ ค่าจ้างเป็นศูนย์ ติดลบ หรือไม่ใช่ตัวเลข', () => {
    expect(ssoOf(20000, false)).toBe(0);
    expect(ssoOf(0)).toBe(0);
    expect(ssoOf(-500)).toBe(0);
    expect(ssoOf(Number.NaN)).toBe(0);
  });
});

describe('บรรทัดเงินเดือน', () => {
  it('ภาษีหัก ณ ที่จ่ายตามอัตรารายคน ปัดสองตำแหน่ง', () => {
    expect(whtOf(20000, 3)).toBe(600);
    expect(whtOf(15555.55, 3)).toBe(466.67);
    expect(whtOf(20000, 0)).toBe(0);
    expect(whtOf(-1, 3)).toBe(0);
  });

  it('เพดานเงินสมทบขึ้นกับงวด — ก่อน ม.ค. 2569 ใช้ 15,000 (สูงสุด 750 บาท)', () => {
    expect(ssoOf(20000, true, '2025-12')).toBe(750);
    expect(ssoOf(20000, true, '2026-01')).toBe(875);
    expect(ssoOf(10000, true, '2025-12')).toBe(500);
    expect(suggestLine({ baseSalary: 18000, ssoEnabled: true, whtRate: 0 }, '2025-06').sso).toBe(750);
    /* ไม่ส่งงวด หรือส่งค่าที่ไม่ใช่งวด = เพดานปัจจุบัน */
    expect(ssoOf(20000, true, null)).toBe(875);
    expect(ssoOf(20000, true, 'x')).toBe(875);
  });

  it('ค่าเสนอจากทะเบียนพนักงาน', () => {
    expect(suggestLine({ baseSalary: 18000, ssoEnabled: true, whtRate: 3 }))
      .toEqual({ base: 18000, overtime: 0, otherIncome: 0, sso: 875, wht: 540, otherDeduct: 0 });
    expect(suggestLine({ baseSalary: 9000, ssoEnabled: false, whtRate: 0 }))
      .toEqual({ base: 9000, overtime: 0, otherIncome: 0, sso: 0, wht: 0, otherDeduct: 0 });
  });

  it('จ่ายสุทธิ = เงินได้รวม − รายการหักรวม', () => {
    expect(lineNet({ base: 18000, overtime: 1500.5, otherIncome: 300, sso: 875, wht: 540, otherDeduct: 200 }))
      .toBe(18185.5);
  });

  it('ยอดรวมของงวดไม่สะสมเศษทศนิยม', () => {
    const line = { base: 0.1, overtime: 0.2, otherIncome: 0, sso: 0, wht: 0, otherDeduct: 0 };
    const t = payTotals([line, line, line]);
    expect(t.income).toBe(0.9);
    expect(t.net).toBe(0.9);
  });

  it('หักมากกว่าเงินได้ และยอดติดลบ ถูกปฏิเสธพร้อมชื่อพนักงาน', () => {
    const ok = { base: 10000, overtime: 0, otherIncome: 0, sso: 500, wht: 0, otherDeduct: 0 };
    expect(payLineProblem(ok, 'สมชาย')).toBeNull();
    expect(payLineProblem({ ...ok, otherDeduct: 9600 }, 'สมชาย')).toContain('สมชาย');
    expect(payLineProblem({ ...ok, base: -1 }, 'สมชาย')).toContain('ไม่ติดลบ');
    expect(payLineProblem({ ...ok, base: Number.NaN }, 'สมชาย')).toContain('ไม่ติดลบ');
  });

  it('รูปแบบงวดและวันสิ้นเดือน รวมกุมภาพันธ์ปีอธิกสุรทิน', () => {
    expect(isPeriod('2026-11')).toBe(true);
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod('2569-11x')).toBe(false);
    expect(periodEnd('2026-11')).toBe('2026-11-30');
    expect(periodEnd('2028-02')).toBe('2028-02-29');
    expect(periodEnd('2027-02')).toBe('2027-02-28');
  });
});

describe('ตรวจข้อมูลพนักงานก่อนบันทึก', () => {
  const base = {
    code: 'EMP-001', name: 'สมชาย ใจดี', position: '', empType: 'full' as const, taxId: '', addrText: '', tel: '',
    baseSalary: 15000, ssoEnabled: true, whtRate: 0, bankName: '', bankAccountNo: '', startedOn: null, note: '',
  };

  it('ข้อมูลครบผ่าน — เลขผู้เสียภาษีเว้นว่างได้', () => {
    expect(employeeProblem(base)).toBeNull();
    expect(employeeProblem({ ...base, taxId: '1234567890123' })).toBeNull();
  });

  it('บอกช่องที่ผิด', () => {
    expect(employeeProblem({ ...base, name: ' ' })?.field).toBe('name');
    expect(employeeProblem({ ...base, code: '' })?.field).toBe('code');
    expect(employeeProblem({ ...base, taxId: '12345' })?.field).toBe('taxId');
    expect(employeeProblem({ ...base, baseSalary: -1 })?.field).toBe('baseSalary');
    expect(employeeProblem({ ...base, whtRate: 101 })?.field).toBe('whtRate');
  });
});

describe('นัดหมาย', () => {
  const appt = {
    kind: 'repair' as const, date: '2026-11-30', time: '09:30', contactId: null, vehicleId: null,
    partyName: 'สมหญิง', tel: '0812345678', plate: '1กข 1234 กรุงเทพมหานคร', title: 'เช็กระยะ 40,000 กม.', note: '',
  };

  it('ตรวจฟอร์ม — ต้องมีวันที่ เรื่อง และข้อมูลติดต่ออย่างน้อยหนึ่งอย่าง', () => {
    expect(appointmentProblem(appt)).toBeNull();
    expect(appointmentProblem({ ...appt, time: '' })).toBeNull();
    expect(appointmentProblem({ ...appt, date: '' })?.field).toBe('date');
    expect(appointmentProblem({ ...appt, time: '25:00' })?.field).toBe('time');
    expect(appointmentProblem({ ...appt, title: '  ' })?.field).toBe('title');
    expect(appointmentProblem({ ...appt, partyName: '', tel: '', plate: '' })?.field).toBe('partyName');
    expect(appointmentProblem({ ...appt, partyName: '', tel: '' })).toBeNull();
  });

  it('ข้อความนัดเข้าซ่อม — มีชื่อ ทะเบียน เรื่อง วันที่ พ.ศ. เวลา และเบอร์ร้าน', () => {
    const msg = appointmentMessage(appt, { name: 'อู่ทดสอบ', tel: '02-111-2222' });
    expect(msg).toContain('เรียน คุณสมหญิง');
    expect(msg).toContain('รถทะเบียน 1กข 1234 กรุงเทพมหานคร');
    expect(msg).toContain('ขอยืนยันนัดหมาย');
    expect(msg).toContain('เช็กระยะ 40,000 กม.');
    expect(msg).toContain('30 พ.ย. 2569 เวลา 09:30 น.');
    expect(msg).toContain('02-111-2222');
  });

  it('ข้อความเตือนลูกค้า — ช่องที่ว่างถูกข้ามทั้งวรรค ไม่ทิ้งคำลอย', () => {
    const msg = appointmentMessage(
      { ...appt, kind: 'remind', partyName: '', plate: '', time: '' }, { name: 'อู่ทดสอบ', tel: '' });
    expect(msg).toContain('เรียนลูกค้า');
    expect(msg).toContain('ขอแจ้งเตือน ถึงกำหนด เช็กระยะ 40,000 กม.');
    expect(msg).not.toContain('ทะเบียน');
    expect(msg).not.toContain('เวลา');
    expect(msg).not.toContain('undefined');
  });

  it('ชื่อที่ขึ้นต้นด้วย "คุณ" อยู่แล้วไม่ถูกเติมซ้ำ', () => {
    expect(appointmentMessage({ ...appt, partyName: 'คุณสมหญิง' }, { name: 'อู่' })).toContain('เรียน คุณสมหญิง');
    expect(appointmentMessage({ ...appt, partyName: 'คุณสมหญิง' }, { name: 'อู่' })).not.toContain('คุณคุณ');
  });

  it('มุมมองที่ไม่รู้จักกลับไปที่ "ที่จะถึง"', () => {
    expect(apptViewOf('overdue')).toBe('overdue');
    expect(apptViewOf('xyz')).toBe('upcoming');
    expect(apptViewOf(undefined)).toBe('upcoming');
  });
});

describe('ตัวเลือกของหน้าเอกสารภาษี', () => {
  it('แบบที่ไม่รู้จักกลับไปที่รายงานภาษีขาย', () => {
    expect(taxDocOf('pnd53')).toBe('pnd53');
    expect(taxDocOf('../etc')).toBe('vat-out');
    expect(taxDocOf(null)).toBe('vat-out');
  });

  it('แบบที่แสดงเงินได้ของพนักงานรายคนต้องมีสิทธิ์แท็บเงินเดือนด้วย — ที่เหลือไม่ต้อง', () => {
    expect(TAX_DOCS.filter((d) => taxDocNeedsPayroll(d.key)).map((d) => d.key)).toEqual(['pnd1', 'sso']);
  });

  it('งวดที่ผิดรูปแบบใช้เดือนของวันนี้', () => {
    expect(taxMonthOf('2026-03', '2026-11-24')).toBe('2026-03');
    expect(taxMonthOf('2026-3', '2026-11-24')).toBe('2026-11');
    expect(taxMonthOf("2026-03'; drop", '2026-11-24')).toBe('2026-11');
  });

  it('รายการเดือนย้อนหลังข้ามปีได้ถูกต้อง เรียงล่าสุดก่อน', () => {
    expect(recentMonths('2026-02-10', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });
});
