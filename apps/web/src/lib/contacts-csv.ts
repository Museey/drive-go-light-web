import type pg from 'pg';
import {
  BOM, csvField, CUST_CSV_HEADERS, CUST_FIELDS, VEND_CSV_HEADERS, VEND_FIELDS,
} from './csv';
import {
  contactPatch, headersOf, IMPORT_LIMIT, parseContactCsv, planContactImport,
  sameVehicle, vehiclePatch, type ContactKind, type ExistingContact, type ImportPlan,
} from './contacts-csv-core';

export { IMPORT_LIMIT, parseContactCsv } from './contacts-csv-core';
export type { ContactKind, ImportPlan } from './contacts-csv-core';

/** ใช้ได้ทั้ง Client และ PoolClient — เทสต์ต่อตรง ส่วนแอปใช้ตัวที่มาจาก pool */
type Client = Pick<pg.PoolClient, 'query'>;

/**
 * นำเข้า–ส่งออกทะเบียนลูกค้าและผู้ขายเป็น CSV (07.3)
 *
 * อู่ที่กำลังจะเปิดใช้มีทะเบียนลูกค้าอยู่ใน Excel อยู่แล้ว ถ้าไม่มีทางนี้
 * ก็ต้องพิมพ์เข้าไปทีละราย ซึ่งไม่มีใครทำ
 *
 * ทุกฟังก์ชันรับ client เข้ามา ไม่ผูกกับ session — การตรวจสิทธิ์และการเปิดทรานแซกชัน
 * อยู่ที่ฝั่ง action แบบเดียวกับ claims.ts และ stock-counts.ts
 * ทำให้ทดสอบกับฐานข้อมูลจริงได้โดยไม่ต้องปลอม session
 *
 * การตัดสินใจว่า "แถวนี้คือใคร" อยู่ที่ contacts-csv-core.ts ซึ่งไม่แตะฐานข้อมูลเลย
 */

/* ---------- ส่งออก ---------- */

export async function exportContactsCsv(c: Client, kind: ContactKind): Promise<string> {
  {
    const { rows } = await c.query(
      `select k.code, k.type, k.prefix, k.first_name, k.last_name, k.org_name,
              k.tax_id, k.tel, k.tel2, k.email, k.addr, k.credit_days, k.note,
              v.brand, v.model, v.year, v.color, v.plate_a, v.plate_b, v.plate_province,
              v.engine_no, v.chassis_no, v.mileage
         from contacts k
         left join vehicles v on v.contact_id = k.id and $2
        where k.kind = $1
        order by k.code, v.plate_b`,
      [kind, kind === 'customer'],
    );

    const headers = headersOf(kind);
    const lines = [headers.join(',')];

    for (const r of rows) {
      const a = (r.addr ?? {}) as Record<string, string>;
      const base = [
        r.code, r.type === 'company' ? 'นิติบุคคล' : 'บุคคล',
      ];
      const common = [
        r.tax_id ?? '', r.tel, r.tel2, r.email ?? '',
        a.no ?? '', a.village ?? '', a.moo ?? '', a.soi ?? '', a.road ?? '',
        a.subdistrict ?? '', a.district ?? '', a.province ?? '', a.zip ?? '',
        r.credit_days, r.note,
      ];
      const cells = kind === 'vendor'
        ? [...base, r.org_name, ...common]
        : [
          ...base, r.prefix, r.first_name, r.last_name, r.org_name, ...common,
          r.brand ?? '', r.model ?? '', r.year ?? '', r.color ?? '',
          r.plate_a ?? '', r.plate_b ?? '', r.plate_province ?? '',
          r.engine_no ?? '', r.chassis_no ?? '', r.mileage ?? '',
        ];
      lines.push(cells.map(csvField).join(','));
    }

    /* BOM ให้ Excel บนวินโดวส์เปิดแล้วภาษาไทยไม่เพี้ยน */
    return BOM + lines.join('\r\n');
  }
}

