'use client';

/**
 * ช่องกรอกรายละเอียดรถบนเอกสาร
 *
 * รุ่น 6.4 พิมพ์ข้อมูลรถลงบนเอกสารได้ทุกช่อง เว็บรุ่นก่อนหน้านี้ให้เลือกได้อย่างเดียว
 * จากทะเบียนรถที่ลงไว้แล้ว ซึ่งทำให้เกิดปัญหาสองอย่าง
 *
 * 1. ลูกค้าขาจรต้องไปลงทะเบียนรถก่อนถึงจะออกใบเสนอราคาได้ ทั้งที่ช่องชื่อลูกค้า
 *    พิมพ์เองได้อยู่แล้ว — รถอย่างเดียวที่ล็อก
 * 2. บันทึกเลขไมล์ของการเข้าซ่อม**ครั้งนี้**ไม่ได้ ทั้งที่เลขไมล์เปลี่ยนทุกครั้ง
 *    ซึ่งเป็นเหตุผลทั้งหมดที่มันต้องอยู่บนเอกสาร ไม่ใช่อยู่แค่ในทะเบียนรถ
 *
 * ค่าที่กรอกที่นี่เป็น **ภาพนิ่งบนเอกสาร** (`documents.vehicle` เป็น jsonb)
 * แก้แล้วไม่ไปเปลี่ยนทะเบียนรถ ยกเว้นเลขไมล์กับวันที่บริการล่าสุด ซึ่งเขียนกลับ
 * ตอนบันทึกเหมือนที่ 6.4 ทำ (ดู saveSalesDoc)
 */
export type Vehicle = Record<string, string>;

/* บรรทัด 1: ยี่ห้อ รุ่น ปี สี · บรรทัด 2: หมวด เลขทะเบียน จังหวัด เลขไมล์ · บรรทัด 3: เลขเครื่องยนต์ เลขตัวถัง อื่นๆ (ผู้ใช้กำหนด) */
const ROWS: { key: string; label: string; mono?: boolean; hint?: string }[][] = [
  [{ key: 'brand', label: 'ยี่ห้อ' }, { key: 'model', label: 'รุ่น' }, { key: 'year', label: 'ปี', mono: true }, { key: 'color', label: 'สี' }],
  [{ key: 'plateA', label: 'ทะเบียน (หมวด)', mono: true, hint: 'เช่น 1กก' }, { key: 'plateB', label: 'ทะเบียน (เลข)', mono: true, hint: 'เช่น 1234' },
   { key: 'plateProv', label: 'จังหวัด' }, { key: 'mileage', label: 'เลขไมล์ (กม.)', mono: true, hint: 'ของครั้งนี้' }],
  [{ key: 'engineNo', label: 'เลขเครื่องยนต์', mono: true }, { key: 'chassisNo', label: 'เลขตัวถัง', mono: true }, { key: 'other', label: 'อื่นๆ (ชื่อผู้ขับ + เบอร์)' }],
];

export function VehicleFields({
  veh, onChange,
}: {
  veh: Vehicle;
  onChange: (next: Vehicle) => void;
}) {
  const set = (key: string, value: string) => onChange({ ...veh, [key]: value });

  return (
    <>
      {ROWS.map((row, r) => (
        <div key={r} className={row.length === 4 ? 'row-fields f4' : 'row-fields f3'} style={{ marginTop: r ? 8 : 0 }}>
          {row.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`veh-${f.key}`}>{f.label}</label>
              <input id={`veh-${f.key}`} className={f.mono ? 'in mono' : 'in'}
                     value={veh[f.key] ?? ''} placeholder={f.hint}
                     onChange={(e) => set(f.key, e.target.value)} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
