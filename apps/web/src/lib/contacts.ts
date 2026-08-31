import 'server-only';
import { query } from './auth';
import { mutate } from './mutate';

const n = (v: unknown): number => Number(v ?? 0);

export interface Vehicle {
  id?: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  plateA: string;
  plateB: string;
  plateProvince: string;
  engineNo: string;
  chassisNo: string;
  mileage: string;
}

export interface ContactAddr {
  no?: string; village?: string; moo?: string; soi?: string; road?: string;
  subdistrict?: string; district?: string; province?: string; zip?: string;
}

export interface Contact {
  id: string;
  code: string;
  kind: 'customer' | 'vendor';
  type: 'person' | 'company';
  prefix: string;
  firstName: string;
  lastName: string;
  orgName: string;
  taxId: string;
  addr: ContactAddr;
  addrText: string;
  tel: string;
  tel2: string;
  email: string;
  note: string;
  creditDays: number;
  createdOn: string;
  /** ชื่อที่ใช้แสดง */
  displayName: string;
  vehicleCount: number;
  vehicles?: Vehicle[];
}

/** ชื่อสำหรับแสดง — ตรงกับ custName() ของโปรแกรมเดิม */
export const displayName = (c: {
  type: string; orgName: string; prefix: string; firstName: string; lastName: string;
}): string =>
  c.type === 'company'
    ? c.orgName
    : [c.prefix, c.firstName, c.lastName].filter(Boolean).join(' ');

function toContact(r: any): Contact {
  const base = {
    type: r.type, orgName: r.org_name, prefix: r.prefix,
    firstName: r.first_name, lastName: r.last_name,
  };
  return {
    id: r.id,
    code: r.code,
    kind: r.kind,
    type: r.type,
    prefix: r.prefix,
    firstName: r.first_name,
    lastName: r.last_name,
    orgName: r.org_name,
    taxId: r.tax_id ?? '',
    addr: r.addr ?? {},
    addrText: r.addr_text ?? '',
    tel: r.tel,
    tel2: r.tel2,
    email: r.email ?? '',
    note: r.note,
    creditDays: Number(r.credit_days),
    createdOn: r.created_on,
    displayName: displayName(base),
    vehicleCount: Number(r.vehicle_count ?? 0),
  };
}

const PAGE_SIZE = 40;

