/**
 * นำเข้าทะเบียนลูกค้าและผู้ขายจาก CSV — ส่วนที่ไม่แตะฐานข้อมูล
 *
 * แยกออกมาเพราะการตัดสินใจว่า "แถวนี้คือใคร จะเพิ่มใหม่หรือปรับปรุงของเดิม"
 * คือส่วนที่ผิดแล้วเจ็บที่สุด — จับคู่ผิดคนหมายถึงข้อมูลลูกค้าสองรายปนกัน
 * แล้วแยกกลับไม่ได้ ทดสอบได้ตรง ๆ โดยไม่ต้องมีฐานข้อมูลจึงคุ้มมาก
 *
 * อ้างอิง: parseContactCSV() · findContact() · planContactImport() ของรุ่น 6.4
 */
import {
  CUST_CSV_HEADERS, CUST_FIELDS, normHeader, normName, parseCsv,
  VEND_CSV_HEADERS, VEND_FIELDS,
} from './csv';

export type ContactKind = 'customer' | 'vendor';

/** เพดานต่อไฟล์ — ตรงกับ IMPORT_LIMIT ของ 6.4 */
export const IMPORT_LIMIT = 3000;

export type ContactRec = Record<string, string>;

/** ผู้ติดต่อเท่าที่การจับคู่ต้องรู้ */
export interface ExistingContact {
  id: string;
  code: string;
  taxId: string;
  /** ชื่อที่ใช้เทียบ — **ไม่รวมคำนำหน้า** ดูเหตุผลที่ matchName() */
  name: string;
}

export function headersOf(kind: ContactKind): readonly string[] {
  return kind === 'vendor' ? VEND_CSV_HEADERS : CUST_CSV_HEADERS;
}

export function fieldsOf(kind: ContactKind): readonly string[] {
  return kind === 'vendor' ? VEND_FIELDS : CUST_FIELDS;
}

/**
 * อ่านไฟล์เป็นแถวข้อมูล
 *
 * จับคู่คอลัมน์จาก**ชื่อหัวตาราง** ผู้ใช้จึงสลับลำดับคอลัมน์ใน Excel ได้
 * ถ้าหัวตารางตรงน้อยกว่าสามช่อง ถือว่าไฟล์นั้นไม่มีหัวตารางที่ใช้ได้
 * แล้วถอยไปอ่านตามลำดับแทน — ตรงกับ useOrder ของต้นฉบับ
 */
export function parseContactCsv(text: string, kind: ContactKind): ContactRec[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล หรือมีแต่หัวคอลัมน์');

  const fields = fieldsOf(kind);
  const head = rows[0]!.map(normHeader);
  const want = headersOf(kind).map(normHeader);
  const idx = want.map((w) => head.indexOf(w));
  const useOrder = idx.filter((i) => i >= 0).length < Math.min(3, want.length);

  return rows.slice(1).map((r) => {
    const o: ContactRec = {};
    fields.forEach((f, i) => {
      const j = useOrder ? i : (idx[i]! >= 0 ? idx[i]! : i);
      o[f] = String(r[j] ?? '').trim();
    });
    return o;
  });
}

/**
 * ชื่อของแถว — **ไม่รวมคำนำหน้า**
 *
 * ต่างจาก custName() ของ 6.4 ที่ใส่คำนำหน้าเข้าไปด้วยตอนเทียบ
 * แต่ recName() ของมันไม่ใส่ ผลคือลูกค้าบุคคลที่มีคำนำหน้า (ซึ่งคือเกือบทุกคน
 * เพราะค่าตั้งต้นคือ "นาย") **จะไม่มีวันจับคู่ด้วยชื่อได้เลย** — เป็นข้อบกพร่อง
 * ไม่ใช่พฤติกรรม เราจึงตัดคำนำหน้าออกทั้งสองฝั่ง
 */
export function recName(rec: ContactRec): string {
  return rec.type === 'นิติบุคคล' || rec.orgName
    ? String(rec.orgName ?? '').trim()
    : [rec.firstName, rec.lastName].filter(Boolean).join(' ').trim();
}

export interface PlanEntry {
  key: string;
  name: string;
  /** ทุกแถวที่เป็นคนเดียวกัน — ลูกค้าหนึ่งรายที่มีสามคันมีสามแถว */
  recs: ContactRec[];
  existing: ExistingContact | null;
}

