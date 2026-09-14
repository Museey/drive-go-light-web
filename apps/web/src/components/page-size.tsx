import Link from 'next/link';

/**
 * เลือกจำนวนแถวต่อหน้า — ยกชุดตัวเลือกมาจากรุ่น 3.6 (5 / 20 / 50)
 * ห้าแถวมีไว้สำหรับแท็บเล็ตหน้าเคาน์เตอร์ที่จอเตี้ย ไม่ใช่ตัวเลขที่ตั้งมั่ว
 */

export const PAGE_SIZES = [5, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;

/** ทะเบียนสินค้า: หน้าละ 10 เป็นค่าตั้งต้น เลือกได้ 10 / 20 (ผู้ใช้กำหนด) */
export const STOCK_PAGE_SIZES = [10, 20] as const;
export const STOCK_DEFAULT_PAGE_SIZE = 10;
/** ประวัติเอกสาร: 10 / 20 / 30 (ผู้ใช้กำหนด) */
export const HIST_PAGE_SIZES = [10, 20, 30] as const;
export const HIST_DEFAULT_PAGE_SIZE = 10;

/** อ่านค่าจาก query string — ค่านอกรายการถูกปัดกลับเป็นค่าตั้งต้น กัน ?size=100000 */
export function pageSizeOf(v: string | undefined, sizes: readonly number[] = PAGE_SIZES, fallback = DEFAULT_PAGE_SIZE): number {
  const n = Number(v ?? '');
  return sizes.includes(n) ? n : fallback;
}

export function PageSize({
  base, size, keep = {}, sizes = PAGE_SIZES, defaultSize = DEFAULT_PAGE_SIZE,
}: {
  base: string;
  size: number;
  keep?: Record<string, string>;
  sizes?: readonly number[];
  defaultSize?: number;
}) {
  return (
    <div className="tag-row">
      <span className="subtle">แสดงต่อหน้า</span>
      {sizes.map((n) => (
        <Link key={n} className="chip"
              href={{ pathname: base, query: { ...keep, ...(n === defaultSize ? {} : { size: n }) } }}
              style={n === size
                ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                : undefined}>
          {n}
        </Link>
      ))}
    </div>
  );
}
