import Link from 'next/link';
import { EXPENSE_CATS } from '@drivegolight/core';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { listBuyDocs } from '@/lib/purchases';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { baht, payLabel, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: '', label: 'ทั้งหมด' },
  { key: 'PO', label: 'ใบซื้อสินค้า' },
  { key: 'EX', label: 'ค่าใช้จ่าย' },
];

const CAT_LABEL = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c.label]));

export default async function ExpensePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; cat?: string; page?: string;
    from?: string; to?: string; month?: string; year?: string;
  }>;
}) {
  await requirePerm('expense');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const { from, to } = rangeFromParams(sp);

  const { rows, total } = await listBuyDocs({
    kind: sp.kind, cat: sp.cat, search: sp.q, page, from, to,
  });
  const lastPage = Math.max(1, Math.ceil(total / 25));

  const keep: Record<string, string> = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.kind ? { kind: sp.kind } : {}),
    ...(sp.cat ? { cat: sp.cat } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const printQuery = new URLSearchParams(keep).toString();
  const chipStyle = (on: boolean) =>
    on ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined;

  return (
    <Shell
      current="/expense"
      title="รายจ่าย"
      sub={`${total.toLocaleString('en-US')} รายการ`}
      actions={
        <div className="tag-row">
          <Link className="btn" href={`/expense/print${printQuery ? `?${printQuery}` : ''}`}>พิมพ์รายการ</Link>
          <Link className="btn" href="/expense/new?kind=PO">+ ใบซื้อ</Link>
          <Link className="btn primary" href="/expense/new?kind=EX">+ ค่าใช้จ่าย</Link>
        </div>
      }
    >
      <div className="card">
        <div className="toolbar">
          {TABS.map((t) => (
            <Link key={t.key || 'all'} className="chip"
                  href={{ pathname: '/expense', query: { ...keep, cat: undefined, ...(t.key ? { kind: t.key } : { kind: undefined }) } }}
                  style={chipStyle((sp.kind ?? '') === t.key)}>
              {t.label}
            </Link>
          ))}

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
          <form action="/expense" method="get" style={{ display: 'flex', gap: 6 }}>
            {sp.kind ? <input type="hidden" name="kind" value={sp.kind} /> : null}
            {sp.cat ? <input type="hidden" name="cat" value={sp.cat} /> : null}
            {from ? <input type="hidden" name="from" value={from} /> : null}
            {to ? <input type="hidden" name="to" value={to} /> : null}
            <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="เลขที่ ชื่อผู้ขาย หรือเลขใบกำกับ" style={{ width: 240 }} />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>

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
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่</th><th>ชนิด</th><th>วันที่</th><th>ผู้ขาย / ผู้รับเงิน</th>
                  <th>อ้างอิง</th>
                  <th className="num">ยอดจ่าย</th><th className="num">จ่ายแล้ว</th><th className="num">คงค้าง</th>
                  <th>สถานะ</th><th>ครบกำหนด</th>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={{ pathname: '/expense', query: { ...keep, page: page - 1 } }}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={{ pathname: '/expense', query: { ...keep, page: page + 1 } }}>ถัดไป</Link> : null}
        </div>
      </div>
    </Shell>
  );
}
