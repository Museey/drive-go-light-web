import type pg from 'pg';

/**
 * การต่อสายเอกสารขาย — ใบไหนออกต่อจากใบไหน
 *
 * แยกไว้ไฟล์นี้เพราะไม่มี `server-only` จึงเรียกจากชุดทดสอบได้ตรง ๆ
 * โดยส่ง client เข้ามาเอง เหมือน reports-pl.ts และ doc-edits.ts
 */

export interface DocRef {
  id: string;
  docNo: string;
}

export interface FollowUps {
  /** ใบส่งมอบ/ใบแจ้งหนี้ที่ออกจากใบเสนอราคาใบนี้ — null คือยังไม่ได้ออก */
  invoice: DocRef | null;
  receipt: DocRef | null;
}

type Client = pg.PoolClient | pg.Client;

/**
 * ใบที่ออกต่อจากใบเสนอราคาแต่ละใบ
 *
 * **ใบลูกที่ถูกยกเลิกไม่นับว่าออกแล้ว** — งานนั้นต้องกลับขึ้นกระดานให้ทำใหม่
 * ถ้านับ ใบเสนอราคาที่เคยออกใบส่งมอบแล้วยกเลิกไปจะดูเหมือนเสร็จแล้วตลอดกาล
 * แล้วไม่มีใครกลับไปออกใบใหม่ให้
 */
export async function quoteFollowUpsWith(
  c: Client,
  quoteIds: string[],
): Promise<Map<string, FollowUps>> {
  const out = new Map<string, FollowUps>();
  if (quoteIds.length === 0) return out;
  for (const id of quoteIds) out.set(id, { invoice: null, receipt: null });

  /*
   * ใบเสร็จหาได้สองทาง ตรงกับ rcOfQuote() ของรุ่น 6.4
   *
   *   r.quoteId === q.id  ||  (inv && r.invId === inv.id)
   *
   * เพราะ resolveSourceForNewWith() ต่อใบเสร็จเข้ากับ**ใบส่งมอบ**เมื่อมีใบส่งมอบแล้ว
   * ถ้าตรงนี้มองแค่ลูกตรง ๆ ของใบเสนอราคา ใบเสร็จที่ออกไปแล้วจะไม่ถูกเห็น
   * แล้วช่องนั้นขึ้นว่า "รอจัดทำ" ตลอดกาล ทั้งที่เก็บเงินไปเรียบร้อยแล้ว
   */
  const { rows } = await c.query(
    `with ids as (select unnest($1::uuid[]) as quote_id),
     inv as (
       select distinct on (x.parent_doc_id)
              x.parent_doc_id as quote_id, x.id, x.doc_no
         from documents x
        where x.parent_doc_id in (select quote_id from ids)
          and x.status <> 'void' and x.kind in ('IV','IVT')
        order by x.parent_doc_id, x.doc_date, x.doc_no
     ),
     rc as (
       select distinct on (i.quote_id) i.quote_id, r.id, r.doc_no
         from ids i
         left join inv on inv.quote_id = i.quote_id
         join documents r
           on r.status <> 'void' and r.kind = 'RC'
          and (r.parent_doc_id = i.quote_id or r.parent_doc_id = inv.id)
        order by i.quote_id, r.doc_date, r.doc_no
     )
     select i.quote_id,
            inv.id as inv_id, inv.doc_no as inv_no,
            rc.id  as rc_id,  rc.doc_no  as rc_no
       from ids i
       left join inv on inv.quote_id = i.quote_id
       left join rc  on rc.quote_id  = i.quote_id`,
    [quoteIds],
  );

  for (const r of rows) {
    const slot = out.get(r.quote_id);
    if (!slot) continue;
    if (r.inv_id) slot.invoice = { id: r.inv_id, docNo: r.inv_no };
    if (r.rc_id) slot.receipt = { id: r.rc_id, docNo: r.rc_no };
  }
  return out;
}

