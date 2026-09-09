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

  const { rows } = await c.query(
    `select distinct on (x.parent_doc_id, side)
            x.parent_doc_id as parent, x.id, x.doc_no,
            case when x.kind = 'RC' then 'receipt' else 'invoice' end as side
       from documents x
      where x.parent_doc_id = any($1::uuid[])
        and x.status <> 'void'
        and x.kind in ('IV','IVT','RC')
      order by x.parent_doc_id, side, x.doc_date, x.doc_no`,
    [quoteIds],
  );

  for (const r of rows) {
    const slot = out.get(r.parent);
    if (!slot) continue;
    if (r.side === 'receipt') slot.receipt = { id: r.id, docNo: r.doc_no };
    else slot.invoice = { id: r.id, docNo: r.doc_no };
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
