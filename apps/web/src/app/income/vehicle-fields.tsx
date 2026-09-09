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

const FIELDS: { key: string; label: string; wide?: boolean; mono?: boolean; hint?: string }[] = [
  { key: 'brand', label: 'ยี่ห้อรถ' },
  { key: 'model', label: 'รุ่นรถ' },
  { key: 'year', label: 'ปีที่จดทะเบียน', mono: true },
  { key: 'color', label: 'สีรถ' },
  { key: 'plateA', label: 'ทะเบียน — หมวดอักษร', mono: true, hint: 'เช่น 1กก' },
  { key: 'plateB', label: 'ทะเบียน — หมวดตัวเลข', mono: true, hint: 'เช่น 1234' },
  { key: 'plateProv', label: 'จังหวัดที่จดทะเบียน' },
  { key: 'mileage', label: 'เลขไมล์ (กม.)', mono: true, hint: 'ของการเข้าซ่อมครั้งนี้' },
  { key: 'engineNo', label: 'หมายเลขเครื่องยนต์', mono: true, wide: true },
  { key: 'chassisNo', label: 'หมายเลขตัวถัง', mono: true, wide: true },
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
      <div className="row-fields f4">
        {FIELDS.filter((f) => !f.wide).map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`veh-${f.key}`}>{f.label}</label>
            <input id={`veh-${f.key}`} className={f.mono ? 'in mono' : 'in'}
                   value={veh[f.key] ?? ''} placeholder={f.hint}
                   onChange={(e) => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="row-fields f2" style={{ marginTop: 12 }}>
        {FIELDS.filter((f) => f.wide).map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`veh-${f.key}`}>{f.label}</label>
            <input id={`veh-${f.key}`} className="in mono"
                   value={veh[f.key] ?? ''}
                   onChange={(e) => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>
    </>
  );
}
