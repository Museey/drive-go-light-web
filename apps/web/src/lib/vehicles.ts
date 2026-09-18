import type pg from 'pg';

/**
 * ค้นด้วยทะเบียนรถ และประวัติของรถแต่ละคัน (ผู้ใช้กำหนด 19 ก.ย. 2569)
 *
 * หน้าเคาน์เตอร์จำ "4 ตัวท้าย" เป็นหลัก — ลูกค้าขับเข้ามา ช่างอยากเห็นว่าคันนี้เคยทำอะไรไปบ้าง
 * ไม่ใช่รายชื่อลูกค้า ไฟล์นี้ไม่มี `server-only` ชุดทดสอบจึงเรียกได้ตรง ๆ โดยส่ง client เข้ามา
 */

type Client = pg.PoolClient | pg.Client;

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * เอกสารของรถคันหนึ่ง — ผูกได้สองทาง
 *
 * 1. `vehicle_id` — ใบที่ออกในเว็บ
 * 2. ทะเบียนที่พิมพ์อยู่บนใบ — ใบที่นำเข้ามาจากรุ่น 6.4 ไม่มี vehicle_id เลยสักใบ
 *    ถ้าดูแค่ทางแรก อู่ที่ย้ายข้อมูลมาจะเห็นประวัติรถว่างทั้งหมด
 *
 * เทียบทะเบียนแบบตัดช่องว่างทิ้ง — บนเอกสารเก็บเป็น "กข 5466" ส่วนทะเบียนรถแยกสองช่อง
 */
const DOC_OF_VEHICLE = `
  (d.vehicle_id = v.id
   or (d.vehicle_id is null
       and v.plate_a || v.plate_b <> ''
       and replace(d.vehicle_plate, ' ', '') = v.plate_a || v.plate_b))`;

/** เอกสารที่นับเป็นงานของรถ — ใบเสนอราคายังไม่ใช่งานที่ทำจริง แต่ยังอยากเห็นในประวัติ */
const DOC_KINDS = `d.kind in ('QT','IV','IVT','RC')`;

export interface VehicleHit {
  id: string;
  /** "กข 5466" */
  plate: string;
  plateProvince: string;
  brand: string;
  model: string;
  color: string;
  ownerId: string;
  ownerName: string;
  /** จำนวนเอกสารของรถคันนี้ (ไม่นับใบเสนอราคาและใบที่ยกเลิก) */
  docCount: number;
  outstanding: number;
  lastServiceOn: string | null;
}

const HIT_SELECT = `
  select v.id, trim(concat_ws(' ', nullif(v.plate_a,''), nullif(v.plate_b,''))) as plate,
         v.plate_province, v.brand, v.model, v.color, v.last_service_on::text as last_service_on,
         k.id as owner_id,
         trim(coalesce(nullif(k.org_name,''),
              concat_ws(' ', nullif(k.prefix,''), nullif(k.first_name,''), nullif(k.last_name,'')))) as owner_name,
         (select count(*) from documents d
           where ${DOC_OF_VEHICLE} and ${DOC_KINDS} and d.kind <> 'QT'
             and d.status <> 'void' and d.purged_at is null)::int as doc_count,
         (select coalesce(sum(d.payable - coalesce(
                    (select sum(p.amount) from payments p where p.doc_id = d.id), 0)), 0)
            from documents d
           where ${DOC_OF_VEHICLE} and d.kind in ('IV','IVT','RC')
             and d.status = 'issued' and d.purged_at is null)::float8 as outstanding
    from vehicles v
    join contacts k on k.id = v.contact_id`;

/** รถที่ทะเบียนตรงกับคำค้น — 4 ตัวท้ายเป็นท่าที่ใช้บ่อยที่สุด */
export async function searchVehiclesWith(c: Client, q: string, limit = 8): Promise<VehicleHit[]> {
  const term = (q ?? '').trim();
  if (!term) return [];

  const { rows } = await c.query(
    `${HIT_SELECT}
      where v.plate_b ilike $1 or v.plate_a ilike $1
      order by v.plate_b, v.plate_a
      limit $2`,
    [`%${term}%`, limit],
  );
  return rows.map(toHit);
}

function toHit(r: any): VehicleHit {
  return {
    id: r.id,
    plate: r.plate ?? '',
    plateProvince: r.plate_province ?? '',
    brand: r.brand ?? '',
    model: r.model ?? '',
    color: r.color ?? '',
    ownerId: r.owner_id,
    ownerName: r.owner_name || 'ไม่ระบุชื่อ',
    docCount: r.doc_count ?? 0,
    outstanding: round2(n(r.outstanding)),
    lastServiceOn: r.last_service_on ?? null,
  };
}

export interface VehicleDoc {
  id: string;
  kind: string;
  docNo: string;
  docDate: string;
  grandTotal: number;
  payable: number;
  paid: number;
  outstanding: number;
  status: string;
}

export interface VehicleHistory {
  vehicle: VehicleHit;
  docs: VehicleDoc[];
}

/** ประวัติของรถคันหนึ่ง — เอกสารทุกใบของคันนั้น ใบที่บันทึกล่าสุดอยู่บนสุด */
export async function vehicleHistoryWith(c: Client, vehicleId: string): Promise<VehicleHistory | null> {
  const hit = await c.query(`${HIT_SELECT} where v.id = $1`, [vehicleId]);
  if (!hit.rows[0]) return null;

  const { rows } = await c.query(
    `select d.id, d.kind::text as kind, d.doc_no, d.doc_date::text as doc_date,
            d.grand_total, d.payable, d.status::text as status,
            coalesce((select sum(p.amount) from payments p where p.doc_id = d.id), 0) as paid
       from documents d, vehicles v
      where v.id = $1 and ${DOC_OF_VEHICLE} and ${DOC_KINDS} and d.purged_at is null
      order by d.created_at desc, d.doc_date desc, d.doc_no desc`,
    [vehicleId],
  );

  return {
    vehicle: toHit(hit.rows[0]),
    docs: rows.map((r) => {
      const payable = round2(n(r.payable));
      const paid = round2(n(r.paid));
      return {
        id: r.id,
        kind: r.kind,
        docNo: r.doc_no,
        docDate: r.doc_date,
        grandTotal: round2(n(r.grand_total)),
        payable,
        paid,
        /* ใบที่ยกเลิกแล้วไม่ใช่หนี้ ต่อให้ยังมียอดค้างบนใบ */
        outstanding: r.status === 'issued' ? round2(payable - paid) : 0,
        status: r.status,
      };
    }),
  };
}
