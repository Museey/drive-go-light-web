/**
 * นำเข้าทะเบียนลูกค้าและผู้ขายจาก CSV — ส่วนที่ตัดสินใจว่าแถวนี้คือใคร
 *
 * นี่คือส่วนที่ผิดแล้วเจ็บที่สุดของงานนำเข้า — จับคู่ผิดคนแปลว่าข้อมูลลูกค้า
 * สองรายปนกันแล้วแยกกลับไม่ได้ ทดสอบตรงนี้ให้แน่นก่อนแตะฐานข้อมูล
 *
 * หัวตารางอ่านเทียบกับไฟล์ 6.4 โดยตรง ไม่ได้ลอกค่ามาไว้ในเทสต์ —
 * ลอกมาก็ไม่ได้เทียบกับอะไร
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CUST_CSV_HEADERS, CUST_FIELDS, VEND_CSV_HEADERS, VEND_FIELDS,
} from '../src/lib/csv';
import {
  contactPatch, findExisting, parseContactCsv, planContactImport, recName,
  sameVehicle, vehiclePatch, type ExistingContact,
} from '../src/lib/contacts-csv-core';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../../../legacy/drivegolight-6.4-cloud.html'), 'utf8');

/** อ่านอาเรย์ของสตริงชื่อ ... = [ ... ]; ออกมาจากไฟล์ต้นฉบับ */
function stringArray(name: string): string[] {
  const start = html.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`ไม่พบ ${name} ในไฟล์ต้นฉบับ`);
  const end = html.indexOf('];', start);
  return [...html.slice(start, end).matchAll(/'([^']*)'/g)].map((m) => m[1]!);
}

describe('หัวตารางตรงกับรุ่น 6.4', () => {
  it('ทะเบียนลูกค้า', () => {
    expect([...CUST_CSV_HEADERS]).toEqual(stringArray('CUST_CSV_HEADERS'));
  });

  it('ทะเบียนผู้ขาย', () => {
    expect([...VEND_CSV_HEADERS]).toEqual(stringArray('VEND_CSV_HEADERS'));
  });

  it('ชื่อฟิลด์ของลูกค้าตรงกันและมีจำนวนเท่าหัวตาราง', () => {
    expect([...CUST_FIELDS]).toEqual(stringArray('CUST_FIELD_MAP'));
    expect(CUST_FIELDS).toHaveLength(CUST_CSV_HEADERS.length);
  });

  it('ชื่อฟิลด์ของผู้ขายตรงกันและมีจำนวนเท่าหัวตาราง', () => {
    expect([...VEND_FIELDS]).toEqual(stringArray('VEND_FIELD_MAP'));
    expect(VEND_FIELDS).toHaveLength(VEND_CSV_HEADERS.length);
  });
});

/* ---------------------------------------------------------------- */

const H = CUST_CSV_HEADERS.join(',');
const VH = VEND_CSV_HEADERS.join(',');

/** แถวลูกค้าหนึ่งแถว ใส่เฉพาะช่องที่สนใจ ที่เหลือว่าง */
function custRow(o: Record<string, string>): string {
  const by: Record<string, string> = {
    code: o.code ?? '', type: o.type ?? 'บุคคล', prefix: o.prefix ?? '',
    firstName: o.firstName ?? '', lastName: o.lastName ?? '', orgName: o.orgName ?? '',
    taxId: o.taxId ?? '', tel: o.tel ?? '', tel2: '', email: '',
    a_no: o.a_no ?? '', a_village: '', a_moo: '', a_soi: '', a_road: '',
    a_subdistrict: '', a_district: '', a_province: '', a_zip: '',
    creditDays: o.creditDays ?? '', note: o.note ?? '',
    v_brand: o.v_brand ?? '', v_model: '', v_year: '', v_color: '',
    v_plateA: o.v_plateA ?? '', v_plateB: o.v_plateB ?? '', v_plateProv: '',
    v_engineNo: '', v_chassisNo: o.v_chassisNo ?? '', v_mileage: '',
  };
  return CUST_FIELDS.map((f) => by[f] ?? '').join(',');
}

const file = (...rows: string[]) => [H, ...rows].join('\n');

