import Link from 'next/link';
import { ActionTiles } from '@/components/action-tiles';
import { EXPENSE_CATS } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { canEdit as mayEditOf, canExport as mayExportOf } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { blankBuyDoc, listBuyDocs, type BuyKind } from '@/lib/purchases';
import { getShop } from '@/lib/queries';
import { getDefaultNote, peekDocSeq } from '@/lib/sales';
import { BuyEditor } from './buy-editor';
import { SavedBanner } from '@/components/saved-banner';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { HIST_DEFAULT_PAGE_SIZE, HIST_PAGE_SIZES, PageSize, pageSizeOf } from '@/components/page-size';
import { baht, payLabel, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** เลขกำกับยกมาจากเมนูของรุ่น 3.6 — หน้ารายการที่บันทึกแล้วคือ 04.2 และ 04.4 */
const TABS = [
  { key: '', no: '', label: 'ทั้งหมด' },
  { key: 'PO', no: '04.1', label: 'ใบซื้อสินค้า' },
  { key: 'EX', no: '04.2', label: 'ค่าใช้จ่าย' },
];

const CAT_LABEL = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c.label]));

export default async function ExpensePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; cat?: string; page?: string; size?: string;
    from?: string; to?: string; month?: string; year?: string; hist?: string; saved?: string; savedId?: string;
  }>;
}) {
  const session = await requireTab('expense', 'purchase');
  const mayEdit = mayEditOf(session, 'expense', 'purchase');
  const mayPrint = mayExportOf(session, 'expense', 'purchase');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const { from, to } = rangeFromParams(sp);
  const pageSize = pageSizeOf(sp.size, HIST_PAGE_SIZES, HIST_DEFAULT_PAGE_SIZE);

  const { rows, total } = await listBuyDocs({
    kind: sp.kind, cat: sp.cat, search: sp.q, page, from, to, pageSize,
  });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  /* ทุกเมนูย่อยเปิดมาเป็นฟอร์มสร้างใหม่ ประวัติต่อล่าง (hist=1 สลับ) — เหมือนรายรับ */
  const formKind: BuyKind | null = sp.kind === 'PO' ? 'PO' : sp.kind === 'EX' ? 'EX' : null;
  const histFirst = sp.hist === '1' || !formKind;
  const returnTo = `/expense?kind=${sp.kind ?? ''}${sp.hist === '1' ? '&hist=1' : ''}`;
  const form = formKind ? await (async () => {
    const [shop, noteDefault] = await Promise.all([getShop(), getDefaultNote()]);
    const initial = blankBuyDoc(formKind, noteDefault);
    return { shop, initial, seq: await peekDocSeq(formKind, initial.docDate) };
  })() : null;
  const formBlock = form && formKind ? (
    <div id="new-buy" style={{ marginBottom: 14 }}>
      <BuyEditor initial={form.initial} vatRate={form.shop.vatRate} mode="new" returnTo={returnTo}
                 docNoPreview={{ seq: form.seq, month: form.initial.docDate.slice(0, 7) }} />
    </div>
  ) : null;

  const keep: Record<string, string> = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.kind ? { kind: sp.kind } : {}),
    ...(sp.cat ? { cat: sp.cat } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(sp.size ? { size: sp.size } : {}),
  };
  /* เหมือน keep แต่ไม่มี size — ปุ่มเลือกจำนวนแถวใส่ค่าของตัวเอง และหน้าพิมพ์ไม่แบ่งหน้าอยู่แล้ว */
  const { size: _size, ...filters } = keep;
  const printQuery = new URLSearchParams(filters).toString();
  const chipStyle = (on: boolean) =>
    on ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined;

  return (
    <Shell
      current="/expense"
      title="รายจ่าย"
      sub={`${total.toLocaleString('en-US')} รายการ`}
      actions={<>
        <div className="tag-row">
          <Link className="btn" href={`/expense/print${printQuery ? `?${printQuery}` : ''}`}>พิมพ์รายการ</Link>
        </div>
      </>}
    >
      <SubNav menu="expense" current={sp.kind === 'EX' ? 'expense' : 'purchase'}>
      {sp.saved && sp.savedId ? <SavedBanner docNo={sp.saved} printHref={`/expense/${sp.savedId}/print`} openHref={`/expense/${sp.savedId}`} /> : null}
      <div className="card">
        <div className="toolbar">
          <div className="tiles">
          {TABS.map((t) => (
            <Link key={t.key || 'all'} className="tile" aria-current={(sp.kind ?? '') === t.key}
                  href={{ pathname: '/expense', query: { ...keep, cat: undefined, ...(t.key ? { kind: t.key, hist: '1' } : { kind: undefined }) } }}>
              {t.no ? <span className="k">{t.no}</span> : null}
              {t.label}
            </Link>
          ))}
          <ActionTiles menu="expense" />
          </div>

          {sp.kind === 'EX' ? (
            <>
              <span style={{ color: 'var(--line)' }}>|</span>
              {EXPENSE_CATS.map((c) => (
                <Link key={c.key} className="chip"
                      href={{ pathname: '/expense', query: { ...keep, kind: 'EX', cat: sp.cat === c.key ? undefined : c.key } }}
                      style={chipStyle(sp.cat === c.key)}>
                  {c.label}
                </Link>
              ))}
            </>
          ) : null}

          <div className="spacer" />
          <form autoComplete="off" action="/expense" method="get" style={{ display: 'flex', gap: 6 }}>
            <input type="hidden" name="hist" value="1" />
            {sp.kind ? <input type="hidden" name="kind" value={sp.kind} /> : null}
            {sp.cat ? <input type="hidden" name="cat" value={sp.cat} /> : null}
            {from ? <input type="hidden" name="from" value={from} /> : null}
            {to ? <input type="hidden" name="to" value={to} /> : null}
            <input className="in search" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="กรอกคำค้นหา — เลขที่ ชื่อผู้ขาย หรือเลขใบกำกับ" style={{ width: 240 }} />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>
      </div>
      {!histFirst ? formBlock : null}
      {histFirst ? (<div className="card">

        <DocDateFilter base="/expense" from={from} to={to}
                       keep={{
                         ...(sp.q ? { q: sp.q } : {}),
                         ...(sp.kind ? { kind: sp.kind } : {}),
                         ...(sp.cat ? { cat: sp.cat } : {}),
                       }} />

        {rows.length === 0 ? (
          <div className="empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl hist fit">
              <thead>
                <tr>
                  <th>เลขที่</th><th>ชนิด</th><th>วันที่</th><th>ผู้ขาย / ผู้รับเงิน</th>
                  <th>อ้างอิง</th>
                  <th className="num">ยอดจ่าย</th><th className="num">จ่ายแล้ว</th><th className="num">คงค้าง</th>
                  <th>สถานะ</th><th>ครบกำหนด</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = payLabel(r.outstanding, r.paid);
                  return (
                    <tr key={r.id} style={r.status === 'void' ? { opacity: 0.5 } : undefined}>
                      <td className="mono">
                        <Link href={`/expense/${r.id}`} style={{ textDecoration: 'underline' }}>{r.docNo}</Link>
                      </td>
                      <td>
                        {r.kind === 'PO' ? 'ใบซื้อ' : CAT_LABEL[r.expenseCat ?? ''] ?? 'ค่าใช้จ่าย'}
                        {r.kind === 'PO' && !r.goodsReceived ? (
                          <span className="chip warn" style={{ marginLeft: 6 }}>ยังไม่รับของ</span>
                        ) : null}
                      </td>
                      <td>{thDate(r.docDate)}</td>
                      <td className="wrap">{r.partyName || '-'}</td>
                      <td className="mono subtle">{r.refDocNo || '-'}</td>
                      <td className="num">{baht(r.payable)}</td>
                      <td className="num">{baht(r.paid)}</td>
                      <td className="num">{r.outstanding > 0.004 ? baht(r.outstanding) : '-'}</td>
                      <td>
                        {r.status === 'void'
                          ? <span className="chip">ยกเลิกแล้ว</span>
                          : <span className={`chip ${st.tone}`}>{st.text}</span>}
                      </td>
                      <td>{thDate(r.dueDate)}</td>

                      {/* หน้ารายการต้องทำงานจบได้เอง — เดิมแถวไม่มีปุ่มเลยสักปุ่ม
                          ต้องเปิดเข้าไปในใบก่อนถึงจะทำอะไรได้ ต่างจากหน้ารายรับและจากรุ่น 6.4 */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className="row-acts">
                          <Link className="btn sm" href={`/expense/${r.id}`}>เปิด</Link>
                          {mayPrint ? (
                            <Link className="btn sm" href={`/expense/${r.id}/print`}>พิมพ์</Link>
                          ) : null}

                          {/* รายจ่ายกู้คืนได้ ต่างจากรายรับที่ต้องคัดลอกใบใหม่ —
                              ใบซื้อไม่มีเอกสารที่ออกไปถึงมือคนนอก การกดยกเลิกผิดใบ
                              จึงเป็นแค่การคีย์ผิด ไม่ใช่เรื่องที่ต้องมีร่องรอยใบใหม่ */}
                          {r.status === 'void' && mayEdit ? (
                            <Link className="btn sm" href={`/expense/${r.id}`}>กู้คืน</Link>
                          ) : null}

                          {r.status !== 'void' && mayEdit ? (
                            <Link className="btn sm danger" href={`/expense/${r.id}?void=1`}>ยกเลิก</Link>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <PageSize base="/expense" size={pageSize} keep={filters} sizes={HIST_PAGE_SIZES} defaultSize={HIST_DEFAULT_PAGE_SIZE} />
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={{ pathname: '/expense', query: { ...keep, page: page - 1 } }}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={{ pathname: '/expense', query: { ...keep, page: page + 1 } }}>ถัดไป</Link> : null}
        </div>
      </div>) : null}

      </SubNav>
    </Shell>
  );
}
