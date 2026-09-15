import { today } from '@drivegolight/core';
import Link from 'next/link';
import { RowLink } from '@/components/row-link';
import { STOCK_FLAG_LABEL, STOCK_FLAG_SHORT, STOCK_FLAGS, toStockFlag } from '@drivegolight/core';
import { query, requireTab } from '@/lib/auth';
import { PageSize, pageSizeOf, STOCK_DEFAULT_PAGE_SIZE, STOCK_PAGE_SIZES } from '@/components/page-size';
import { Pager } from '@/components/pager';
import { getStockHiddenCols, STOCK_COLS, STOCK_COLS_FIXED } from '@/lib/ui-prefs';
import { picShaOf } from '@/lib/pics';
import { listPendingItems } from '@/lib/pending';
import { ColPicker } from './col-picker';
import { ActionTiles } from '@/components/action-tiles';
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
  searchParams: Promise<{ cols?: string;
    q?: string; cat?: string; reorder?: string; all?: string; page?: string; flag?: string; size?: string;
  }>;
}) {
  const session = await requireTab('stock', 'list');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const todayIso = today();
  const flag = toStockFlag(sp.flag);
  /* ทะเบียนสินค้า: หน้าละ 10 ตั้งต้น เลือก 10/20 */
  const pageSize = pageSizeOf(sp.size, STOCK_PAGE_SIZES, STOCK_DEFAULT_PAGE_SIZE);

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
      title="สินค้า"
      sub={`${total.toLocaleString('en-US')} รายการ` + (show('cost') ? ` · มูลค่าสต๊อก ${baht(stockValue)}` : '')}
    >
      <SubNav menu="stock" current="list" badges={{ pending: pending.length }}>
      <div className="card">
        {/* แถบไทล์แบบเดียวกับต้นแบบ: ทั้งหมด · ถึงจุดสั่งซื้อ · ตัวกรองสต๊อก · การ์ดอำพันเพิ่มสินค้า · ค้นหา · ตั้งค่าการแสดงผล · พิมพ์รายงาน */}
        <div className="toolbar">
          <div className="tiles">
            <Link className="tile" aria-current={!flag && sp.reorder !== '1' ? 'true' : undefined} href="/stock">ทั้งหมด</Link>
            <Link className="tile" aria-current={sp.reorder === '1' ? 'true' : undefined} href={{ pathname: '/stock', query: { reorder: '1' } }}>ถึงจุดสั่งซื้อ</Link>
            {STOCK_FLAGS.map((f) => (
              <Link key={f} className="tile" aria-current={flag === f ? 'true' : undefined}
                    href={{ pathname: '/stock', query: flag === f ? {} : { flag: f } }}>
                {STOCK_FLAG_LABEL[f]}
              </Link>
            ))}
            <ActionTiles menu="stock" />
          </div>
          <span className="spacer" />
          <form autoComplete="off" action="/stock" method="get" className="row-flex">
            <input className="in search w-240" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="กรอกคำค้นหา — รหัส ชื่อ หรือหมวด" />
            <select className="in w-auto" name="cat" defaultValue={sp.cat ?? ''}>
              <option value="">ทุกหมวดหมู่</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.productCount})</option>
              ))}
            </select>
            <label className="tag-row fs-13">
              <input type="checkbox" name="all" value="1" defaultChecked={sp.all === '1'} />
              รวมที่ปิดใช้งาน
            </label>
            <button className="btn" type="submit">ค้นหา</button>
          </form>
          <ColPicker cols={STOCK_COLS} hidden={hidden} fixed={STOCK_COLS_FIXED} startOpen={sp.cols === '1'} />
          <Link className="btn" href={`/stock/print${printQuery ? `?${printQuery}` : ''}`}>🖨 พิมพ์รายงาน</Link>
        </div>

        {rows.length === 0 ? (
          <div className="empty">ไม่พบสินค้าที่ตรงกับเงื่อนไข</div>
        ) : (
          <>
          {/* มือถือ: การ์ดต่อสินค้า (รูป · ชื่อ · รหัส · ราคาขาย/หน่วย · คงเหลือ) — จอใหญ่ยังเป็นตาราง (ผู้ใช้กำหนด) */}
          <div className="stock-cards">
            {rows.map((p) => (
              <Link key={p.id} href={`/stock/${p.id}`} className="scard">
                <div className="top">
                  {picSha.get(p.id) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img className="thumb" src={`/pics/${p.id}/${picSha.get(p.id)}?t=1`} alt="" />
                  ) : <span className="thumb">📷</span>}
                  <b className="nm">{p.name}</b>
                  <span className="code mono">{p.code}</span>
                </div>
                <div className="kv"><span>ราคาขาย/หน่วย</span><b>{baht(p.priceA)} บาท</b></div>
                <div className="kv"><span>จำนวนคงเหลือ</span><b>{p.qtyOnHand.toLocaleString('en-US')} {p.unit}</b></div>
              </Link>
            ))}
          </div>
          <div className="tablewrap stock-table">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 46 }} />
                  <th>รหัส</th>
                  {show('oem') ? <th>OEM</th> : null}
                  <th>ชื่อสินค้า</th>
                  {show('cat') ? <th>หมวดหมู่</th> : null}
                  {show('qty') ? <th className="num">คงเหลือ</th> : null}
                  {show('min') ? <th className="num">จุดสั่ง</th> : null}
                  {show('max') ? <th className="num">สูงสุด</th> : null}
                  {show('cost') ? <th className="num" title="ราคาซื้อครั้งล่าสุด ใช้ตั้งราคาและประมาณเงินที่ต้องใช้สั่งของ — ไม่ใช่ตัวที่ใช้คิดมูลค่าสต๊อก">ราคาซื้อล่าสุด</th> : null}
                  {show('pA') ? <th className="num">ราคา A</th> : null}
                  {show('pB') ? <th className="num">ราคา B</th> : null}
                  {show('pC') ? <th className="num">ราคา C</th> : null}
                  {show('move') ? <th>เคลื่อนไหวล่าสุด</th> : null}
                  {show('expiry') ? <th title="วันหมดอายุของล็อตที่จะถูกตัดก่อน">วันหมดอายุ</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <RowLink key={p.id} href={`/stock/${p.id}`}>
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
                          {STOCK_FLAG_SHORT[f]}
                        </span>
                      ))}
                    </td>
                    {show('oem') ? <td className="mono" style={{ color: 'var(--ink-3)' }}>{p.oem || '-'}</td> : null}
                    <td className="wrap">{p.name}</td>
                    {show('cat') ? <td>{p.categoryName ?? <span style={{ color: 'var(--ink-3)' }}>ไม่ระบุ</span>}</td> : null}
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
                    {show('pA') ? <td className="num">{baht(p.priceA)}</td> : null}
                    {show('pB') ? <td className="num">{baht(p.priceB)}</td> : null}
                    {show('pC') ? <td className="num">{baht(p.priceC)}</td> : null}
                    {show('move') ? <td>{thDate(p.lastMoveOn)}</td> : null}
                    {show('expiry') ? <td className={p.nearestExpiry && p.nearestExpiry < todayIso ? 'due' : ''} style={p.nearestExpiry && p.nearestExpiry < todayIso ? { color: 'var(--due)', fontWeight: 600 } : undefined}>{p.nearestExpiry ? thDate(p.nearestExpiry) : '-'}</td> : null}
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* คนอ่านตารางจะเอาคอลัมน์ราคาซื้อล่าสุดคูณคงเหลือเองแล้วได้ไม่ตรงกับยอดรวมด้านบน
            ถ้าไม่บอกว่าสองอย่างนี้คิดคนละแบบและเพราะอะไร */}
        {show('cost') ? (
          <div className="body" style={{ paddingBottom: 0 }}>
            <div className="note">
              <b>มูลค่าสต๊อกคิดตามบัญชี</b> — ต้นทุนของที่รับเข้าจริง ลบต้นทุนของที่ตัดออกไปแล้ว
              ตามลำดับเข้าก่อนออกก่อน จึงไม่เท่ากับคงเหลือคูณราคาซื้อล่าสุดเมื่อราคาซื้อเปลี่ยนไป
              ส่วนคอลัมน์ <b>ราคาซื้อล่าสุด</b> คือราคาซื้อครั้งหลังสุด ใช้ตั้งราคาขายและประมาณเงินที่ต้องใช้สั่งของ
            </div>
          </div>
        ) : null}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <PageSize base="/stock" size={pageSize} keep={keep as Record<string, string>} sizes={STOCK_PAGE_SIZES} defaultSize={STOCK_DEFAULT_PAGE_SIZE} />
          <div className="spacer" />
          <Pager base="/stock" query={paged as Record<string, string | number | undefined>} page={page} lastPage={lastPage} />
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