describe('อ่านไฟล์', () => {
  it('อ่านตามชื่อหัวคอลัมน์ ถึงจะสลับลำดับก็ได้', () => {
    /* สลับสองคอลัมน์แรก */
    const head = ['ชื่อ', 'รหัสลูกค้า', 'นามสกุล'].join(',');
    const recs = parseContactCsv(`${head}\nสมชาย,CUS-0007,ใจดี`, 'customer');
    expect(recs[0]!.code).toBe('CUS-0007');
    expect(recs[0]!.firstName).toBe('สมชาย');
    expect(recs[0]!.lastName).toBe('ใจดี');
  });

  it('หัวคอลัมน์ที่ตัดวงเล็บออกแล้วเหมือนกัน ถือว่าคอลัมน์เดียวกัน', () => {
    /* ต้นฉบับเขียนหัวว่า "ประเภท(บุคคล/นิติบุคคล)" — ไฟล์ที่พิมพ์แค่ "ประเภท" ต้องใช้ได้ */
    const recs = parseContactCsv(
      'ชื่อ,ประเภท,นามสกุล\nสมชาย,นิติบุคคล,ใจดี', 'customer');
    expect(recs[0]!.type).toBe('นิติบุคคล');
    expect(recs[0]!.firstName).toBe('สมชาย');
  });

  it('หัวคอลัมน์ที่จับคู่ได้ไม่ถึงสามช่อง ถอยไปอ่านตามลำดับ — ตรงกับ useOrder ของต้นฉบับ', () => {
    const recs = parseContactCsv('ประเภท,ชื่อ\nนิติบุคคล,x', 'customer');
    expect(recs[0]!.code, 'คอลัมน์แรกกลายเป็นรหัส เพราะอ่านตามลำดับ').toBe('นิติบุคคล');
  });

  it('ไฟล์ที่ไม่มีหัวตารางเลย ถอยไปอ่านตามลำดับ', () => {
    const recs = parseContactCsv('a,b,c\nCUS-1,บุคคล,นาย', 'customer');
    expect(recs[0]!.code).toBe('CUS-1');
    expect(recs[0]!.type).toBe('บุคคล');
    expect(recs[0]!.prefix).toBe('นาย');
  });

  it('ไฟล์ที่มีแต่หัวตาราง ต้องบอกว่าไม่มีข้อมูล', () => {
    expect(() => parseContactCsv(H, 'customer')).toThrow(/ไม่มีข้อมูล/);
  });

  it('ผู้ขายใช้ผังคอลัมน์ของตัวเอง', () => {
    const recs = parseContactCsv(`${VH}\nVEN-1,นิติบุคคล,บริษัท ก จำกัด,0105551234567`, 'vendor');
    expect(recs[0]!.orgName).toBe('บริษัท ก จำกัด');
    expect(recs[0]!.taxId).toBe('0105551234567');
  });
});

