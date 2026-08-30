import type { Vehicle } from './contacts';

/**
 * อ่านรถทุกคันออกจากฟอร์ม — ฝั่งหน้าเว็บส่งมาเป็น veh[i][field]
 *
 * แถวที่ว่างทั้งแถวถือว่าผู้ใช้กด "เพิ่มรถ" แล้วไม่ได้กรอก จึงข้ามไป
 * แต่ต้องระวังไม่ข้ามแถวที่กรอกแค่บางช่อง เช่น รู้แต่ทะเบียนยังไม่รู้ยี่ห้อ
 */
export function readVehicles(fd: FormData): Vehicle[] {
  const out: Vehicle[] = [];
  const indexes = new Set<string>();

  for (const key of fd.keys()) {
    const m = key.match(/^veh\[(\d+)\]/);
    if (m) indexes.add(m[1]!);
  }

  for (const i of [...indexes].sort((a, b) => Number(a) - Number(b))) {
    const g = (f: string) => String(fd.get(`veh[${i}][${f}]`) ?? '').trim();
    const v: Vehicle = {
      id: g('id') || undefined,
      brand: g('brand'), model: g('model'), year: g('year'), color: g('color'),
      plateA: g('plateA'), plateB: g('plateB'), plateProvince: g('plateProvince'),
      engineNo: g('engineNo'), chassisNo: g('chassisNo'), mileage: g('mileage'),
    };

    /* คันที่บันทึกไว้แล้วเก็บเสมอ ถึงจะลบข้อมูลออกหมดก็ตาม — ผู้ใช้ต้องกด "เอาออก" เพื่อลบ
       ไม่งั้นล้างช่องแล้วรถหายไปเงียบ ๆ โดยไม่ได้ตั้งใจ */
    if (v.id) { out.push(v); continue; }

    const hasAny = [v.brand, v.model, v.year, v.color, v.plateA, v.plateB,
                    v.plateProvince, v.engineNo, v.chassisNo, v.mileage].some(Boolean);
    if (hasAny) out.push(v);
  }
  return out;
}
