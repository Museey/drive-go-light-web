import type pg from 'pg';

/**
 * ออกเอกสารให้ลูกค้าที่ยังไม่มีในทะเบียน แล้วบันทึกลูกค้ารายนั้นลงทะเบียนไปพร้อมกัน (26 พ.ย. 2569 — ผู้ใช้ขอ)
 *
 * ลูกค้าเดินเข้ามาซื้อหน้าร้าน พนักงานกรอกชื่อ เบอร์ ที่อยู่ ทะเบียนรถ บนใบได้เลย
 * เดิมข้อมูลนั้นอยู่แค่บนใบ ครั้งหน้าลูกค้ากลับมาต้องกรอกใหม่ทั้งหมด หรือต้องออกจากหน้าออกเอกสาร
 * ไปเพิ่มลูกค้าที่เมนู 02 ก่อน แล้วกลับมาเริ่มใบใหม่
 *
 * อยู่ในทรานแซกชันเดียวกับการบันทึกเอกสาร — เอกสารบันทึกไม่ผ่าน ลูกค้าก็ไม่ถูกสร้างค้างไว้
 *
 * **ไม่สร้างซ้ำ** ถ้าทะเบียนมีลูกค้ารายนี้อยู่แล้ว ผูกใบเข้ากับรายเดิมแทน:
 *   1. เลขประจำตัวผู้เสียภาษี 13 หลักตรงกัน
 *   2. ชื่อตรงกัน และเบอร์โทรตรงกัน (เทียบเฉพาะตัวเลข)
 * ชื่อตรงกันอย่างเดียวไม่นับ — "สมชาย" สองคนเป็นคนละคนได้ การผูกผิดคนทำให้ยอดค้างไปโผล่ผิดราย
 *
 * ไม่มี server-only — รับ client ที่ตั้ง tenant แล้ว ชุดทดสอบเรียกได้ตรง ๆ
 */

type Client = pg.PoolClient | pg.Client;

export interface NewCustomerInput {
  partyType: 'person' | 'company';
  partyName: string;
  partyTaxId: string;
  partyTel: string;
  partyEmail: string;
  partyAddr: Record<string, string>;
  partyAddrText: string;
  creditDays: number;
  vehicle: Record<string, string> | null;
}

export interface NewCustomerResult {
  contactId: string;
  vehicleId: string | null;
  /** true = สร้างรายใหม่ · false = เจอรายเดิมในทะเบียนแล้วผูกเข้า */
  created: boolean;
  code: string;
}

const digits = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
const text = (v: unknown): string => String(v ?? '').trim();

/** ชื่อที่แสดงของผู้ติดต่อ — สูตรเดียวกับที่ทะเบียนใช้ ไว้เทียบกับชื่อที่พิมพ์บนใบ */
const NAME_SQL = `
  case when k.type = 'company' then k.org_name
       else btrim(k.prefix || k.first_name || ' ' || k.last_name) end`;

