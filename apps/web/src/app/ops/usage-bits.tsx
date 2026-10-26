import { thDateTime, thDate } from '@/lib/format';
import { agoLabel, USAGE_COLOR, USAGE_LABEL, usageLevel } from '@/lib/usage';

/**
 * ชิ้นส่วนแสดงการใช้งานของอู่ในคอนโซล — วาดด้วย SVG ตรง ๆ ไม่เพิ่มไลบรารีกราฟ
 * ตัวเลขดิบมาจาก db/037_usage_activity.sql เกณฑ์สีมาจาก lib/usage.ts
 */

/** จุดสี + "3 ชม.ก่อน" — ชี้เมาส์เห็นวันเวลาเต็ม */
export function LastUsed({ at, now }: { at: string | null; now: Date }) {
  const lv = usageLevel(at, now);
  return (
    <span title={at ? thDateTime(at) : USAGE_LABEL.never}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{
        width: 8, height: 8, borderRadius: 4, flex: 'none',
        background: lv === 'never' ? 'transparent' : USAGE_COLOR[lv],
        border: `1.5px solid ${USAGE_COLOR[lv]}`,
      }} />
      <span style={{ color: lv === 'fresh' ? undefined : USAGE_COLOR[lv] }}>
        {at ? agoLabel(at, now) : USAGE_LABEL.never}
      </span>
    </span>
  );
}

/** แท่งเล็ก 30 วัน = จำนวนเอกสารที่สร้างต่อวัน · วันที่ไม่มีเลยเป็นขีดจาง ๆ */
export function DocSpark({ values }: { values: number[] }) {
  const W = 3, GAP = 1, H = 18;
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <svg width={values.length * (W + GAP)} height={H} role="img"
         aria-label={`เอกสาร 30 วัน ${total} ใบ`} style={{ display: 'block' }}>
      <title>{`เอกสารที่สร้างต่อวัน 30 วันล่าสุด — รวม ${total} ใบ`}</title>
      {values.map((v, i) => {
        const h = v ? Math.max(3, Math.round((v / max) * H)) : 1;
        return (
          <rect key={i} x={i * (W + GAP)} y={H - h} width={W} height={h} rx={0.5}
                fill={v ? 'var(--steel)' : 'var(--line)'} />
        );
      })}
    </svg>
  );
}

/**
 * ตารางสีแบบ 13 สัปดาห์ — แถวคือวันจันทร์–อาทิตย์ คอลัมน์คือสัปดาห์
 * ความเข้มตามจำนวนคนที่เข้าใช้ · วันที่ไม่มีคนเข้าแต่มีเอกสาร (ก่อนเริ่มเก็บบันทึก) นับเป็นหนึ่งคน
 */
export function ActivityGrid({ days }: { days: { day: string; users: number; docs: number }[] }) {
  if (!days.length) return null;
  const C = 11, G = 2;
  /* วันแรกของตารางต้องเป็นวันจันทร์ — ถอยช่องว่างตามวันในสัปดาห์ของวันแรก */
  const dow = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const pad = dow(days[0]!.day);
  const cells = [...Array(pad).fill(null), ...days] as (typeof days[number] | null)[];
  const weeks = Math.ceil(cells.length / 7);
  const level = (d: { users: number; docs: number }) => {
    const n = d.users || (d.docs ? 1 : 0);
    return n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3;
  };
  const FILL = ['var(--line-2)', '#BFE0CE', '#5DB98C', 'var(--steel-dk)'];
  const LABELS = ['จ', '', 'พ', '', 'ศ', '', 'อา'];

  return (
    <svg width={18 + weeks * (C + G)} height={7 * (C + G)} role="img"
         aria-label="วันที่เข้าใช้ 13 สัปดาห์ล่าสุด" style={{ display: 'block', maxWidth: '100%' }}>
      {LABELS.map((l, i) => (
        <text key={i} x={0} y={i * (C + G) + C - 2} fontSize={9} fill="var(--ink-3)">{l}</text>
      ))}
      {cells.map((d, i) => d && (
        <rect key={d.day} x={18 + Math.floor(i / 7) * (C + G)} y={(i % 7) * (C + G)}
              width={C} height={C} rx={2} fill={FILL[level(d)]}>
          <title>{`${thDate(d.day)} — เข้าใช้ ${d.users} คน · เอกสาร ${d.docs} ใบ`}</title>
        </rect>
      ))}
    </svg>
  );
}
