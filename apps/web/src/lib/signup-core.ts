import { PROVINCES } from './provinces';
import { quote } from './billing';
import { taxIdChecksumOk, taxIdDigits } from './tax-id';

/**
 * ตรวจใบสมัครใช้บริการ — ส่วนที่ไม่แตะฐานข้อมูล
 *
 * กติกายกมาจากฟอร์มที่ทีมทำ (`drivego-light-signup-form.html` 24 พ.ย. 2569) ทุกข้อ
 * หน้าเว็บเรียกตัวนี้ก่อนส่งเพื่อชี้ช่องที่ผิดทันที และเซิร์ฟเวอร์เรียกซ้ำเสมอ — ไม่เชื่อหน้าเว็บ
 *
 * ชื่อช่อง (name ของ input) ตรงกับฟอร์มเดิม ข้อความผิดพลาดผูกกับชื่อช่องนั้น
 */

export type CustomerType = 'juristic' | 'person';

export const PREFIXES: Record<CustomerType, readonly (readonly [string, string])[]> = {
  juristic: [
    ['co', 'บริษัท … จำกัด'],
    ['pcl', 'บริษัท … จำกัด (มหาชน)'],
    ['lp', 'ห้างหุ้นส่วนจำกัด …'],
    ['op', 'ห้างหุ้นส่วนสามัญนิติบุคคล …'],
  ],
  person: [['mr', 'นาย'], ['mrs', 'นาง'], ['ms', 'นางสาว']],
};

/** ชื่อเต็มที่ขึ้นในใบกำกับภาษี — นิติบุคคลเว้นวรรคหลังคำนำหน้า บุคคลธรรมดาเขียนติดกัน */
export function fullName(prefix: string, name: string): string {
  switch (prefix) {
    case 'co': return `บริษัท ${name} จำกัด`;
    case 'pcl': return `บริษัท ${name} จำกัด (มหาชน)`;
    case 'lp': return `ห้างหุ้นส่วนจำกัด ${name}`;
    case 'op': return `ห้างหุ้นส่วนสามัญนิติบุคคล ${name}`;
    case 'mr': return `นาย${name}`;
    case 'mrs': return `นาง${name}`;
    case 'ms': return `นางสาว${name}`;
    default: return name;
  }
}

export interface Address {
  no: string; moo: string; room: string; bld: string; soi: string; road: string;
  sub: string; dist: string; prov: string; zip: string;
}

/**
 * ที่อยู่หนึ่งบรรทัดตามรูปแบบที่ใช้ในใบกำกับภาษี
 * กรุงเทพฯ ใช้ แขวง/เขต และไม่มีคำว่าจังหวัด · ตัดคำนำหน้าที่ผู้ใช้พิมพ์ซ้ำมาเอง (ซ. ถ. ต. อ.)
 */
export function addressText(a: Address): string {
  const bkk = a.prov === 'กรุงเทพมหานคร';
  const strip = (v: string, re: RegExp) => v.replace(re, '').trim();
  const p = [`เลขที่ ${a.no}`];
  if (a.moo) p.push(`หมู่ที่ ${a.moo}`);
  if (a.bld) p.push(a.bld);
  if (a.room) p.push(a.room);
  if (a.soi) p.push(`ซอย${strip(a.soi, /^(ซอย|ซ\.)\s*/)}`);
  if (a.road) p.push(`ถนน${strip(a.road, /^(ถนน|ถ\.)\s*/)}`);
  p.push(`${bkk ? 'แขวง' : 'ตำบล'}${strip(a.sub, /^(แขวง|ตำบล|ต\.)\s*/)}`);
  p.push(`${bkk ? 'เขต' : 'อำเภอ'}${strip(a.dist, /^(เขต|อำเภอ|อ\.)\s*/)}`);
  p.push(`${bkk ? '' : 'จังหวัด'}${a.prov}`);
  p.push(a.zip);
  return p.join(' ');
}

/** 0-0000-00000-00-0 */
export function formatTaxId(d: string): string {
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)]
    .filter(Boolean).join('-');
}

