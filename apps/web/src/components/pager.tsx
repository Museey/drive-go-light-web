import Link from 'next/link';

/**
 * ตัวเลื่อนหน้าแบบตัวเลข  ‹ 1 2 [3] 4 5 … 12 ›  (ผู้ใช้ขอ "< 2,3,4 > ให้เลือกเลื่อน")
 * แสดงหน้าแรก หน้าสุดท้าย และหน้ารอบ ๆ หน้าปัจจุบัน ±2 · หน้าเดียวไม่แสดง
 */
export function Pager({ base, query, page, lastPage }: {
  base: string;
  query: Record<string, string | number | undefined>;
  page: number;
  lastPage: number;
}) {
  if (lastPage <= 1) return null;
  const href = (p: number) => ({ pathname: base, query: { ...query, ...(p === 1 ? { page: undefined } : { page: p }) } });
  const pages: (number | '…')[] = [];
  for (let p = 1; p <= lastPage; p++) {
    if (p === 1 || p === lastPage || Math.abs(p - page) <= 2) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  return (
    <nav className="pagenav" aria-label="เลื่อนหน้า">
      {page > 1 ? <Link className="pg" href={href(page - 1)} aria-label="หน้าก่อน">‹</Link> : <span className="pg off">‹</span>}
      {pages.map((p, i) => p === '…'
        ? <span key={`e${i}`} className="pg gap">…</span>
        : <Link key={p} className={`pg${p === page ? ' on' : ''}`} href={href(p)} aria-current={p === page ? 'page' : undefined}>{p}</Link>)}
      {page < lastPage ? <Link className="pg" href={href(page + 1)} aria-label="หน้าถัดไป">›</Link> : <span className="pg off">›</span>}
    </nav>
  );
}
