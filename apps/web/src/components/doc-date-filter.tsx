import Link from 'next/link';

/**
 * ตัวกรองตามวันที่ของหน้ารายการเอกสาร
 *
 * ยกมาจาก docFilterBar() ของรุ่น 3.6 — ปุ่มลัดที่ใช้บ่อย บวกช่องกรอกช่วงเอง
 * ต่างจากของเดิมตรงที่ของเดิมติ๊กเลือกได้หลายเดือนพร้อมกันในปีเดียว (เช่น ม.ค. + มี.ค.)
 * ตรงนี้เลือกได้ทีละเดือน ถ้าต้องการหลายเดือนที่ไม่ติดกันให้กรอกช่วงเอง
 * หรือกรองทีละเดือนแล้วพิมพ์แยกใบ ซึ่งเป็นวิธีที่ใช้กันจริงตอนยื่นภาษี
 */

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** วันแรกและวันสุดท้ายของเดือน */
export function monthRange(year: number, month1: number): { from: string; to: string } {
  return {
    from: `${year}-${pad(month1)}-01`,
    to: `${year}-${pad(month1)}-${pad(new Date(year, month1, 0).getDate())}`,
  };
}

export function DocDateFilter({
  base, from, to, keep = {},
}: {
  base: string;
  from?: string;
  to?: string;
  /** ค่าอื่นในแถบที่อยากให้ติดไปด้วยตอนกดปุ่มลัด เช่น ชนิดเอกสารหรือคำค้น */
  keep?: Record<string, string>;
}) {
  const now = new Date();
  const y = now.getFullYear();
  const thisMonth = monthRange(y, now.getMonth() + 1);
  const lastM = new Date(y, now.getMonth() - 1, 1);
  const lastMonth = monthRange(lastM.getFullYear(), lastM.getMonth() + 1);
  const todayIso = iso(now);

  const presets = [
    { label: 'ทั้งหมด', from: '', to: '' },
    { label: 'วันนี้', from: todayIso, to: todayIso },
    { label: 'เดือนนี้', ...thisMonth },
    { label: 'เดือนที่แล้ว', ...lastMonth },
    { label: 'ปีนี้', from: `${y}-01-01`, to: `${y}-12-31` },
  ];

  const on = (p: { from: string; to: string }) =>
    (from ?? '') === p.from && (to ?? '') === p.to;

  /* ปีที่ให้เลือก — ย้อนหลังห้าปีพอสำหรับอายุความทางภาษี */
  const years = Array.from({ length: 6 }, (_, i) => y - i);

  return (
    <div className="toolbar" style={{ borderTop: '1px solid var(--line)' }}>
      <span className="subtle">ช่วงวันที่</span>

      {presets.map((p) => (
        <Link key={p.label} className="chip"
              href={{ pathname: base, query: { ...keep, ...(p.from ? { from: p.from, to: p.to } : {}) } }}
              style={on(p) ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
          {p.label}
        </Link>
      ))}

      <div className="spacer" />

      {/* เลือกเดือน — ส่งเป็น from/to ให้ฝั่งเซิร์ฟเวอร์ จะได้มีทางเดียวที่กรองวันที่ */}
      <form action={base} method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <select className="in" name="month" defaultValue="" aria-label="เดือน">
          <option value="">เลือกเดือน</option>
          {TH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="in mono" name="year" defaultValue={y} aria-label="ปี">
          {years.map((yy) => <option key={yy} value={yy}>{yy + 543}</option>)}
        </select>
        <button className="btn" type="submit">ดู</button>
      </form>

      <form action={base} method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <span className="subtle">ตั้งแต่</span>
        <input className="in mono" type="date" name="from" defaultValue={from ?? ''} />
        <span className="subtle">ถึง</span>
        <input className="in mono" type="date" name="to" defaultValue={to ?? ''} />
        <button className="btn" type="submit">ดู</button>
      </form>
    </div>
  );
}

/**
 * แปลง ?month=&year= ที่ปุ่มเลือกเดือนส่งมา ให้เป็นช่วงวันที่
 * ทำที่เดียวเพื่อให้ทุกหน้าตีความเหมือนกัน
 */
export function rangeFromParams(sp: {
  from?: string; to?: string; month?: string; year?: string;
}): { from?: string; to?: string } {
  const month = Number(sp.month ?? '');
  if (month >= 1 && month <= 12) {
    const year = Number(sp.year ?? '') || new Date().getFullYear();
    return monthRange(year, month);
  }
  return { from: sp.from || undefined, to: sp.to || undefined };
}