/**
 * ต้นทางที่ควรใช้จริงตอนออกใบถัดไป
 *
 * ยกกติกามาจาก `makeRcFromQuote` ของรุ่น 6.4 — ออกใบเสร็จจากใบเสนอราคาที่
 * **มีใบส่งมอบอยู่แล้ว** ต้องต่อสายจากใบส่งมอบ ไม่ใช่จากใบเสนอราคา
 *
 * ถ้าต่อจากใบเสนอราคาตรง ๆ จะได้ใบส่งมอบกับใบเสร็จเป็นพี่น้องกัน
 * ใบส่งมอบจึงไม่มีอะไรมาปิดยอด **ค้างเป็นลูกหนี้ตลอดไปทั้งที่เก็บเงินไปแล้ว**
 * ยอดขายรวมไม่ผิดเพราะคิวรีกันการนับซ้ำไว้แล้ว ที่ผิดคือยอดลูกหนี้คงค้าง
 *
 * คืน `movedTo` มาด้วยเพื่อให้หน้าจอบอกผู้ใช้ได้ว่าอ้างอิงใบไหน — เปลี่ยนต้นทาง
 * ให้เงียบ ๆ แล้วผู้ใช้เห็นเลขที่ไม่ตรงกับที่กดมาคือเรื่องที่อธิบายไม่ได้
 */
export async function resolveSourceForNewWith(
  c: Client,
  fromId: string,
  kind: string,
): Promise<{ sourceId: string; movedTo: DocRef | null }> {
  if (kind !== 'RC') return { sourceId: fromId, movedTo: null };

  const { rows } = await c.query(
    `select x.id, x.doc_no
       from documents d
       join documents x on x.parent_doc_id = d.id
      where d.id = $1 and d.kind = 'QT' and d.status <> 'void'
        and x.kind in ('IV','IVT') and x.status <> 'void'
      order by x.doc_date, x.doc_no
      limit 1`,
    [fromId],
  );
  const inv = rows[0];
  if (!inv) return { sourceId: fromId, movedTo: null };
  return { sourceId: inv.id, movedTo: { id: inv.id, docNo: inv.doc_no } };
}

/**
 * เขียนเลขไมล์จากเอกสารกลับเข้าทะเบียนรถ พร้อมวันที่บริการล่าสุด
 *
 * ทำตามรุ่น 6.4 (`v.mileage = curQuote.veh.mileage; v.lastService = curQuote.date`)
 *
 * **เขียนกลับแค่สองช่องนี้เท่านั้น** ยี่ห้อ รุ่น สี ทะเบียน ที่แก้บนเอกสารเป็น
 * ภาพนิ่งของใบนั้น ไม่ใช่การแก้ทะเบียนรถ — ใบเก่าต้องคงข้อความเดิมไว้เสมอ
 * ส่วนเลขไมล์ต่างออกไป เพราะทะเบียนรถต้องรู้ว่าล่าสุดรถวิ่งไปเท่าไหร่แล้ว
 *
 * วันที่บริการล่าสุด**ขยับไปข้างหน้าอย่างเดียว** — ออกใบย้อนหลังไม่ควรดึงค่าถอยกลับ
 * ไม่งั้นบันทึกใบเก่าที่ลืมออกทีหลัง จะทำให้ทะเบียนรถดูเหมือนไม่ได้เข้าศูนย์มานาน
 */
export async function syncVehicleFromDocWith(
  c: Client,
  opts: { vehicleId: string | null; mileage: string; docDate: string },
): Promise<void> {
  const mileage = String(opts.mileage ?? '').trim();
  if (!opts.vehicleId || !mileage) return;

  await c.query(
    `update vehicles
        set mileage = $2,
            last_service_on = greatest(coalesce(last_service_on, $3::date), $3::date),
            updated_at = now()
      where id = $1`,
    [opts.vehicleId, mileage, opts.docDate],
  );
}

/**
 * ใบเสร็จที่ออกต่อจากใบส่งมอบแต่ละใบ
 *
 * ใช้ตัดสินว่าจะโชว์ปุ่ม "ออกใบเสร็จ" ในแถวของหน้ารายการใบส่งมอบไหม
 * ตรงกับที่รุ่น 6.4 ทำใน renderInvoice — ปุ่มขึ้นเฉพาะใบที่ยังไม่มีใบเสร็จ
 *
 * ใบเสร็จที่ถูกยกเลิกไม่นับว่ามีแล้ว งานนั้นต้องกลับขึ้นมาให้ทำใหม่
 */
