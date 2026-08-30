import Link from 'next/link';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { listCategories, listProducts } from '@/lib/products';
import { baht, thDate } from '@/lib/format';
import { CategoryManager } from './category-manager';

export const dynamic = 'force-dynamic';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; reorder?: string; all?: string; page?: string }>;
}) {
  await requirePerm('stock');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;

  const [cats, { rows, total }] = await Promise.all([
    listCategories(),
    listProducts({
      search: sp.q,
      categoryId: sp.cat,
      onlyReorder: sp.reorder === '1',
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
  };

  return (
    <Shell
      current="/stock"
      title="ทะเบียนสินค้า"
      sub={`${total.toLocaleString('en-US')} รายการ`}
      actions={
        <div className="tag-row">
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