/** แบบฟอร์มเปล่าพร้อมตัวอย่างสองแถว — ยกจากรุ่น 6.4 */
export function contactsCsvTemplate(kind: ContactKind): string {
  const rows = kind === 'vendor'
    ? [[
      '', 'นิติบุคคล', 'บริษัท อะไหล่ตัวอย่าง จำกัด', '0105551234567', '02-111-2222', '',
      'parts@example.com', '12/3', '', '', '', 'บางนา-ตราด', 'บางนา', 'บางนา',
      'กรุงเทพมหานคร', '10260', '30', 'ส่งของทุกวันอังคาร',
    ]]
    : [[
      '', 'บุคคล', 'นาย', 'สมชาย', 'ใจดี', '', '1100400123456', '081-234-5678', '',
      'somchai@example.com', '88/12', 'หมู่บ้านสุขใจ', '4', 'ร่มเย็น 3', 'พระราม 2',
      'บางมด', 'จอมทอง', 'กรุงเทพมหานคร', '10150', '0', 'ลูกค้าประจำ',
      'Toyota', 'Hilux Revo', '2562', 'ขาว', 'กข', '1234', 'กรุงเทพมหานคร',
      '2KD-1234567', 'MR0FR22G8L1234567', '45000',
    ], [
      '', 'นิติบุคคล', '', '', '', 'บริษัท ตัวอย่าง จำกัด', '0105551234567', '02-000-0000', '',
      'office@example.com', '99', '', '', '', 'สุขุมวิท', 'คลองเตย', 'คลองเตย',
      'กรุงเทพมหานคร', '10110', '30', 'ลูกค้าเครดิต 30 วัน',
      'Isuzu', 'D-Max', '2563', 'เทา', '1ขค', '567', 'กรุงเทพมหานคร', '', '', '12000',
    ]];

  return BOM + [headersOf(kind).join(','), ...rows.map((r) => r.map(csvField).join(','))]
    .join('\r\n');
}

/* ---------- นำเข้า ---------- */

export interface ContactImportResult {
  created: number;
  updated: number;
  vehicles: number;
  skipped: number;
  errors: string[];
}

/** อ่านผู้ติดต่อทั้งหมดเท่าที่การจับคู่ต้องรู้ */
async function poolOf(c: Client, kind: ContactKind): Promise<ExistingContact[]> {
  const { rows } = await c.query(
    `select id, code, coalesce(tax_id, '') as tax_id,
            case when type = 'company' then org_name
                 else trim(first_name || ' ' || last_name) end as name
       from contacts where kind = $1`,
    [kind],
  );
  return rows.map((r: any) => ({
    id: r.id, code: r.code, taxId: r.tax_id, name: r.name,
  }));
}

/** ออกรหัสถัดไปหลายตัวรวดเดียว — เรียกทีละตัวในลูปจะได้รหัสซ้ำเพราะยังไม่ commit */
async function codeMaker(c: Client, kind: ContactKind): Promise<() => string> {
  const prefix = kind === 'vendor' ? 'VEN-' : 'CUS-';
  const { rows } = await c.query(
    `select coalesce(max(substring(code from '[0-9]+$')::int), 0) as last
       from contacts where kind = $1 and code ~ ('^' || $2 || '[0-9]+$')`,
    [kind, prefix],
  );
  let n = Number(rows[0].last);
  return () => prefix + String(++n).padStart(4, '0');
}

/**
 * ตรวจไฟล์แล้วบอกว่าจะเกิดอะไร โดยไม่เขียนอะไรเลย
 * ผู้ใช้ต้องเห็นก่อนกดยืนยัน — เหมือนหน้ากู้คืนข้อมูลที่แยกสองขั้นไว้แล้ว
 */
export async function planContactsCsv(
  c: Client, kind: ContactKind, text: string,
): Promise<ImportPlan> {
  return planContactImport(kind, parseContactCsv(text, kind), await poolOf(c, kind));
}

/**
 * นำเข้าจริง — ทั้งไฟล์อยู่ในทรานแซกชันเดียว
 *
 * **เพิ่มและปรับปรุงเท่านั้น ไม่ลบอะไรเลย** จงใจไม่ใช้ saveContact() ที่มีอยู่
 * เพราะตัวนั้นลบรถทุกคันที่ไม่ได้อยู่ในฟอร์ม ซึ่งถูกสำหรับหน้าแก้ไข
 * แต่ผิดสำหรับ CSV ที่ส่งรถมาทีละคัน — ลูกค้าที่มีสามคันจะเหลือคันเดียว
 */