export interface SkipRow {
  row: number;
  why: string;
}

export interface ImportPlan {
  add: PlanEntry[];
  update: PlanEntry[];
  skip: SkipRow[];
  /** จำนวนแถวที่มีข้อมูลรถ — นับเฉพาะลูกค้า */
  vehicles: number;
  /** จำนวนแถวทั้งหมดที่อ่านได้ */
  rows: number;
}

/**
 * หาผู้ติดต่อเดิม — ไล่จากรหัส เลขผู้เสียภาษี แล้วชื่อ
 *
 * **ลำดับสำคัญ** แถวที่รหัสตรงกับคนหนึ่งแต่ชื่อตรงกับอีกคนหนึ่ง ต้องเข้าคนที่รหัสตรง
 * เพราะรหัสคือสิ่งที่ผู้ใช้ตั้งใจระบุ ส่วนชื่อซ้ำกันได้เป็นเรื่องปกติ
 *
 * คืน `'ambiguous'` เมื่อชื่อตรงมากกว่าหนึ่งราย — 6.4 ใช้ find() คือเอาตัวแรกแล้วหยุด
 * ซึ่งรวมข้อมูลลูกค้าคนละคนเข้าด้วยกันเงียบ ๆ **เรายอมให้ผู้ใช้ไปแก้เองสองแถว
 * ดีกว่ารวมผิดคนแล้วแยกกลับไม่ได้**
 */
export function findExisting(
  rec: ContactRec, name: string, pool: ExistingContact[],
): ExistingContact | null | 'ambiguous' {
  if (rec.code) {
    const hit = pool.find((c) => c.code && c.code === rec.code);
    if (hit) return hit;
  }
  if (rec.taxId) {
    const hit = pool.find((c) => c.taxId && c.taxId === rec.taxId);
    if (hit) return hit;
  }
  if (name) {
    const n = normName(name);
    const hits = pool.filter((c) => c.name && normName(c.name) === n);
    if (hits.length > 1) return 'ambiguous';
    if (hits.length === 1) return hits[0]!;
  }
  return null;
}

/** วางแผนก่อนเขียนจริง — ผู้ใช้ต้องเห็นว่าจะเกิดอะไรก่อนกดยืนยัน */
export function planContactImport(
  kind: ContactKind, recs: ContactRec[], pool: ExistingContact[],
): ImportPlan {
  const plan: ImportPlan = { add: [], update: [], skip: [], vehicles: 0, rows: recs.length };
  const seen = new Map<string, PlanEntry>();

  recs.forEach((rec, i) => {
    const line = i + 2;                       /* +2 เพราะนับหัวตารางและนับจาก 1 */
    const name = recName(rec);
    if (!name) return void plan.skip.push({ row: line, why: 'ไม่มีชื่อ' });

    const key = rec.code || rec.taxId || normName(name);
    const bucket = seen.get(key);
    if (bucket) {
      bucket.recs.push(rec);
      if (kind === 'customer' && hasVehicle(rec)) plan.vehicles++;
      return;
    }

    const hit = findExisting(rec, name, pool);
    if (hit === 'ambiguous') {
      return void plan.skip.push({
        row: line, why: `มีผู้ติดต่อชื่อ "${name}" อยู่แล้วมากกว่าหนึ่งราย — ระบุรหัสในไฟล์`,
      });
    }

    const entry: PlanEntry = { key, name, recs: [rec], existing: hit };
    seen.set(key, entry);
    (hit ? plan.update : plan.add).push(entry);
    if (kind === 'customer' && hasVehicle(rec)) plan.vehicles++;
  });

  return plan;
}

/** แถวนี้มีข้อมูลรถไหม — ตรงกับเงื่อนไขแรกของ applyVehicle() ในต้นฉบับ */
export function hasVehicle(rec: ContactRec): boolean {
  return Boolean(rec.v_plateB || rec.v_brand || rec.v_chassisNo);
}

/**
 * ค่าที่จะเขียนลงผู้ติดต่อหนึ่งราย
 *
 * **ช่องที่เว้นว่างในไฟล์คงค่าเดิมไว้ ไม่ทับด้วยค่าว่าง** — คนที่แก้เบอร์โทร
 * ของลูกค้า 20 ราย ไม่ควรต้องกรอกที่อยู่ซ้ำทั้ง 20 ราย
 * ยกเว้น type / ชื่อ ที่เขียนทับเสมอ เพราะเป็นตัวระบุตัวตน
 */
