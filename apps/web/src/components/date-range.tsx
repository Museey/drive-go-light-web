import Link from 'next/link';
import { DateRangeSelect } from './date-range-select';
import { datePresets } from '@/lib/date-presets';
import { ThaiDateInput } from './thai-date-input';

/** ตัวเลือกช่วงเวลา — ปุ่มลัดที่ใช้บ่อยกับช่องกรอกเองสำหรับช่วงอื่น */
export function DateRange({
  base, from, to,
}: {
  base: string;
  from?: string;
  to?: string;
}) {
  /* พรีเซ็ตชุดเดียวกับ dropdown ของจอแคบ (lib/date-presets.ts) — ปุ่มกับ dropdown ต้องได้ช่วงเดียวกันเป๊ะ */
  const presets = datePresets(new Date());

  const on = (p: { from: string; to: string }) => (from ?? '') === p.from && (to ?? '') === p.to;

  return (
    <>
    {/* จอต่ำกว่า 1280 เหลือ dropdown เดียวแบบหน้ารายการเอกสาร (เฟส 2 · ต้นแบบ mDateSelect)
        เรนเดอร์ทั้งสองแบบเสมอ สลับด้วย CSS — `.dfilter` ซ่อนบนจอแคบ */}
    <DateRangeSelect base={base} from={from} to={to} />
    <div className="toolbar dfilter">
      {/* แถบปุ่มต่อกัน (ผู้ใช้เลือก) — เดิมเป็นชิปใหญ่ 52px ห่างกันห้าปุ่ม ดูไม่เป็นชุด
          มือถือ 3+3 ช่องเท่ากัน · แท็บเล็ตขึ้นไปแถวเดียว · อันที่เลือกพื้นเขียวเข้ม */}
      <nav className="seg" aria-label="ช่วงเวลา">
        {presets.map((p) => (
          <Link key={p.label} className="seg-btn" aria-current={on(p) ? 'true' : undefined}
                href={{ pathname: base, query: p.from ? { from: p.from, to: p.to } : {} }}>
            {p.label}
          </Link>
        ))}
      </nav>

      <div className="spacer" />

      {/* ป้ายกับช่องอยู่ด้วยกันเสมอ — จอแคบตัดแถวแล้ว "ถึง" ไม่หลุดไปท้ายบรรทัดห่างจากช่องของมัน */}
      <form autoComplete="off" action={base} method="get" className="range-form">
        <span className="range-f"><span className="subtle">ตั้งแต่</span><ThaiDateInput name="from" defaultIso={from} ariaLabel="ตั้งแต่" /></span>
        <span className="range-f"><span className="subtle">ถึง</span><ThaiDateInput name="to" defaultIso={to} ariaLabel="ถึง" /></span>
        <button className="btn" type="submit">ดู</button>
      </form>
    </div>
    </>
  );
}
