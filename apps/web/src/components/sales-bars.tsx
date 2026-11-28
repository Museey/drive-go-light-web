import { baht, monthLabel } from '@/lib/format';

/* ชื่อเดือนย่อ — ชื่อเต็มยาวเกินกว่าจะวางใต้แท่งหกแท่งในการ์ดเดียว (ตามรุ่น 6.4) */
const TH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/**
 * เฉดเขียวจากอ่อนไปเข้ม — แต่ละเดือนสีต่างกัน (ผู้ใช้กำหนด) เดือนปัจจุบันเข้มสุดเหมือนเดิม
 * เป็นค่าสีตรง ไม่ใช่ color-mix/opacity เพื่อให้พิมพ์ลงกระดาษได้สีเดียวกับบนจอ
 */
export const BAR_SHADES = ['#CFE8DB', '#A8D5BD', '#7DBE9C', '#4FA37B', '#237F59', '#0F5C3E'];

/** สีของแท่งที่ i จาก n แท่ง — แท่งแรกอ่อนสุด แท่งสุดท้าย (เดือนปัจจุบัน) เข้มสุดเสมอ */
export function barShade(i: number, n: number): string {
  if (n <= 1) return BAR_SHADES[BAR_SHADES.length - 1]!;
  const at = Math.round((i / (n - 1)) * (BAR_SHADES.length - 1));
  return BAR_SHADES[Math.min(BAR_SHADES.length - 1, Math.max(0, at))]!;
}

/** สีของกราฟเทียบปี — สีสดสองสีที่แยกกันชัดทั้งบนจอและบนกระดาษ (ผู้ใช้ขอ "สีชัดไม่หมอง" 26 พ.ย. 2569) */
export const BAR_NOW = '#2563EB';
export const BAR_PREV = '#F59E0B';

/** ย่อยอดเงินสำหรับป้ายบนแกน — 1,250,000 → 1.3M · 45,200 → 45K */
export function shortBaht(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

/**
 * แท่งยอดขายรายเดือนย้อนหลัง เทียบกับเดือนเดียวกันของปีก่อน
 *
 * แต่ละเดือนมีสองแท่งชิดกัน: ปีก่อน (ส้ม) ซ้าย ปีนี้ (น้ำเงิน) ขวา — ตาอ่านซ้ายไปขวาตามเวลา
 * เดิมเป็นแท่งเดียวหกเดือนไล่เฉดเขียวอ่อนไปเข้ม เดือนเก่าสีจางจนอ่านยาก
 *
 * เป็น SVG ไม่ใช่ div ซ้อนกัน เพราะการ์ดนี้ต้องพิมพ์ลงกระดาษได้ด้วย —
 * ความสูงที่คิดจาก % ของกล่องแม่หายไปตอนพิมพ์ ส่วน SVG ได้สัดส่วนเดิมเสมอ
 */
export function SalesBars({ months }: { months: { key: string; amount: number; prev?: number }[] }) {
  if (months.length === 0) return null;

  const max = Math.max(1, ...months.map((m) => Math.max(m.amount, m.prev ?? 0)));
  const W = 480;
  const H = 96;
  const TOP = 12;
  const gap = 8;
  const slot = (W - gap * (months.length - 1)) / months.length;
  const bw = (slot - 2) / 2;
  const sumNow = months.reduce((s, m) => s + m.amount, 0);
  const sumPrev = months.reduce((s, m) => s + (m.prev ?? 0), 0);
  const change = sumPrev > 0 ? Math.round(((sumNow - sumPrev) / sumPrev) * 100) : null;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="salesbars-head">
        <span className="label">ยอดขาย {months.length} เดือนล่าสุด เทียบปีก่อน</span>
        <span className="salesbars-legend">
          <i style={{ background: BAR_NOW }} />ปีนี้ {baht(sumNow)}
          <i style={{ background: BAR_PREV }} />ปีก่อน {baht(sumPrev)}
          {change === null ? null : (
            <b style={{ color: change >= 0 ? 'var(--ok)' : 'var(--due)' }}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change)}%
            </b>
          )}
        </span>
      </div>
      {/* กว้างสุด 44rem — ยืดเต็มการ์ดบนจอกว้างแล้วชื่อเดือนใหญ่กว่าตัวเลขยอดขายของการ์ดเอง */}
      {/* ความสูงคุมด้วย CSS ไม่ใช่แอตทริบิวต์ — `height="auto"` ไม่ใช่ค่าที่ SVG รับได้
          เบราว์เซอร์ฟ้องแล้วไม่วาดตามสัดส่วนที่ตั้งไว้ */}
      <svg viewBox={`0 0 ${W} ${TOP + H + 18}`} style={{ width: '100%', maxWidth: '44rem', height: 'auto', display: 'block' }}
           role="img" aria-label={`ยอดขาย ${months.length} เดือนล่าสุดเทียบกับปีก่อน`}>
        {/* เส้นบอกระดับยอดสูงสุดและครึ่งหนึ่ง — ให้กะขนาดแท่งได้โดยไม่ต้องชี้ทีละแท่ง */}
        {[1, 0.5].map((f) => (
          <g key={f}>
            <line x1="0" x2={W} y1={TOP + H - H * f} y2={TOP + H - H * f} stroke="var(--line-2)" strokeWidth="1" />
            <text x={W} y={TOP + H - H * f - 2} textAnchor="end" fontSize="8" fill="var(--ink-3)">{shortBaht(max * f)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = i * (slot + gap);
          const prev = m.prev ?? 0;
          const hNow = m.amount > 0 ? Math.max(2, (m.amount / max) * H) : 0;
          const hPrev = prev > 0 ? Math.max(2, (prev / max) * H) : 0;
          const mm = Number(m.key.slice(5, 7));
          return (
            <g key={m.key}>
              <title>{`${monthLabel(m.key)} — ปีนี้ ${baht(m.amount)} บาท · ปีก่อน ${baht(prev)} บาท`}</title>
              <rect x={x} y={TOP + H - hPrev} width={bw} height={hPrev} rx="1.5" fill={BAR_PREV} />
              <rect x={x + bw + 2} y={TOP + H - hNow} width={bw} height={hNow} rx="1.5" fill={BAR_NOW} />
              <text x={x + slot / 2} y={TOP + H + 12} textAnchor="middle" fontSize="9" fill="var(--ink-2)">
                {TH_ABBR[mm - 1]}
              </text>
            </g>
          );
        })}
        <line x1="0" x2={W} y1={TOP + H} y2={TOP + H} stroke="var(--line)" strokeWidth="1" />
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
          {/* ห้ามใช้คลาส wrap ที่นี่ — เป็นคลาสกรอบหน้า (padding 22px 24px 48px) แถวจึงเคยสูงเกือบ 90px
              และยอดเงินลอยอยู่เหนือชื่อ (ผู้ใช้ส่งภาพ 24 พ.ย. 2569) */}
          <span className="nm">
            {r.name}
            <span className="subtle" style={{ fontSize: '0.875rem' }}> · {r.count} ใบ</span>
          </span>
          <b>{baht(r.amount)}</b>
        </div>
      ))}
    </div>
  );
}