export interface ContactPatch {
  type: 'person' | 'company';
  prefix?: string;
  firstName?: string;
  lastName?: string;
  orgName?: string;
  taxId?: string;
  tel?: string;
  tel2?: string;
  email?: string;
  note?: string;
  creditDays?: number;
  addr: Record<string, string>;
}

const ADDR_FIELDS: [string, string][] = [
  ['a_no', 'no'], ['a_village', 'village'], ['a_moo', 'moo'], ['a_soi', 'soi'],
  ['a_road', 'road'], ['a_subdistrict', 'subdistrict'], ['a_district', 'district'],
  ['a_province', 'province'], ['a_zip', 'zip'],
];

export function contactPatch(rec: ContactRec, kind: ContactKind): ContactPatch {
  let type: 'person' | 'company' = rec.type === 'นิติบุคคล' ? 'company' : 'person';
  const orgName = String(rec.orgName ?? '').trim();
  const firstName = String(rec.firstName ?? '').trim();
  const lastName = String(rec.lastName ?? '').trim();

  /* ไฟล์ผู้ขายมีแต่ช่อง "ชื่อร้าน/บริษัท" — แถวที่ติ๊กว่าบุคคลแต่กรอกแต่ชื่อร้าน
     จะผิดเงื่อนไขของตาราง (บุคคลต้องมีชื่อ) ให้ถือเป็นนิติบุคคล
     กติกาเดียวกับที่ตัวนำเข้าไฟล์สำรองใช้อยู่แล้ว */
  if (type === 'person' && !firstName && !lastName && orgName) type = 'company';

  const patch: ContactPatch = { type, addr: {} };

  if (type === 'company') {
    patch.orgName = orgName;
    patch.prefix = '';
    patch.firstName = '';
    patch.lastName = '';
  } else {
    patch.prefix = rec.prefix || 'นาย';
    patch.firstName = firstName;
    patch.lastName = lastName;
    patch.orgName = '';
  }
  /* ผู้ขายไม่มีช่องชื่อบุคคลในไฟล์ จึงห้ามล้างชื่อเดิมทิ้ง */
  if (kind === 'vendor' && type === 'person') {
    delete patch.prefix; delete patch.firstName; delete patch.lastName;
  }

  for (const f of ['taxId', 'tel', 'tel2', 'email', 'note'] as const) {
    const v = String(rec[f] ?? '').trim();
    if (v) patch[f] = v;
  }
  if (String(rec.creditDays ?? '').trim()) {
    const n = Math.trunc(Number(String(rec.creditDays).replace(/,/g, '')));
    if (Number.isFinite(n) && n >= 0) patch.creditDays = n;
  }
  for (const [src, dst] of ADDR_FIELDS) {
    const v = String(rec[src] ?? '').trim();
    if (v) patch.addr[dst] = v;
  }
  return patch;
}

export interface VehiclePatch {
  brand: string; model: string; year: string; color: string;
  plateA: string; plateB: string; plateProvince: string;
  engineNo: string; chassisNo: string; mileage: string;
}

export function vehiclePatch(rec: ContactRec): VehiclePatch {
  return {
    brand: rec.v_brand ?? '', model: rec.v_model ?? '', year: rec.v_year ?? '',
    color: rec.v_color ?? '', plateA: rec.v_plateA ?? '', plateB: rec.v_plateB ?? '',
    plateProvince: rec.v_plateProv ?? '', engineNo: rec.v_engineNo ?? '',
    chassisNo: rec.v_chassisNo ?? '', mileage: rec.v_mileage ?? '',
  };
}

/**
 * รถคันนี้คือคันเดิมไหม — เทียบด้วยเลขตัวถังก่อน แล้วค่อยทะเบียน
 * ตรงกับ applyVehicle() ของต้นฉบับ
 */
export function sameVehicle(
  v: { plateA: string; plateB: string; chassisNo: string }, rec: VehiclePatch,
): boolean {
  if (rec.chassisNo && v.chassisNo === rec.chassisNo) return true;
  return Boolean(rec.plateB && v.plateA === rec.plateA && v.plateB === rec.plateB);
}
