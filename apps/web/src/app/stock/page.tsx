import Link from 'next/link';
import { STOCK_FLAG_LABEL, type StockFlag } from '@drivegolight/core';
import { query, requireTab } from '@/lib/auth';
import { PageSize, pageSizeOf } from '@/components/page-size';
import { getStockHiddenCols, STOCK_COLS } from '@/lib/ui-prefs';
import { picShaOf } from '@/lib/pics';
import { listPendingItems } from '@/lib/pending';
import { ColPicker } from './col-picker';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { listCategories, listProducts } from '@/lib/products';
import { canCost } from '@/lib/perms';
import { baht, thDate } from '@/lib/format';
import { CategoryManager } from './category-manager';

export const dynamic = 'force-dynamic';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; cat?: string; reorder?: string; all?: string; page?: string; flag?: string; size?: string;
  }>;
}) {
  const session = await requireTab('stock', 'list');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const flag = (['min', 'max', 'dead'] as const).find((f) => f === sp.flag);
  const pageSize = pageSizeOf(sp.size);

  const [cats, hidden, pending, { rows, total, stockValue }] = await Promise.all([
    listCategories(),
    getStockHiddenCols(),
    listPendingItems(),
    listProducts({
      search: sp.q,
      categoryId: sp.cat,
      onlyReorder: sp.reorder === '1',
      flag,
      includeInactive: sp.all === '1',
      page,
      pageSize,
    }),
  ]);

  /* รูปย่อของทั้งหน้ารวดเดียว ไม่ใช่ยิงทีละแถว — หน้าละ 50 แถวจะกิน connection หมด pool */
  const picSha = await query((c) => picShaOf(c, rows.map((p) => p.id)));

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  /* ต้นทุนถูกซ่อนได้สองทาง — ผู้ใช้เลือกซ่อนคอลัมน์เอง หรือไม่มีสิทธิ์เห็นต้นทุน
     ตรงกับ colOn() ของรุ่น 6.4 ที่รวมสองเงื่อนไขนี้ไว้ในที่เดียว */
  const seeCost = canCost(session);
  const show = (k: string) => (k === 'cost' && !seeCost ? false : !hidden.includes(k as never));
  const keep = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.cat ? { cat: sp.cat } : {}),
    ...(sp.reorder === '1' ? { reorder: '1' } : {}),
    ...(sp.all === '1' ? { all: '1' } : {}),
    ...(flag ? { flag } : {}),
  };
  const printQuery = new URLSearchParams(keep as Record<string, string>).toString();
  /* หน้าพิมพ์ไม่แบ่งหน้า จึงไม่ส่ง size ไปด้วย */
  const paged = { ...keep, ...(sp.size ? { size: sp.size } : {}) };

  return (
    <Shell
      current="/stock"
      title="ทะเบียนสินค้า"
      sub={
        `${total.toLocaleString('en-US')} รายการ` +
        (show('cost') ? ` · มูลค่าสต๊อกตามต้นทุน ${baht(stockValue)} บาท` : '')
      }
      actions={
        <div className="tag-row">
          <Link className="btn" href={`/stock/print${printQuery ? `?${printQuery}` : ''}`}>พิมพ์รายการ</Link>
          <Link className="btn" href={`/stock/barcodes${printQuery ? `?${printQuery}` : ''}`}>
            พิมพ์ฉลากบาร์โค้ด
          </Link>
          <ColPicker cols={STOCK_COLS} hidden={hidden} />
          <Link className="btn" href="/settings/import">นำเข้า / ส่งออก CSV</Link>
          <Link className="btn" href="/stock/pending">
            <span className="mono" style={{ opacity: 0.55, marginRight: 5 }}>05.2</span>รายการค้างทำ
          </Link>
          <Link className="btn primary" href="/stock/new">+ เพิ่มสินค้า</Link>
        </div>
      }
    >
      <SubNav menu="stock" current="list" badges={{ pending: pending.length }}>
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
                  <th style={{ width: 46 }} />
                  <th>รหัส</th>
                  <th>OEM</th>
                  <th>ชื่อสินค้า</th>
                  <th>หมวดหมู่</th>
                  {show('qty') ? <th className="num">คงเหลือ</th> : null}
                  {show('min') ? <th className="num">จุดสั่ง</th> : null}
                  {show('max') ? <th className="num">สูงสุด</th> : null}
                  {show('cost') ? <th className="num">ทุน</th> : null}
                  <th className="num">ราคา A</th>
                  {show('pB') ? <th className="num">ราคา B</th> : null}
                  {show('pC') ? <th className="num">ราคา C</th> : null}
                  {show('move') ? <th>เคลื่อนไหวล่าสุด</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: 4 }}>
                      {picSha.get(p.id) ? (
                        <Link href={`/stock/${p.id}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/pics/${p.id}/${picSha.get(p.id)}?t=1`}
                            alt=""
                            width={38}
                            height={38}
                            style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }}
                          />
                        </Link>
                      ) : null}
                    </td>
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
                    {show('qty') ? (
                      <td className="num">
                        {p.needReorder
                          ? <span className="chip due">{p.qtyOnHand.toLocaleString('en-US')}</span>
                          : p.qtyOnHand.toLocaleString('en-US')}
                      </td>
                    ) : null}
                    {show('min') ? (
                      <td className="num" style={{ color: 'var(--ink-3)' }}>{p.qtyMin.toLocaleString('en-US')}</td>
                    ) : null}
                    {show('max') ? (
                      <td className="num" style={{ color: 'var(--ink-3)' }}>
                        {p.qtyMax > 0 ? p.qtyMax.toLocaleString('en-US') : '-'}
                      </td>
                    ) : null}
                    {show('cost') ? <td className="num">{baht(p.lastCost)}</td> : null}
                    <td className="num">{baht(p.priceA)}</td>
                    {show('pB') ? <td className="num">{baht(p.priceB)}</td> : null}
                    {show('pC') ? <td className="num">{baht(p.priceC)}</td> : null}
                    {show('move') ? <td>{thDate(p.lastMoveOn)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <PageSize base="/stock" size={pageSize} keep={keep as Record<string, string>} />
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={{ pathname: '/stock', query: { ...paged, page: page - 1 } }}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={{ pathname: '/stock', query: { ...paged, page: page + 1 } }}>ถัดไป</Link> : null}
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
      </SubNav>
    </Shell>
  );
}