export async function listContacts(opts: {
  search?: string;
  kind?: string;
  type?: string;
  page?: number;
  /** ขอทุกแถวโดยไม่แบ่งหน้า — ใช้ตอนสั่งพิมพ์รายชื่อ */
  all?: boolean;
}): Promise<{ rows: Contact[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const search = (opts.search ?? '').trim();

  return query(async (c) => {
    const where: string[] = [];
    const params: unknown[] = [];

    if (opts.kind === 'customer' || opts.kind === 'vendor') {
      params.push(opts.kind);
      where.push(`k.kind = $${params.length}`);
    }
    if (opts.type === 'person' || opts.type === 'company') {
      params.push(opts.type);
      where.push(`k.type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      // ค้นจากชื่อ รหัส เบอร์โทร และทะเบียนรถ — ทะเบียนคือสิ่งที่หน้าเคาน์เตอร์จำได้
      where.push(`(k.code ilike $${i} or k.org_name ilike $${i}
                   or k.first_name ilike $${i} or k.last_name ilike $${i}
                   or k.tel ilike $${i} or k.tel2 ilike $${i}
                   or exists (select 1 from vehicles v
                              where v.contact_id = k.id
                                and (v.plate_b ilike $${i} or v.plate_a ilike $${i})))`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const totalRes = await c.query(`select count(*)::int as c from contacts k ${whereSql}`, params);

    const limitSql = opts.all
      ? ''
      : `limit $${params.length + 1} offset $${params.length + 2}`;
    if (!opts.all) params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);

    const { rows } = await c.query(
      `select k.*, (select count(*) from vehicles v where v.contact_id = k.id) as vehicle_count
       from contacts k ${whereSql}
       order by k.code
       ${limitSql}`,
      params,
    );

    return { total: totalRes.rows[0].c, rows: rows.map(toContact) };
  });
}

export async function getContact(id: string): Promise<Contact | null> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select k.*, (select count(*) from vehicles v where v.contact_id = k.id) as vehicle_count
       from contacts k where k.id = $1`,
      [id],
    );
    if (!rows[0]) return null;

    const veh = await c.query(
      `select * from vehicles where contact_id = $1 order by created_at`, [id],
    );

    return {
      ...toContact(rows[0]),
      vehicles: veh.rows.map((v) => ({
        id: v.id,
        brand: v.brand, model: v.model, year: v.year, color: v.color,
        plateA: v.plate_a, plateB: v.plate_b, plateProvince: v.plate_province,
        engineNo: v.engine_no, chassisNo: v.chassis_no, mileage: v.mileage,
      })),
    };
  });
}

/** ประวัติซื้อขายของผู้ติดต่อรายหนึ่ง — ตรงกับ custHistory / vendHistory ของเดิม */
export interface ContactHistory {
  docs: {
    id: string; kind: string; docNo: string; docDate: string;
    payable: number; paid: number; outstanding: number;
  }[];
  totalAmount: number;
  totalOutstanding: number;
  lastDocDate: string | null;
}

export async function getContactHistory(id: string): Promise<ContactHistory> {
  return query(async (c) => {
    const { rows } = await c.query(
      `select d.id, d.kind::text as kind, d.doc_no, d.doc_date, d.payable,
              coalesce(p.paid, 0) as paid
       from documents d
       left join (select doc_id, sum(amount) as paid from payments group by doc_id) p
              on p.doc_id = d.id
       where d.party_id = $1 and d.status <> 'void' and d.kind <> 'QT'
       order by d.doc_date desc, d.doc_no desc
       limit 100`,
      [id],
    );

    const docs = rows.map((r) => {
      const payable = n(r.payable);
      const paid = n(r.paid);
      return {
        id: r.id, kind: r.kind, docNo: r.doc_no, docDate: r.doc_date,
        payable, paid,
        outstanding: Math.round((payable - paid) * 100) / 100,
      };
    });

    return {
      docs,
      totalAmount: Math.round(docs.reduce((s, d) => s + d.payable, 0) * 100) / 100,
      totalOutstanding: Math.round(
        docs.filter((d) => d.outstanding > 0.004).reduce((s, d) => s + d.outstanding, 0) * 100,
      ) / 100,
      lastDocDate: docs[0]?.docDate ?? null,
    };
  });
}

/* =====================================================================
   การเขียนข้อมูล
   ===================================================================== */

export interface ContactInput {
  id?: string;
  code: string;
  kind: 'customer' | 'vendor';
  type: 'person' | 'company';
  prefix: string;
  firstName: string;
  lastName: string;
  orgName: string;
  taxId: string;
  addr: ContactAddr;
  addrText: string;
  tel: string;
  tel2: string;
  email: string;
  note: string;
  creditDays: number;
  vehicles: Vehicle[];
}

/** ออกรหัสถัดไป — CUS-0001 หรือ VEN-0001 ตามชนิด เหมือน nextCustCode() ของเดิม */
export async function nextContactCode(kind: 'customer' | 'vendor'): Promise<string> {
  return query(async (c) => {
    const prefix = kind === 'vendor' ? 'VEN-' : 'CUS-';
    const { rows } = await c.query(
      `select coalesce(max(substring(code from '[0-9]+$')::int), 0) as last
       from contacts where kind = $1 and code ~ ('^' || $2 || '[0-9]+$')`,
      [kind, prefix],
    );
    return prefix + String(Number(rows[0].last) + 1).padStart(4, '0');
  });
}

export async function saveContact(input: ContactInput): Promise<string> {
  return mutate('customer', async (c) => {
    let id = input.id;

    if (id) {
      await c.query(
        `update contacts set code=$2, kind=$3, type=$4, prefix=$5, first_name=$6, last_name=$7,
                org_name=$8, tax_id=$9, addr=$10, addr_text=$11, tel=$12, tel2=$13,
                email=$14, note=$15, credit_days=$16
         where id=$1`,
        [id, input.code, input.kind, input.type, input.prefix, input.firstName, input.lastName,
         input.orgName, input.taxId || null, JSON.stringify(input.addr), input.addrText,
         input.tel, input.tel2, input.email || null, input.note, input.creditDays],
      );
    } else {
      const { rows } = await c.query(
        `insert into contacts (tenant_id, code, kind, type, prefix, first_name, last_name,
                               org_name, tax_id, addr, addr_text, tel, tel2, email, note, credit_days)
         values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         returning id`,
        [input.code, input.kind, input.type, input.prefix, input.firstName, input.lastName,
         input.orgName, input.taxId || null, JSON.stringify(input.addr), input.addrText,
         input.tel, input.tel2, input.email || null, input.note, input.creditDays],
      );
      id = rows[0].id;
    }

    /* รถที่ถูกเอาออกจากฟอร์ม ให้ลบ — ยกเว้นคันที่มีเอกสารอ้างถึง
       เอกสารเก็บ snapshot รถไว้ในตัวเองแล้ว การลบทะเบียนจึงไม่ทำให้เอกสารเก่าเสียหาย */
    const keep = input.vehicles.map((v) => v.id).filter(Boolean) as string[];
    await c.query(
      `delete from vehicles
       where contact_id = $1
         and ($2::uuid[] is null or not (id = any($2)))
         and not exists (select 1 from documents d where d.vehicle_id = vehicles.id)`,
      [id, keep.length ? keep : null],
    );

    for (const v of input.vehicles) {
      if (v.id) {
        await c.query(
          `update vehicles set brand=$2, model=$3, year=$4, color=$5, plate_a=$6, plate_b=$7,
                  plate_province=$8, engine_no=$9, chassis_no=$10, mileage=$11
           where id=$1`,
          [v.id, v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
           v.plateProvince, v.engineNo, v.chassisNo, v.mileage],
        );
      } else {
        await c.query(
          `insert into vehicles (tenant_id, contact_id, brand, model, year, color,
                                 plate_a, plate_b, plate_province, engine_no, chassis_no, mileage)
           values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id, v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
           v.plateProvince, v.engineNo, v.chassisNo, v.mileage],
        );
      }
    }

    return id!;
  });
}

/**
 * ลบผู้ติดต่อได้เฉพาะที่ยังไม่มีเอกสารอ้างถึง
 *
 * ถ้ามีเอกสารแล้วห้ามลบ เพราะเสียประวัติซื้อขายและลูกหนี้ค้างชำระไปด้วย
 * (ตัวคอลัมน์ตั้งเป็น ON DELETE SET NULL ลบไปเอกสารก็ไม่พังแต่ตามรอยกลับไม่ได้อีก)
 */
export async function deleteContact(id: string): Promise<{ ok: boolean; reason?: string }> {
  return mutate('customer', async (c) => {
    const { rows } = await c.query(
      `select count(*)::int as c from documents where party_id = $1`, [id],
    );
    if (rows[0].c > 0) {
      return {
        ok: false,
        reason: `ลบไม่ได้เพราะมีเอกสารอ้างถึงอยู่ ${rows[0].c} ฉบับ — ` +
                'ประวัติซื้อขายและยอดค้างชำระจะหายไปด้วย',
      };
    }
    await c.query(`delete from contacts where id = $1`, [id]);
    return { ok: true };
  });
}