export async function importContactsWith(
  c: Client, kind: ContactKind, text: string,
): Promise<ContactImportResult> {
  const recs = parseContactCsv(text, kind);

  const plan = planContactImport(kind, recs, await poolOf(c, kind));
  const total = plan.add.length + plan.update.length;

  if (total > IMPORT_LIMIT) {
    throw new Error(
      `ไฟล์มี ${total.toLocaleString()} ราย เกินครั้งละ ${IMPORT_LIMIT.toLocaleString()} ราย — ` +
      'แบ่งไฟล์แล้วนำเข้าทีละส่วน',
    );
  }

  const nextCode = await codeMaker(c, kind);
  const result: ContactImportResult = {
    created: 0, updated: 0, vehicles: 0,
    skipped: plan.skip.length,
    errors: plan.skip.map((s) => `บรรทัดที่ ${s.row}: ${s.why}`),
  };

  for (const entry of [...plan.add, ...plan.update]) {
    let id = entry.existing?.id ?? null;

    if (!id) {
      /**
       * ผู้ติดต่อใหม่เขียนชื่อครบตั้งแต่แรก ไม่ใส่ชื่อชั่วคราวไว้ก่อน
       *
       * กติกา "ช่องว่างไม่ทับของเดิม" ใช้กับการปรับปรุงของเดิมเท่านั้น
       * รายใหม่ไม่มีของเดิมให้รักษา และถ้าใส่ชื่อชั่วคราวไว้แล้วแถวถัดไป
       * ไม่ได้เขียนทับ (เช่นไฟล์ผู้ขายที่ไม่มีช่องชื่อบุคคล) ชื่อชั่วคราวจะค้าง
       */
      const p0 = contactPatch(entry.recs[0]!, kind);
      const code = entry.recs[0]!.code || nextCode();
      const { rows } = await c.query(
        `insert into contacts (tenant_id, code, kind, type,
                               prefix, first_name, last_name, org_name)
         values (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
         returning id`,
        [code, kind, p0.type, p0.prefix ?? '', p0.firstName ?? '', p0.lastName ?? '',
         p0.orgName ?? ''],
      );
      id = rows[0].id as string;
      result.created++;
    } else {
      result.updated++;
    }

    /* แถวหลัง ๆ ของคนเดียวกันเขียนทับแถวก่อนหน้า ตรงกับต้นฉบับ */
    for (const rec of entry.recs) {
      const p = contactPatch(rec, kind);
      const sets: string[] = ['type = $2'];
      const params: unknown[] = [id, p.type];
      const put = (col: string, v: unknown) => {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      if (p.prefix !== undefined) put('prefix', p.prefix);
      if (p.firstName !== undefined) put('first_name', p.firstName);
      if (p.lastName !== undefined) put('last_name', p.lastName);
      if (p.orgName !== undefined) put('org_name', p.orgName);
      if (p.taxId !== undefined) put('tax_id', p.taxId);
      if (p.tel !== undefined) put('tel', p.tel);
      if (p.tel2 !== undefined) put('tel2', p.tel2);
      if (p.email !== undefined) put('email', p.email);
      if (p.note !== undefined) put('note', p.note);
      if (p.creditDays !== undefined) put('credit_days', p.creditDays);
      /* รวมที่อยู่เข้ากับของเดิมด้วย || ช่องที่ไฟล์ไม่ได้กรอกจึงไม่หายไป */
      if (Object.keys(p.addr).length) {
        params.push(JSON.stringify(p.addr));
        sets.push(`addr = addr || $${params.length}::jsonb`);
      }

      await c.query(`update contacts set ${sets.join(', ')} where id = $1`, params);

      if (kind === 'customer') {
        const v = vehiclePatch(rec);
        if (v.plateB || v.brand || v.chassisNo) {
          const { rows: have } = await c.query(
            `select id, plate_a, plate_b, chassis_no from vehicles where contact_id = $1`,
            [id],
          );
          const match = have.find((x: any) => sameVehicle(
            { plateA: x.plate_a, plateB: x.plate_b, chassisNo: x.chassis_no }, v,
          ));

          if (match) {
            await c.query(
              `update vehicles set
                 brand = coalesce(nullif($2,''), brand), model = coalesce(nullif($3,''), model),
                 year = coalesce(nullif($4,''), year), color = coalesce(nullif($5,''), color),
                 plate_a = coalesce(nullif($6,''), plate_a),
                 plate_b = coalesce(nullif($7,''), plate_b),
                 plate_province = coalesce(nullif($8,''), plate_province),
                 engine_no = coalesce(nullif($9,''), engine_no),
                 chassis_no = coalesce(nullif($10,''), chassis_no),
                 mileage = coalesce(nullif($11,''), mileage)
               where id = $1`,
              [match.id, v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
               v.plateProvince, v.engineNo, v.chassisNo, v.mileage],
            );
          } else {
            /* แถวรถเปล่าที่ระบบใส่ให้ตอนสร้างผู้ติดต่อ ให้ใช้แถวนั้นแทนการเพิ่มใหม่
               ตรงกับ blank ใน applyVehicle() ของต้นฉบับ */
            const blank = have.find((x: any) => !x.plate_b && !x.chassis_no);
            if (blank) {
              await c.query(
                `update vehicles set brand=$2, model=$3, year=$4, color=$5, plate_a=$6,
                        plate_b=$7, plate_province=$8, engine_no=$9, chassis_no=$10, mileage=$11
                 where id=$1`,
                [blank.id, v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
                 v.plateProvince, v.engineNo, v.chassisNo, v.mileage],
              );
            } else {
              await c.query(
                `insert into vehicles (tenant_id, contact_id, brand, model, year, color,
                                       plate_a, plate_b, plate_province, engine_no,
                                       chassis_no, mileage)
                 values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [id, v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
                 v.plateProvince, v.engineNo, v.chassisNo, v.mileage],
              );
            }
            result.vehicles++;
          }
        }
      }
    }
  }

  return result;
}
