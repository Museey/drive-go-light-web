import Link from 'next/link';

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

  const presets = [
    { label: 'ทั้งหมด', from: '', to: '' },
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
  ];

  const on = (p: { from: string; to: string }) => (from ?? '') === p.from && (to ?? '') === p.to;

  return (
    <div className="toolbar">
      {presets.map((p) => (
        <Link key={p.label} className="chip"
              href={{ pathname: base, query: p.from ? { from: p.from, to: p.to } : {} }}
              style={on(p) ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
          {p.label}
        </Link>
      ))}

      <div className="spacer" />

      <form action={base} method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="subtle">ตั้งแต่</span>
        <input className="in mono" type="date" name="from" defaultValue={from ?? ''} />
        <span className="subtle">ถึง</span>
        <input className="in mono" type="date" name="to" defaultValue={to ?? ''} />
        <button className="btn" type="submit">ดู</button>
      </form>
    </div>
  );
}