describe('ชื่อของแถว', () => {
  it('บุคคลใช้ชื่อกับนามสกุล ไม่รวมคำนำหน้า', () => {
    expect(recName({ type: 'บุคคล', prefix: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี' }))
      .toBe('สมชาย ใจดี');
  });

  it('นิติบุคคลใช้ชื่อบริษัท', () => {
    expect(recName({ type: 'นิติบุคคล', orgName: 'บริษัท ก จำกัด' })).toBe('บริษัท ก จำกัด');
  });
});

describe('การจับคู่ผู้ติดต่อเดิม', () => {
  const pool: ExistingContact[] = [
    { id: 'a', code: 'CUS-0001', taxId: '1100400123456', name: 'สมชาย ใจดี' },
    { id: 'b', code: 'CUS-0002', taxId: '', name: 'สมหญิง ดีใจ' },
  ];

  it('รหัสมาก่อนทุกอย่าง', () => {
    const hit = findExisting({ code: 'CUS-0002', taxId: '1100400123456' }, 'สมชาย ใจดี', pool);
    expect((hit as ExistingContact).id, 'รหัสตรงคนหนึ่ง ชื่อตรงอีกคน ต้องเข้าคนที่รหัสตรง')
      .toBe('b');
  });

  it('เลขผู้เสียภาษีมาก่อนชื่อ', () => {
    const hit = findExisting({ code: '', taxId: '1100400123456' }, 'สมหญิง ดีใจ', pool);
    expect((hit as ExistingContact).id).toBe('a');
  });

  it('ชื่อเป็นชั้นสุดท้าย', () => {
    const hit = findExisting({ code: '', taxId: '' }, 'สมหญิง ดีใจ', pool);
    expect((hit as ExistingContact).id).toBe('b');
  });

  it('ชื่อที่ต่างแค่ช่องว่างและตัวพิมพ์ ถือว่าตรงกัน', () => {
    const hit = findExisting({}, '  สมหญิง   ดีใจ ', pool);
    expect((hit as ExistingContact).id).toBe('b');
  });

  it('ไม่ตรงเลย ได้ null', () => {
    expect(findExisting({ code: 'CUS-9999' }, 'ไม่มีใครชื่อนี้', pool)).toBeNull();
  });

  /** จุดที่เราตั้งใจต่างจากต้นฉบับ */
  it('ชื่อซ้ำสองราย ต้องบอกว่ากำกวม ไม่ใช่เลือกตัวแรก', () => {
    const twins: ExistingContact[] = [
      { id: 'x', code: 'CUS-1', taxId: '', name: 'สมชาย ใจดี' },
      { id: 'y', code: 'CUS-2', taxId: '', name: 'สมชาย ใจดี' },
    ];
    expect(findExisting({}, 'สมชาย ใจดี', twins)).toBe('ambiguous');
  });
});

describe('วางแผนก่อนนำเข้า', () => {
  const pool: ExistingContact[] = [
    { id: 'a', code: 'CUS-0001', taxId: '', name: 'สมชาย ใจดี' },
  ];

  it('แยกเพิ่มใหม่กับปรับปรุงของเดิม', () => {
    const recs = parseContactCsv(file(
      custRow({ code: 'CUS-0001', firstName: 'สมชาย', lastName: 'ใจดี', tel: '081' }),
      custRow({ firstName: 'สมปอง', lastName: 'มีสุข' }),
    ), 'customer');
    const plan = planContactImport('customer', recs, pool);
    expect(plan.update).toHaveLength(1);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]!.name).toBe('สมปอง มีสุข');
  });

  it('ลูกค้าคนเดียวสามแถวสามคัน รวมเป็นรายการเดียว', () => {
    const rows = ['1234', '5678', '9012'].map((b) =>
      custRow({ firstName: 'สมปอง', lastName: 'มีสุข', v_plateA: 'กข', v_plateB: b }));
    const plan = planContactImport('customer', parseContactCsv(file(...rows), 'customer'), []);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]!.recs).toHaveLength(3);
    expect(plan.vehicles).toBe(3);
  });

  it('แถวที่ไม่มีชื่อถูกข้ามพร้อมบอกเลขบรรทัด', () => {
    const plan = planContactImport('customer', parseContactCsv(file(
      custRow({ firstName: 'สมปอง', lastName: 'มีสุข' }),
      custRow({ tel: '081' }),
    ), 'customer'), []);
    expect(plan.skip).toEqual([{ row: 3, why: 'ไม่มีชื่อ' }]);
  });

  it('ชื่อกำกวมถูกข้ามพร้อมบอกให้ใส่รหัส', () => {
    const twins: ExistingContact[] = [
      { id: 'x', code: 'CUS-1', taxId: '', name: 'สมชาย ใจดี' },
      { id: 'y', code: 'CUS-2', taxId: '', name: 'สมชาย ใจดี' },
    ];
    const plan = planContactImport('customer', parseContactCsv(file(
      custRow({ firstName: 'สมชาย', lastName: 'ใจดี' }),
    ), 'customer'), twins);
    expect(plan.add).toHaveLength(0);
    expect(plan.update).toHaveLength(0);
    expect(plan.skip[0]!.why).toMatch(/มากกว่าหนึ่งราย/);
  });

  it('นับแถวที่อ่านได้ทั้งหมด', () => {
    const plan = planContactImport('customer', parseContactCsv(file(
      custRow({ firstName: 'ก', lastName: 'ก' }),
      custRow({ firstName: 'ข', lastName: 'ข' }),
    ), 'customer'), []);
    expect(plan.rows).toBe(2);
  });
});