export interface SignupValue {
  ctype: CustomerType;
  vatRegistered: boolean;
  billName: string;
  taxId: string | null;
  /** null = ไม่จด VAT · 00000 = สำนักงานใหญ่ */
  branchNo: string | null;
  billAddr: Address;
  billAddrText: string;
  billEmail: string;
  /** null = บุคคลธรรมดา (ไม่มีเรื่องหัก ณ ที่จ่าย) */
  wht: boolean | null;
  shopName: string;
  shopProvince: string;
  contactName: string;
  contactPos: string;
  contactTel: string;
  ownerEmail: string;
  amountDue: number;
  amountPaid: number;
  /** ISO พร้อมเขตเวลาไทย */
  paidAt: string;
}

export type SignupCheck =
  | { ok: true; value: SignupValue }
  | { ok: false; errors: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * วันเวลาที่โอน — วันจากปฏิทินไทย (ส่งมาเป็น ISO) กับเวลา ชม:นาที แยกช่อง
 * ห้ามใช้ datetime-local ของเบราว์เซอร์ (แสดง ค.ศ. — form-hygiene.test.ts) · ทุกคนที่โอนอยู่ไทย
 */
export function paidAtIso(date: string, time: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(time.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  const iso = `${date}T${String(hh).padStart(2, '0')}:${m[2]}:00+07:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * @param get   อ่านค่าช่องตามชื่อ — FormData ฝั่งเซิร์ฟเวอร์หรือฟอร์มบนหน้าเว็บ
 * @param now   เวลาปัจจุบัน — เทสต์ใส่เองได้
 */
export function checkSignup(get: (name: string) => string, now = Date.now()): SignupCheck {
  const v = (k: string, max = 150) => get(k).trim().replace(/\s+/g, ' ').slice(0, max);
  const errors: Record<string, string> = {};
  const bad = (k: string, msg: string) => { if (!errors[k]) errors[k] = msg; };

  const ctype = v('ctype');
  const vat = v('vat');
  if (ctype !== 'juristic' && ctype !== 'person') bad('ctype', 'กรุณาเลือกสถานะผู้สมัคร');
  if (vat !== 'yes' && vat !== 'no') bad('vat', 'กรุณาเลือกสถานะการจดทะเบียน VAT');
  const t = ctype as CustomerType;

  const prefix = v('prefix');
  if (!PREFIXES[t]?.some(([k]) => k === prefix)) bad('prefix', 'กรุณาเลือกคำนำหน้า');

  const name = v('name');
  if (name.length < 2) bad('name', 'กรุณากรอกชื่อให้ครบถ้วน');
  else if (t === 'juristic' && /^(บริษัท|บจก|ห้างหุ้นส่วน|หจก)/.test(name)) {
    bad('name', 'พิมพ์เฉพาะชื่อ ไม่ต้องพิมพ์คำว่า "บริษัท" หรือ "ห้างหุ้นส่วน" ซ้ำ');
  } else if (t === 'person' && !name.includes(' ')) {
    bad('name', 'เว้นวรรค 1 ครั้งระหว่างชื่อและนามสกุล');
  }

  const taxRaw = get('taxid');
  const tax = taxIdDigits(taxRaw);
  const taxReq = t === 'juristic' || vat === 'yes';
  if (!tax) {
    if (taxReq) bad('taxid', 'กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก');
  } else if (tax.length < 13) {
    bad('taxid', `ต้องเป็นตัวเลขครบ 13 หลัก (ขณะนี้ ${tax.length} หลัก)`);
  } else if (t === 'juristic' && tax[0] !== '0') {
    bad('taxid', 'เลขทะเบียนนิติบุคคลต้องขึ้นต้นด้วย 0');
  } else if (!taxIdChecksumOk(tax)) {
    bad('taxid', 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (หลักตรวจสอบไม่ตรง) กรุณาตรวจทานอีกครั้ง');
  }

  let branchNo: string | null = null;
  if (vat === 'yes') {
    const br = v('branch');
    const no = v('brno').replace(/\D/g, '');
    if (br === 'hq') branchNo = '00000';
    else if (br === 'br' && /^\d{5}$/.test(no) && no !== '00000') branchNo = no;
    else bad('branch', br ? 'เลขที่สาขาต้องเป็นตัวเลข 5 หลัก (00000 คือสำนักงานใหญ่)'
      : 'กรุณาเลือกสำนักงานใหญ่หรือสาขา');
  }

  const addr: Address = {
    no: v('a_no', 30), moo: v('a_moo', 10), room: v('a_room', 30), bld: v('a_bld', 80),
    soi: v('a_soi', 60), road: v('a_road', 60), sub: v('a_sub', 60), dist: v('a_dist', 60),
    prov: v('a_prov', 60), zip: v('a_zip', 5),
  };
  if (!addr.no) bad('a_no', 'กรุณากรอกเลขที่');
  if (!addr.sub) bad('a_sub', 'กรุณากรอกแขวง/ตำบล');
  if (!addr.dist) bad('a_dist', 'กรุณากรอกเขต/อำเภอ');
  if (!PROVINCES.includes(addr.prov)) bad('a_prov', 'กรุณาเลือกจังหวัด');
  if (!/^[1-9]\d{4}$/.test(addr.zip)) bad('a_zip', 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');

  const billEmail = v('inv_email', 120).toLowerCase();
  if (!EMAIL.test(billEmail)) bad('inv_email', 'รูปแบบอีเมลไม่ถูกต้อง');

  const whtRaw = v('wht');
  if (t === 'juristic' && whtRaw !== 'yes' && whtRaw !== 'no') bad('wht', 'กรุณาเลือก');
  const wht = t === 'juristic' ? whtRaw === 'yes' : null;

  const shopName = v('shop', 100);
  const shopProvince = v('shop_prov', 60);
  const contactName = v('c_name', 100);
  const contactTel = get('c_tel').replace(/\D/g, '');
  const ownerEmail = v('c_email', 120).toLowerCase();
  if (!shopName) bad('shop', 'กรุณากรอกชื่อร้าน');
  if (!PROVINCES.includes(shopProvince)) bad('shop_prov', 'กรุณาเลือกจังหวัด');
  if (contactName.length < 2) bad('c_name', 'กรุณากรอกชื่อผู้ติดต่อ');
  if (!/^0\d{9}$/.test(contactTel)) bad('c_tel', 'เบอร์มือถือต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0');
  if (!EMAIL.test(ownerEmail)) bad('c_email', 'รูปแบบอีเมลไม่ถูกต้อง');

  const paidRaw = get('paid_amount').replace(/[,\s]/g, '');
  const amountPaid = /^\d+(\.\d{1,2})?$/.test(paidRaw) ? Number(paidRaw) : NaN;
  if (!(amountPaid > 0) || amountPaid > 1_000_000) bad('paid_amount', 'กรุณากรอกยอดที่โอนเป็นตัวเลข เช่น 3852.00');

  const paidAt = paidAtIso(get('paid_date').trim(), get('paid_time'));
  if (!paidAt) bad('paid_at', 'กรุณาระบุวันที่และเวลาที่โอนตามสลิป เช่น 10:12');
  else {
    const at = Date.parse(paidAt);
    /* นาฬิกาเครื่องลูกค้าคลาดได้ — ให้อนาคตได้ 10 นาที · ย้อนหลังเกิน 30 วันไม่ใช่สลิปของรอบนี้ */
    if (at > now + 10 * 60_000) bad('paid_at', 'เวลาที่โอนอยู่ในอนาคต — ตรวจวันที่อีกครั้ง');
    else if (at < now - 30 * 86_400_000) bad('paid_at', 'สลิปเก่ากว่า 30 วัน — ติดต่อทีมงานทาง LINE');
  }

  if (get('ok1') !== 'on') bad('ok1', 'กรุณายืนยันความถูกต้องของข้อมูล');
  if (get('ok2') !== 'on') bad('ok2', 'กรุณาให้ความยินยอมเพื่อดำเนินการสมัคร');

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      ctype: t,
      vatRegistered: vat === 'yes',
      billName: fullName(prefix, name),
      taxId: tax || null,
      branchNo,
      billAddr: addr,
      billAddrText: addressText(addr),
      billEmail,
      wht,
      shopName,
      shopProvince,
      contactName,
      contactPos: v('c_pos', 60),
      contactTel,
      ownerEmail,
      amountDue: quote({ wht: wht === true }).total,
      amountPaid,
      paidAt: paidAt!,
    },
  };
}
