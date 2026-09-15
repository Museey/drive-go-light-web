import Link from 'next/link';
import { ThaiDateInput } from './thai-date-input';

/** ตัวเลือกช่วงเวลา — ปุ่มลัดที่ใช้บ่อยกับช่องกรอกเองสำหรับช่วงอื่น */
export function DateRange({
  base, from, to,
}: {
  base: string;
  from?: string;
  to?: string;
}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() - 1, 1);

  const today = `${y}-${m}-${String(now.getDate()).padStart(2, '0')}`;
  const presets = [
    { label: 'ทั้งหมด', from: '', to: '' },
    { label: 'วันนี้', from: today, to: today },
    {
      label: 'เดือนนี้',
      from: `${y}-${m}-01`,
      to: `${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`,
    },
    {
      label: 'เดือนที่แล้ว',
      from: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-01`,
      to: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate()).padStart(2, '0')}`,
    },
    { label: 'ปีนี้', from: `${y}-01-01`, to: `${y}-12-31` },
    { label: 'ปีที่แล้ว', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];

  const on = (p: { from: string; to: string }) => (from ?? '') === p.from && (to ?? '') === p.to;

  return (
    <div className="toolbar">
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
  );
}