describe('ค่าที่จะเขียนลงผู้ติดต่อ', () => {
  it('ช่องที่เว้นว่างไม่ถูกส่งไปทับของเดิม', () => {
    const p = contactPatch({ type: 'บุคคล', firstName: 'สมชาย', lastName: 'ใจดี', tel: '081' },
      'customer');
    expect(p.tel).toBe('081');
    expect(p, 'tel2 ว่างในไฟล์ ต้องไม่มีในสิ่งที่จะเขียน').not.toHaveProperty('tel2');
    expect(p.addr, 'ที่อยู่ว่างทั้งหมด ต้องไม่มีคีย์เลย').toEqual({});
  });

  it('ที่อยู่เขียนเฉพาะช่องที่กรอกมา', () => {
    const p = contactPatch({ a_no: '88/12', a_province: 'กรุงเทพมหานคร' }, 'customer');
    expect(p.addr).toEqual({ no: '88/12', province: 'กรุงเทพมหานคร' });
  });

  it('นิติบุคคลล้างชื่อบุคคล และกลับกัน', () => {
    expect(contactPatch({ type: 'นิติบุคคล', orgName: 'บริษัท ก' }, 'customer'))
      .toMatchObject({ type: 'company', orgName: 'บริษัท ก', firstName: '', lastName: '' });
    expect(contactPatch({ type: 'บุคคล', firstName: 'สมชาย' }, 'customer'))
      .toMatchObject({ type: 'person', orgName: '', firstName: 'สมชาย' });
  });

  it('คำนำหน้าที่ไม่ได้กรอกใช้ นาย ตามต้นฉบับ', () => {
    expect(contactPatch({ type: 'บุคคล', firstName: 'สมชาย' }, 'customer').prefix).toBe('นาย');
  });

  it('ผู้ขายที่ติ๊กว่าบุคคลแต่กรอกแต่ชื่อร้าน ถือเป็นนิติบุคคล', () => {
    const p = contactPatch({ type: 'บุคคล', orgName: 'ร้านอะไหล่เจ๊แดง' }, 'vendor');
    expect(p.type, 'ไม่งั้นจะผิดเงื่อนไขของตารางที่บังคับว่าบุคคลต้องมีชื่อ').toBe('company');
    expect(p.orgName).toBe('ร้านอะไหล่เจ๊แดง');
  });

  it('ผู้ขายที่เป็นบุคคลจริง ต้องไม่ล้างชื่อเดิมทิ้ง เพราะไฟล์ไม่มีช่องชื่อบุคคล', () => {
    const p = contactPatch({ type: 'บุคคล' }, 'vendor');
    expect(p).not.toHaveProperty('firstName');
    expect(p).not.toHaveProperty('lastName');
  });

  it('เครดิตที่กรอกไม่ใช่ตัวเลขถูกทิ้ง ไม่ใช่กลายเป็น 0', () => {
    expect(contactPatch({ creditDays: 'สามสิบ' }, 'customer')).not.toHaveProperty('creditDays');
    expect(contactPatch({ creditDays: '30' }, 'customer').creditDays).toBe(30);
    expect(contactPatch({ creditDays: '0' }, 'customer').creditDays).toBe(0);
  });
});

describe('การจับคู่รถ', () => {
  const v = { plateA: 'กข', plateB: '1234', chassisNo: 'MR0FR22G8L1234567' };

  it('เลขตัวถังตรงถือว่าคันเดิม ถึงทะเบียนจะเปลี่ยน', () => {
    expect(sameVehicle(v, vehiclePatch({ v_chassisNo: 'MR0FR22G8L1234567', v_plateB: '9999' })))
      .toBe(true);
  });

  it('ทะเบียนตรงทั้งหมวดอักษรและเลข ถือว่าคันเดิม', () => {
    expect(sameVehicle(v, vehiclePatch({ v_plateA: 'กข', v_plateB: '1234' }))).toBe(true);
  });

  it('เลขทะเบียนตรงแต่หมวดอักษรต่าง ไม่ใช่คันเดิม', () => {
    expect(sameVehicle(v, vehiclePatch({ v_plateA: 'คง', v_plateB: '1234' }))).toBe(false);
  });

  it('แถวที่ไม่มีข้อมูลรถเลย ไม่ตรงกับคันไหน', () => {
    expect(sameVehicle(v, vehiclePatch({}))).toBe(false);
  });
});
