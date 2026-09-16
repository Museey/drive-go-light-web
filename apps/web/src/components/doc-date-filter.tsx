import Link from 'next/link';
import { DateRangeSelect } from './date-range-select';
import { datePresets, monthRange } from '@/lib/date-presets';
import { ThaiDateInput } from './thai-date-input';

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

export { monthRange };

export function DocDateFilter({
  base, from, to, keep = {}, monthPicker = true,
}: {
  base: string;
  from?: string;
  to?: string;
  /** ค่าอื่นในแถบที่อยากให้ติดไปด้วยตอนกดปุ่มลัด เช่น ชนิดเอกสารหรือคำค้น */
  keep?: Record<string, string>;
  /**
   * dropdown เดือน/ปี — หน้ารายการเอกสารเมนู 03 ปิด (ผู้ใช้กำหนด: ค้นแบบกำหนดเองเลือกจากปฏิทินพอ ไม่ซ้ำซ้อน)
   * เมนูอื่นคงไว้ · ฝั่งเซิร์ฟเวอร์ยังอ่าน ?month=&year= ได้ ลิงก์เก่าไม่พัง
   */
  monthPicker?: boolean;
}) {
  const now = new Date();
  const y = now.getFullYear();
  const presets = datePresets(now);

  const on = (p: { from: string; to: string }) =>
    (from ?? '') === p.from && (to ?? '') === p.to;

  /* ปีที่ให้เลือก — ย้อนหลังห้าปีพอสำหรับอายุความทางภาษี */
  const years = Array.from({ length: 6 }, (_, i) => y - i);

  return (
    <>
    {/* จอต่ำกว่า 1280 เหลือ dropdown เดียวตามต้นแบบ — เรนเดอร์ทั้งสองแบบแล้วซ่อนด้วย CSS
        ไม่วัดความกว้างจอใน JS (สเปก §2) ไม่งั้นตัวกรองกระพริบตอนโหลดทุกครั้ง */}
    <DateRangeSelect base={base} from={from} to={to} keep={keep} />

    <div className="toolbar dfilter" style={{ borderTop: '1px solid var(--line)' }}>
      {/* .tag-row — ลูกตรงของ .toolbar บนมือถือยืดเต็มจอ ชิปเรียงลงทีละปุ่ม */}
      <div className="tag-row">
        <span className="subtle">ช่วงวันที่</span>
        {presets.map((p) => (
          <Link key={p.label} className="chip"
                href={{ pathname: base, query: { ...keep, ...(p.from ? { from: p.from, to: p.to } : {}) } }}
                style={on(p) ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
            {p.label}
          </Link>
        ))}
      </div>

      <div className="spacer" />

      {/* เลือกเดือน — ส่งเป็น from/to ให้ฝั่งเซิร์ฟเวอร์ จะได้มีทางเดียวที่กรองวันที่ */}
      {monthPicker ? (
        <form autoComplete="off" action={base} method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <select className="in" name="month" defaultValue="" aria-label="เดือน">
            <option value="">เดือน</option>
            {TH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="in mono" name="year" defaultValue={y} aria-label="ปี">
            {years.map((yy) => <option key={yy} value={yy}>{yy + 543}</option>)}
          </select>
          <button className="btn" type="submit">ดู</button>
        </form>
      ) : null}

      <form autoComplete="off" action={base} method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <span className="subtle">ตั้งแต่</span>
        <ThaiDateInput name="from" defaultIso={from} ariaLabel="ตั้งแต่" />
        <span className="subtle">ถึง</span>
        <ThaiDateInput name="to" defaultIso={to} ariaLabel="ถึง" />
        <button className="btn" type="submit">ดู</button>
      </form>
    </div>
    </>
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