export async function receiptsOfWith(
  c: Client,
  invoiceIds: string[],
): Promise<Map<string, DocRef>> {
  const out = new Map<string, DocRef>();
  if (invoiceIds.length === 0) return out;

  const { rows } = await c.query(
    `select distinct on (x.parent_doc_id)
            x.parent_doc_id as parent, x.id, x.doc_no
       from documents x
      where x.parent_doc_id = any($1::uuid[])
        and x.status <> 'void' and x.kind = 'RC'
      order by x.parent_doc_id, x.doc_date, x.doc_no`,
    [invoiceIds],
  );
  for (const r of rows) out.set(r.parent, { id: r.id, docNo: r.doc_no });
  return out;
}

/** ใบที่ยังรอออกเอกสารต่อ — ใช้ในกล่องเลือกใบตอนออกเอกสารจากศูนย์ */
export interface OpenDoc {
  id: string;
  docNo: string;
  docDate: string;
  partyName: string;
  vehiclePlate: string;
  amount: number;
  /** 'QT' คือใบเสนอราคา · 'IV'/'IVT' คือใบส่งมอบ */
  kind: string;
}

/**
 * ใบที่ยังค้างอยู่ ให้เลือกตอนกดออกเอกสารใหม่โดยไม่ได้มาจากเอกสารต้นทาง
 *
 * ยกมาจาก `invNewModal` และ `rcNewModal` ของรุ่น 6.4 — กด "ออกใบส่งมอบ" แล้ว
 * รุ่นเดิมเสนอใบเสนอราคาที่ยังค้างให้เลือกก่อน ไม่ใช่โยนฟอร์มเปล่าให้
 * ซึ่งบังคับให้ผู้ใช้จำเลขที่ใบเองหรือย้อนไปหาในรายการอีกรอบ
 *
 *   ออกใบส่งมอบ → ใบเสนอราคาที่**ยังไม่มีทั้งใบส่งมอบและใบเสร็จ**
 *   ออกใบเสร็จ  → ใบส่งมอบที่ยังไม่มีใบเสร็จ **บวก** ใบเสนอราคาที่ยังค้าง
 *
 * เรียงใบใหม่ขึ้นก่อน เพราะงานที่เพิ่งรับเข้ามาคือสิ่งที่กำลังตามอยู่
 */
export async function openDocsForWith(
  c: Client,
  target: 'invoice' | 'receipt',
  opts: { search?: string; limit?: number } = {},
): Promise<OpenDoc[]> {
  const term = (opts.search ?? '').trim();
  const limit = Math.min(opts.limit ?? 20, 100);

  /* ใบส่งมอบที่ยังไม่มีใบเสร็จ — เฉพาะตอนออกใบเสร็จ */
  const invoicePart = target === 'receipt'
    ? `union all
       select d.id, d.doc_no, d.doc_date, d.party_name, d.vehicle_plate,
              d.payable as amount, d.kind::text as kind
         from documents d
        where d.kind in ('IV','IVT') and d.status <> 'void'
          and not exists (select 1 from documents r
                           where r.parent_doc_id = d.id and r.kind = 'RC'
                             and r.status <> 'void')`
    : '';

  const { rows } = await c.query(
    `select * from (
       select d.id, d.doc_no, d.doc_date, d.party_name, d.vehicle_plate,
              d.grand_total as amount, d.kind::text as kind
         from documents d
        where d.kind = 'QT' and d.status <> 'void'
          and not exists (select 1 from documents x
                           where x.parent_doc_id = d.id and x.status <> 'void'
                             and x.kind in ('IV','IVT','RC'))
       ${invoicePart}
     ) o
     where ($1 = '' or o.doc_no ilike $2 or o.party_name ilike $2
            or o.vehicle_plate ilike $2)
     order by o.doc_date desc, o.doc_no desc
     limit ${limit}`,
    [term, `%${term}%`],
  );

  return rows.map((r) => ({
    id: r.id,
    docNo: r.doc_no,
    docDate: r.doc_date,
    partyName: r.party_name ?? '',
    vehiclePlate: r.vehicle_plate ?? '',
    amount: Number(r.amount ?? 0),
    kind: r.kind,
  }));
}
