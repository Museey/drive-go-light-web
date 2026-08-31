import Link from 'next/link';
import { STOCK_FLAG_LABEL, type StockFlag } from '@drivegolight/core';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { listCategories, listProducts } from '@/lib/products';
import { baht, thDate } from '@/lib/format';
import { CategoryManager } from './category-manager';

export const dynamic = 'force-dynamic';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; cat?: string; reorder?: string; all?: string; page?: string; flag?: string;
  }>;
}) {
  await requirePerm('stock');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const flag = (['min', 'max', 'dead'] as const).find((f) => f === sp.flag);

  const [cats, { rows, total, stockValue }] = await Promise.all([
    listCategories(),
    listProducts({
      search: sp.q,
      categoryId: sp.cat,
      onlyReorder: sp.reorder === '1',
      flag,
      includeInactive: sp.all === '1',
      page,
    }),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / 40));
  const keep = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.cat ? { cat: sp.cat } : {}),
    ...(sp.reorder === '1' ? { reorder: '1' } : {}),
    ...(sp.all === '1' ? { all: '1' } : {}),
    ...(flag ? { flag } : {}),
  };
  const printQuery = new URLSearchParams(keep as Record<string, string>).toString();

  return (
    <Shell
      current="/stock"
      title="ทะเบียนสินค้า"
      sub={`${total.toLocaleString('en-US')} รายการ · มูลค่าสต๊อกตามต้นทุน ${baht(stockValue)} บาท`}
      actions={
        <div className="tag-row">
          <Link className="btn" href={`/stock/print${printQuery ? `?${printQuery}` : ''}`}>พิมพ์รายการ</Link>
          <Link className="btn" href="/settings/backup">นำเข้า / ส่งออก CSV</Link>
          <Link className="btn" href="/stock/pending">รายการค้างทำ</Link>
          <Link className="btn primary" href="/stock/new">+ เพิ่มสินค้า</Link>
        </div>
      }
    >
      <div className="card">
        <div className="toolbar">
          <form action="/stock" method="get" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="รหัส ชื่อ หรือรหัส OEM" style={{ width: 240 }} />
            <select className="in" name="cat" defaultValue={sp.cat ?? ''}>
              <option value="">ทุกหมวดหมู่</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.productCount})</option>
              ))}
            </select>
            <label className="tag-row" style={{ fontSize: 13 }}>
              <input type="checkbox" name="reorder" value="1" defaultChecked={sp.reorder === '1'} />
              เฉพาะที่ต้องสั่งซื้อ
            </label>
            <label className="tag-row" style={{ fontSize: 13 }}>
              <input type="checkbox" name="all" value="1" defaultChecked={sp.all === '1'} />
              รวมที่ปิดใช้งาน
            </label>
            <button className="btn" type="submit">ค้นหา</button>
          </form>

          <div className="spacer" />

          <div className="tag-row">
            {(['min', 'max', 'dead'] as StockFlag[]).map((f) => (
              <Link key={f} className={`chip flag-${f}`}
                    href={{ pathname: '/stock', query: flag === f ? {} : { flag: f } }}
                    style={flag === f ? { outline: '2px solid var(--ink-3)' } : undefined}>
                {STOCK_FLAG_LABEL[f]}
              </Link>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty">ไม่พบสินค้าที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>OEM</th>
                  <th>ชื่อสินค้า</th>
                  <th>หมวดหมู่</th>
                  <th className="num">คงเหลือ</th>
                  <th className="num">จุดสั่ง</th>
                  <th className="num">สูงสุด</th>
                  <th className="num">ทุน</th>
                  <th className="num">ราคา A</th>
                  <th className="num">ราคา B</th>
                  <th className="num">ราคา C</th>
                  <th>เคลื่อนไหวล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">
                      <Link href={`/stock/${p.id}`} style={{ textDecoration: 'underline' }}>{p.code}</Link>
                      {!p.active ? <span className="chip" style={{ marginLeft: 6 }}>ปิดใช้งาน</span> : null}
                      {p.flags.map((f) => (
                        <span key={f} className={`chip flag-${f}`} title={STOCK_FLAG_LABEL[f]}
                              style={{ marginLeft: 6 }}>
                          {f === 'min' ? 'Min' : f === 'max' ? 'Max' : 'ค้าง'}
                        </span>
                      ))}
                    </td>
                    <td className="mono" style={{ color: 'var(--ink-3)' }}>{p.oem || '-'}</td>
                    <td className="wrap">{p.name}</td>
                    <td>{p.categoryName ?? <span style={{ color: 'var(--ink-3)' }}>ไม่ระบุ</span>}</td>
                    <td className="num">
                      {p.needReorder
                        ? <span className="chip due">{p.qtyOnHand.toLocaleString('en-US')}</span>
                        : p.qtyOnHand.toLocaleString('en-US')}
                    </td>
                    <td className="num" style={{ color: 'var(--ink-3)' }}>{p.qtyMin.toLocaleString('en-US')}</td>
                    <td className="num" style={{ color: 'var(--ink-3)' }}>
                      {p.qtyMax > 0 ? p.qtyMax.toLocaleString('en-US') : '-'}
                    </td>
                    <td className="num">{baht(p.lastCost)}</td>
                    <td className="num">{baht(p.priceA)}</td>
                    <td className="num">{baht(p.priceB)}</td>
                    <td className="num">{baht(p.priceC)}</td>
                    <td>{thDate(p.lastMoveOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={{ pathname: '/stock', query: { ...keep, page: page - 1 } }}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={{ pathname: '/stock', query: { ...keep, page: page + 1 } }}>ถัดไป</Link> : null}
        </div>
      </div>

      <div className="card">
        <header>
          <h2>หมวดหมู่สินค้า</h2>
          <div className="spacer" />
          <span className="subtle">{cats.length} หมวด</span>
        </header>
        <CategoryManager categories={cats} />
      </div>
    </Shell>
  );
}