export async function ensureCustomerForDocWith(c: Client, input: NewCustomerInput): Promise<NewCustomerResult> {
  const name = text(input.partyName);
  if (!name) throw new Error('ต้องระบุชื่อลูกค้าก่อนบันทึกลงทะเบียน');
  const taxId = digits(input.partyTaxId);
  const tel = digits(input.partyTel);

  /* รหัสลูกค้าออกจากเลขล่าสุด + 1 — ล็อกก่อนอ่าน ไม่งั้นสองเครื่องบันทึกพร้อมกันได้เลขเดียวกัน
     แล้วเครื่องหนึ่งล้มด้วย unique (tenant_id, code) ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
     ล็อกหลุดเองเมื่อจบทรานแซกชัน และแยกต่ออู่ */
  await c.query(`select pg_advisory_xact_lock(hashtext('dgl-contact-code:' || current_tenant_id()::text))`);

  /* ---------- มีอยู่แล้วหรือยัง ---------- */
  let found: { id: string; code: string } | undefined;
  if (taxId.length === 13) {
    found = (await c.query(
      `select id, code from contacts k where k.kind = 'customer' and k.tax_id = $1 order by k.created_at limit 1`,
      [taxId])).rows[0];
  }
  if (!found && tel.length >= 9) {
    found = (await c.query(
      `select id, code from contacts k
        where k.kind = 'customer' and lower(${NAME_SQL}) = lower($1)
          and regexp_replace(k.tel, '\\D', '', 'g') = $2
        order by k.created_at limit 1`, [name, tel])).rows[0];
  }

  let contactId: string;
  let code: string;
  let created = false;

  if (found) {
    contactId = found.id;
    code = found.code;
  } else {
    /* เลขท้าย 1–9 หลักเท่านั้น — เหตุผลเดียวกับ nextContactCode() ใน contacts.ts */
    const last = await c.query(
      `select coalesce(max(substring(code from '[0-9]+$')::int), 0) as last
         from contacts where kind = 'customer' and code ~ '^CUS-[0-9]{1,9}$'`);
    code = 'CUS-' + String(Number(last.rows[0].last) + 1).padStart(4, '0');

    const company = input.partyType === 'company';
    const { rows } = await c.query(
      `insert into contacts (tenant_id, code, kind, type, first_name, org_name, tax_id, addr, addr_text,
                             tel, email, note, credit_days)
       values (current_tenant_id(), $1, 'customer', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id`,
      [code, company ? 'company' : 'person', company ? '' : name, company ? name : '',
       taxId.length === 13 ? taxId : null, JSON.stringify(input.partyAddr ?? {}), text(input.partyAddrText),
       text(input.partyTel), text(input.partyEmail) || null,
       'เพิ่มจากหน้าออกเอกสาร', Math.max(0, Math.round(Number(input.creditDays) || 0))]);
    contactId = rows[0].id as string;
    created = true;
  }

  /* ---------- รถ: มีทะเบียนบนใบจึงลงทะเบียนรถ · คันเดิมของลูกค้ารายนี้ไม่สร้างซ้ำ ---------- */
  const v = input.vehicle ?? {};
  const plateA = text(v.plateA);
  const plateB = text(v.plateB);
  let vehicleId: string | null = null;
  if (plateA || plateB) {
    const same = await c.query(
      `select id from vehicles
        where contact_id = $1
          and regexp_replace(lower(plate_a || plate_b), '[\\s\\-.]', '', 'g')
            = regexp_replace(lower($2), '[\\s\\-.]', '', 'g')
        limit 1`, [contactId, plateA + plateB]);
    if (same.rows[0]) {
      vehicleId = same.rows[0].id as string;
    } else {
      const ins = await c.query(
        `insert into vehicles (tenant_id, contact_id, brand, model, year, color,
                               plate_a, plate_b, plate_province, engine_no, chassis_no, mileage, other)
         values (current_tenant_id(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id`,
        [contactId, text(v.brand), text(v.model), text(v.year), text(v.color), plateA, plateB,
         text(v.plateProv ?? v.plateProvince), text(v.engineNo), text(v.chassisNo), text(v.mileage), text(v.other)]);
      vehicleId = ins.rows[0].id as string;
    }
  }

  return { contactId, vehicleId, created, code };
}

/**
 * ค่าตั้งต้นของช่องติ๊ก "บันทึกเป็นลูกค้าใหม่" บนหน้าออกเอกสาร
 *
 * ติ๊กให้เองเมื่อกรอก**อย่างน้อยหนึ่งอย่างนอกจากชื่อ** (เบอร์ เลขผู้เสียภาษี ที่อยู่ หรือทะเบียนรถ)
 * ชื่ออย่างเดียว เช่น "เงินสด" หรือ "ลูกค้าหน้าร้าน" ไม่ติ๊กให้ — ไม่งั้นทะเบียนจะเต็มไปด้วยรายที่ติดต่อกลับไม่ได้
 * ผู้ใช้ติ๊กหรือเอาออกเองได้เสมอ
 */
export function worthSavingCustomer(d: {
  partyName: string; partyTel: string; partyTaxId: string; partyAddrText: string;
  vehicle: Record<string, string> | null;
}): boolean {
  if (!text(d.partyName)) return false;
  return Boolean(
    digits(d.partyTel).length >= 9 || digits(d.partyTaxId).length === 13 || text(d.partyAddrText)
    || text(d.vehicle?.plateA) || text(d.vehicle?.plateB),
  );
}
