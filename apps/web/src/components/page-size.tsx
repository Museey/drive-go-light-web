import Link from 'next/link';

/**
 * เลือกจำนวนแถวต่อหน้า — ยกชุดตัวเลือกมาจากรุ่น 3.6 (5 / 20 / 50)
 * ห้าแถวมีไว้สำหรับแท็บเล็ตหน้าเคาน์เตอร์ที่จอเตี้ย ไม่ใช่ตัวเลขที่ตั้งมั่ว
 */

export const PAGE_SIZES = [5, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;

/** อ่านค่าจาก query string — ค่านอกรายการถูกปัดกลับเป็นค่าตั้งต้น กัน ?size=100000 */
export function pageSizeOf(v: string | undefined): number {
  const n = Number(v ?? '');
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

export function PageSize({
  base, size, keep = {},
}: {
  base: string;
  size: number;
  keep?: Record<string, string>;
}) {
  return (
    <div className="tag-row">
      <span className="subtle">แสดงต่อหน้า</span>
      {PAGE_SIZES.map((n) => (
        <Link key={n} className="chip"
              href={{ pathname: base, query: { ...keep, ...(n === DEFAULT_PAGE_SIZE ? {} : { size: n }) } }}
              style={n === size
                ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                : undefined}>
          {n}
        </Link>
      ))}
    </div>
  );
}
