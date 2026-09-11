import { baht, monthLabel } from '@/lib/format';

/* ชื่อเดือนย่อ — ชื่อเต็มยาวเกินกว่าจะวางใต้แท่งหกแท่งในการ์ดเดียว (ตามรุ่น 6.4) */
const TH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/**
 * แท่งยอดขายย้อนหลังหกเดือน
 *
 * เป็น SVG ไม่ใช่ div ซ้อนกัน เพราะการ์ดนี้ต้องพิมพ์ลงกระดาษได้ด้วย —
 * ความสูงที่คิดจาก % ของกล่องแม่หายไปตอนพิมพ์ ส่วน SVG ได้สัดส่วนเดิมเสมอ
 *
 * แท่งของเดือนปัจจุบันเข้มกว่าเพื่อนตามรุ่น 6.4 เพราะมันยังไม่จบเดือน
 * เอาไปเทียบกับเดือนที่จบแล้วตรง ๆ ไม่ได้
 */
export function SalesBars({ months }: { months: { key: string; amount: number }[] }) {
  if (months.length === 0) return null;

  const max = Math.max(1, ...months.map((m) => m.amount));
  const W = 240;
  const H = 64;
  const gap = 6;
  const bw = (W - gap * (months.length - 1)) / months.length;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="label" style={{ marginBottom: 6 }}>ยอดขาย 6 เดือนล่าสุด</div>
      {/* ความสูงคุมด้วย CSS ไม่ใช่แอตทริบิวต์ — `height="auto"` ไม่ใช่ค่าที่ SVG รับได้
          เบราว์เซอร์ฟ้องแล้วไม่วาดตามสัดส่วนที่ตั้งไว้ */}
      <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ width: '100%', height: 'auto' }}
           role="img" aria-label="ยอดขายหกเดือนล่าสุด">
        {months.map((m, i) => {
          const h = Math.max(2, (m.amount / max) * H);
          const last = i === months.length - 1;
          return (
            <g key={m.key}>
              <title>{`${monthLabel(m.key)} — ${baht(m.amount)} บาท`}</title>
              <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} rx="2"
                    fill={last ? 'var(--brand)' : 'var(--line-2, #C9D6CC)'} />
              <text x={i * (bw + gap) + bw / 2} y={H + 12}
                    textAnchor="middle" fontSize="9" fill="var(--ink-3)">
                {TH_ABBR[Number(m.key.slice(5, 7)) - 1]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** แถวสั้น ๆ ชื่อซ้าย ยอดขวา — ใช้กับห้าอันดับลูกหนี้และเจ้าหนี้ */
export function OwingList({ rows, empty }: {
  rows: { partyId: string | null; name: string; count: number; amount: number }[];
  empty: string;
}) {
  if (rows.length === 0) return <div className="subtle" style={{ marginTop: 8 }}>{empty}</div>;

  return (
    <div style={{ marginTop: 8 }}>
      {rows.map((r) => (
        <div key={r.partyId ?? r.name} className="row">
          <span className="wrap">
            {r.name}
            <span className="subtle" style={{ fontSize: 11.5 }}> · {r.count} ใบ</span>
          </span>
          <b>{baht(r.amount)}</b>
        </div>
      ))}
    </div>
  );
}
