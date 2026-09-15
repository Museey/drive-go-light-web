import type { ClientBase } from 'pg';
import type { Vehicle } from './contacts';

/**
 * ซิงก์รถของผู้ติดต่อตามที่ส่งมาจากฟอร์ม — แยกจาก contacts.ts เพื่อให้ทดสอบกับฐานข้อมูลได้ตรง ๆ
 * (contacts.ts ผูกกับ mutate ฝั่งเซิร์ฟเวอร์ ชุดทดสอบนำเข้าไม่ได้)
 *
 * **ผู้ขายไม่แตะตารางรถเลย** — ฟอร์มผู้ขายไม่มีส่วนรถ (ผู้ใช้กำหนด) จึงส่งรายการว่างมาเสมอ
 * ถ้าซิงก์ตามปกติ ผู้ขายที่เคยมีรถ (เช่นเคยบันทึกเป็นลูกค้า) กดบันทึกแล้วรถถูกลบเงียบ ๆ
 */
export async function syncVehiclesWith(
  c: ClientBase, contactId: string, kind: 'customer' | 'vendor', vehicles: Vehicle[],
): Promise<void> {
  if (kind === 'vendor') return;

  /* รถที่ถูกเอาออกจากฟอร์ม ให้ลบ — ยกเว้นคันที่มีเอกสารอ้างถึง
     เอกสารเก็บ snapshot รถไว้ในตัวเองแล้ว การลบทะเบียนจึงไม่ทำให้เอกสารเก่าเสียหาย */
  const keep = vehicles.map((v) => v.id).filter(Boolean) as string[];
  await c.query(
    `delete from vehicles
     where contact_id = $1
       and ($2::uuid[] is null or not (id = any($2)))
       and not exists (select 1 from documents d where d.vehicle_id = vehicles.id)`,
    [contactId, keep.length ? keep : null],
  );

  for (const v of vehicles) {
    if (v.id) {
      await c.query(
        `update vehicles set brand=$2, model=$3, year=$4, color=$5, plate_a=$6, plate_b=$7,
                plate_province=$8, engine_no=$9, chassis_no=$10, mileage=$11, other=$12
         where id=$1`,
        [v.id, v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
         v.plateProvince, v.engineNo, v.chassisNo, v.mileage, v.other ?? ''],
      );
    } else {
      await c.query(
        `insert into vehicles (tenant_id, contact_id, brand, model, year, color,
                               plate_a, plate_b, plate_province, engine_no, chassis_no, mileage, other)
         values (current_tenant_id(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [contactId, v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
         v.plateProvince, v.engineNo, v.chassisNo, v.mileage, v.other ?? ''],
      );
    }
  }
}
