import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { listIncomeDocs } from '@/lib/queries';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { PageSize, pageSizeOf } from '@/components/page-size';
import { baht, KIND_SHORT, payLabel, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * เลขกำกับยกมาจากเมนูของรุ่น 3.6 ให้ผู้ใช้เดิมไม่ต้องเรียนใหม่
 *
 * ใบส่งมอบสองแบบเคยได้ 03.3 เท่ากันทั้งคู่ ตอนนี้แยกเป็น 03.2 กับ 03.2.1
 * ให้ตรงกับผังเมนู — เลขซ้ำกันทำให้กดจากเมนูแล้วหน้าปลายทางบอกเลขคนละตัว
 */
const TABS = [
  { key: '', no: '', label: 'ทั้งหมด' },
  { key: 'QT', no: '03.1', label: 'ใบเสนอราคา' },
  { key: 'IVT', no: '03.2', label: 'ใบส่งมอบ + ใบกำกับภาษี' },
  { key: 'IV', no: '03.2.1', label: 'ใบส่งมอบ (ไม่มี VAT)' },
  { key: 'RC', no: '03.5', label: 'ใบเสร็จรับเงิน' },
];

/** เลขเมนูเดิมของหน้าออกเอกสารใหม่ */
const NEW_NO = { QT: '03.1', RC: '03.4' } as const;

/** แท็บย่อยในผังเมนูต่อกับตัวกรองชนิดเอกสาร — ใบส่งมอบสองแบบเป็นคนละแท็บ (03.2 / 03.2.1) */
const SUB_OF: Record<string, string> = {
  QT: 'quote', IVT: 'invoice', IV: 'ivnovat', RC: 'receipt',
};

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; page?: string; size?: string;
    from?: string; to?: string; month?: string; year?: string;
  }>;
}) {
  await requireTab('income', 'receipt');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const search = sp.q ?? '';
  const kind = sp.kind ?? '';
  const { from, to } = rangeFromParams(sp);
  const pageSize = pageSizeOf(sp.size);

  const { rows, total } = await listIncomeDocs({ search, kind, page, from, to, pageSize });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  /* ค่าที่ต้องติดไปกับทุกลิงก์ในหน้านี้ ไม่งั้นกดหน้าถัดไปแล้วตัวกรองหลุด */
  const keep: Record<string, string> = {
    ...(search ? { q: search } : {}),
    ...(kind ? { kind } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(sp.size ? { size: sp.size } : {}),
  };
  /* เหมือน keep แต่ไม่มี size — ปุ่มเลือกจำนวนแถวใส่ค่าของตัวเอง */
  const { size: _size, ...filters } = keep;

  const linkTo = (patch: Record<string, string | number>) => ({
    pathname: '/income' as const,
    query: { ...keep, ...patch },
  });

  return (
    <Shell
      current="/income"
      title="รายรับ"
      sub={`เอกสารขายทั้งหมด ${total.toLocaleString('en-US')} ฉบับ`}
      actions={
        <div className="tag-row">
          <Link className="btn" href="/income/new?kind=QT">
            <span className="mono" style={{ opacity: 0.55, marginRight: 5 }}>{NEW_NO.QT}</span>+ ใบเสนอราคา
          </Link>
          <Link className="btn primary" href="/income/new?kind=RC">
            <span className="mono" style={{ opacity: 0.6, marginRight: 5 }}>{NEW_NO.RC}</span>+ ใบเสร็จ
          </Link>
        </div>
      }
    >
      <SubNav menu="income" current={SUB_OF[kind] ?? 'quote'}>
      <div className="card">
        <div className="toolbar">
          {TABS.map((t) => (
            <Link
              key={t.key || 'all'}
              className="chip"
              href={{ pathname: '/income', query: { ...keep, ...(t.key ? { kind: t.key } : { kind: undefined }) } }}
              style={t.key === kind ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}
            >
              {t.no ? <span className="mono" style={{ opacity: 0.55, marginRight: 5 }}>{t.no}</span> : null}
              {t.label}
            </Link>
          ))}

          <div className="spacer" />

          <form action="/income" method="get" style={{ display: 'flex', gap: 6 }}>
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            {from ? <input type="hidden" name="from" value={from} /> : null}
            {to ? <input type="hidden" name="to" value={to} /> : null}
            <input className="in" type="search" name="q" defaultValue={search}
                   placeholder="เลขที่เอกสาร ชื่อลูกค้า หรือทะเบียนรถ" style={{ width: 260 }} />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>

        <DocDateFilter base="/income" from={from} to={to}
                       keep={{ ...(search ? { q: search } : {}), ...(kind ? { kind } : {}) }} />

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
                      <td className="wrap">
                        {r.partyName || '-'}
                        {r.missing.length ? (
                          <span className="chip warn" title={r.missing.join(' · ')}
                                style={{ marginLeft: 6 }}>
                            ข้อมูลไม่ครบ
                          </span>
                        ) : null}
                      </td>
                      <td className="mono">{r.vehiclePlate || '-'}</td>
                      <td className="num">{baht(r.payable)}</td>
                      <td className="num">{r.kind === 'QT' ? '-' : baht(r.paid)}</td>
                      <td className="num">
                        {r.kind === 'QT' ? '-' : r.outstanding > 0.004 ? baht(r.outstanding) : '-'}
                      </td>
                      <td>
                        {r.kind === 'QT'
                          ? <span className="chip">ใบเสนอราคา</span>
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
          <PageSize base="/income" size={pageSize} keep={filters} />
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={linkTo({ page: page - 1 })}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={linkTo({ page: page + 1 })}>ถัดไป</Link> : null}
        </div>
      </div>
      </SubNav>
    </Shell>
  );
}
