import Link from 'next/link';
import { Shell } from '@/components/shell';
import { listIncomeDocs } from '@/lib/queries';
import { baht, KIND_SHORT, payLabel, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: '', label: 'ทั้งหมด' },
  { key: 'IVT', label: 'ใบส่งมอบ + ใบกำกับภาษี' },
  { key: 'IV', label: 'ใบส่งมอบ (ไม่มี VAT)' },
  { key: 'RC', label: 'ใบเสร็จรับเงิน' },
];

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const search = sp.q ?? '';
  const kind = sp.kind ?? '';

  const { rows, total } = await listIncomeDocs({ search, kind, page });
  const pageSize = 25;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const linkTo = (patch: Record<string, string | number>) => ({
    pathname: '/income' as const,
    query: { ...(search ? { q: search } : {}), ...(kind ? { kind } : {}), ...patch },
  });

  return (
    <Shell current="/income" title="รายรับ" sub={`เอกสารขายทั้งหมด ${total.toLocaleString('en-US')} ฉบับ`}>
      <div className="card">
        <div className="toolbar">
          {TABS.map((t) => (
            <Link
              key={t.key || 'all'}
              className="chip"
              href={{ pathname: '/income', query: { ...(search ? { q: search } : {}), ...(t.key ? { kind: t.key } : {}) } }}
              style={t.key === kind ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}
            >
              {t.label}
            </Link>
          ))}

          <div className="spacer" />

          <form action="/income" method="get" style={{ display: 'flex', gap: 6 }}>
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            <input className="in" type="search" name="q" defaultValue={search}
                   placeholder="เลขที่เอกสาร ชื่อลูกค้า หรือทะเบียนรถ" style={{ width: 260 }} />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="empty">ไม่พบเอกสารที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ชนิด</th>
                  <th>วันที่</th>
                  <th>ลูกค้า</th>
                  <th>ทะเบียน</th>
                  <th className="num">ยอดรวม</th>
                  <th className="num">รับชำระแล้ว</th>
                  <th className="num">คงค้าง</th>
                  <th>สถานะ</th>
                  <th>ครบกำหนด</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = payLabel(r.outstanding, r.paid);
                  return (
                    <tr key={r.id}>
                      <td className="mono">
                        <Link href={`/income/${r.id}`} style={{ textDecoration: 'underline' }}>{r.docNo}</Link>
                      </td>
                      <td>{KIND_SHORT[r.kind]}</td>
                      <td>{thDate(r.docDate)}</td>
                      <td className="wrap">{r.partyName || '-'}</td>
                      <td className="mono">{r.vehiclePlate || '-'}</td>
                      <td className="num">{baht(r.payable)}</td>
                      <td className="num">{baht(r.paid)}</td>
                      <td className="num">{r.outstanding > 0.004 ? baht(r.outstanding) : '-'}</td>
                      <td><span className={`chip ${st.tone}`}>{st.text}</span></td>
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
          {page > 1 ? <Link className="btn" href={linkTo({ page: page - 1 })}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={linkTo({ page: page + 1 })}>ถัดไป</Link> : null}
        </div>
      </div>
    </Shell>
  );
}
