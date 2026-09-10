import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { listIncomeDocs } from '@/lib/queries';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { PageSize, pageSizeOf } from '@/components/page-size';
import { baht, KIND_SHORT, payLabel, thDate } from '@/lib/format';
import { canEdit, canTab } from '@/lib/perms';
import { TodoCell } from './todo-cell';
import { NEW_BTNS } from '@/lib/doc-flow';

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


/** แท็บย่อยในผังเมนูต่อกับตัวกรองชนิดเอกสาร — ใบส่งมอบสองแบบเป็นคนละแท็บ (03.2 / 03.2.1) */
const SUB_OF: Record<string, string> = {
  QT: 'quote', IVT: 'invoice', IV: 'ivnovat', RC: 'receipt',
};

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; page?: string; size?: string;
    from?: string; to?: string; month?: string; year?: string; voided?: string;
  }>;
}) {
  const session = await requireTab('income', 'receipt');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const search = sp.q ?? '';
  const kind = sp.kind ?? '';
  const { from, to } = rangeFromParams(sp);
  const pageSize = pageSizeOf(sp.size);

  const includeVoid = sp.voided === '1';
  const { rows, total } = await listIncomeDocs({
    search, kind, page, from, to, pageSize, includeVoid,
  });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  /*
   * คอลัมน์เปลี่ยนตามแท็บ — รุ่น 6.4 มีหน้าแยกต่อชนิดเอกสาร แต่ละหน้าจึงมีคอลัมน์ของตัวเอง
   * เรารวมเป็นหน้าเดียวที่กรองด้วย kind ถ้าใช้คอลัมน์ชุดกลางชุดเดียวเหมือนเดิม
   * คอลัมน์เฉพาะทางของแต่ละชนิดจะหายหมด เช่นใบเสนอราคาไม่มีที่ให้บอกว่าออกใบต่อหรือยัง
   */
  const view = kind === 'QT' ? 'quote'
    : kind === 'RC' ? 'receipt'
    : kind === 'IV' || kind === 'IVT' ? 'invoice'
    : 'all';

  const mayInvoice = canTab(session, 'income', 'invoice');
  const mayReceipt = canTab(session, 'income', 'receipt');
  /* แก้ไขไม่ได้ก็ยกเลิกและคัดลอกไม่ได้ — ปุ่มที่กดแล้วโดนปฏิเสธไม่ควรมีให้เห็น */
  const mayEdit = canEdit(session, 'income', 'receipt');

  /* ค่าที่ต้องติดไปกับทุกลิงก์ในหน้านี้ ไม่งั้นกดหน้าถัดไปแล้วตัวกรองหลุด */
  const keep: Record<string, string> = {
    ...(search ? { q: search } : {}),
    ...(kind ? { kind } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(sp.size ? { size: sp.size } : {}),
    ...(includeVoid ? { voided: '1' } : {}),
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
        mayEdit ? (
          <div className="tag-row">
            {(NEW_BTNS[view] ?? NEW_BTNS.all!).map((b) => (
              <Link key={b.kind} className={b.primary ? 'btn primary' : 'btn'}
                    href={`/income/new?kind=${b.kind}`}>
                <span className="mono" style={{ opacity: 0.55, marginRight: 5 }}>{b.no}</span>
                {b.label}
              </Link>
            ))}
          </div>
        ) : undefined
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
            {/* ค้นด้วยเลขที่เอกสารเจอใบที่ยกเลิกเสมอ ตัวเลือกนี้มีไว้สำหรับตอนไล่ดูทั้งรายการ */}
            <label className="chip" style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                   title="ปกติซ่อนไว้ ค้นด้วยเลขที่เอกสารยังเจอใบที่ยกเลิกอยู่แล้ว">
              <input type="checkbox" name="voided" value="1" defaultChecked={includeVoid} />
              รวมใบที่ยกเลิก
            </label>
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
                  {view === 'receipt' ? <th>อ้างอิง</th> : null}
                  {view === 'all' || view === 'invoice' ? <th>ชนิด</th> : null}
                  <th>วันที่</th>
                  <th>ลูกค้า</th>
                  {view === 'all' ? <th>ทะเบียน</th> : null}
                  <th className="num">{view === 'receipt' ? 'สุทธิรับ' : 'ยอดรวม'}</th>
                  {view === 'quote' ? (
                    <>
                      <th>ใบส่งมอบ / แจ้งหนี้</th>
                      <th>ใบเสร็จรับเงิน</th>
                    </>
                  ) : (
                    <>
                      {view === 'all' ? <th className="num">รับชำระแล้ว</th> : null}
                      <th className="num">คงค้าง</th>
                      {view === 'receipt' ? <th>การชำระ</th> : <th>สถานะ</th>}
                      {view === 'all' ? <th>ครบกำหนด</th> : null}
                    </>
                  )}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = payLabel(r.outstanding, r.paid);
                  return (
                    <tr key={r.id} style={r.voided ? { opacity: 0.55 } : undefined}>
                      <td className="mono">
                        <Link href={`/income/${r.id}`}
                              style={{ textDecoration: r.voided ? 'line-through' : 'underline' }}>
                          {r.docNo}
                        </Link>
                        {r.voided ? (
                          <span className="chip due" style={{ marginLeft: 6 }}
                                title={r.voidedReason || 'ไม่ได้บันทึกเหตุผลไว้'}>
                            ยกเลิกแล้ว
                          </span>
                        ) : null}
                      </td>

                      {view === 'receipt' ? (
                        <td className="mono">
                          {r.parent
                            ? <Link href={`/income/${r.parent.id}`}>{r.parent.docNo}</Link>
                            : <span className="subtle">-</span>}
                        </td>
                      ) : null}

                      {view === 'all' || view === 'invoice' ? <td>{KIND_SHORT[r.kind]}</td> : null}
                      <td>{thDate(r.docDate)}</td>

                      <td className="wrap">
                        {r.partyName || '-'}
                        {r.missing.length ? (
                          <span className="chip warn" title={r.missing.join(' · ')}
                                style={{ marginLeft: 6 }}>
                            ข้อมูลไม่ครบ
                          </span>
                        ) : null}
                        {/* แท็บเฉพาะชนิดไม่มีคอลัมน์ทะเบียน เอาไว้ใต้ชื่อแทน ตามรุ่น 6.4 */}
                        {view !== 'all' && r.vehiclePlate ? (
                          <div className="mono subtle" style={{ fontSize: 11.5 }}>{r.vehiclePlate}</div>
                        ) : null}
                      </td>

                      {view === 'all' ? <td className="mono">{r.vehiclePlate || '-'}</td> : null}
                      <td className="num">{baht(r.payable)}</td>

                      {view === 'quote' ? (
                        <>
                          <td>
                            <TodoCell done={r.invoice} canMake={mayInvoice} voided={false}
                                      href={`/income/new?kind=IVT&from=${r.id}`}
                                      todoTitle="ยังไม่ได้ออกใบส่งมอบ — กดเพื่อจัดทำ" />
                          </td>
                          <td>
                            <TodoCell done={r.receipt} canMake={mayReceipt} voided={false}
                                      href={`/income/new?kind=RC&from=${r.id}`}
                                      todoTitle="ยังไม่ได้ออกใบเสร็จ — กดเพื่อจัดทำ" />
                          </td>
                        </>
                      ) : (
                        <>
                          {view === 'all' ? (
                            <td className="num">{r.kind === 'QT' ? '-' : baht(r.paid)}</td>
                          ) : null}
                          <td className="num">
                            {r.kind === 'QT' ? '-' : r.outstanding > 0.004 ? baht(r.outstanding) : '-'}
                          </td>
                          {view === 'receipt' ? (
                            <td className="wrap">
                              {r.payMethods.length ? r.payMethods.join(' · ') : <span className="subtle">-</span>}
                            </td>
                          ) : (
                            <td>
                              {r.kind === 'QT'
                                ? <span className="chip">ใบเสนอราคา</span>
                                : <span className={`chip ${st.tone}`}>{st.text}</span>}
                            </td>
                          )}
                          {view === 'all' ? <td>{thDate(r.dueDate)}</td> : null}
                        </>
                      )}

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className="row-acts">
                          <Link className="btn sm" href={`/income/${r.id}`}>เปิด</Link>
                          <Link className="btn sm" href={`/income/${r.id}/print`}>พิมพ์</Link>

                          {/* ออกใบเสร็จได้จากแถวใบส่งมอบที่ยังไม่มีใบเสร็จ ตามที่รุ่น 6.4 ทำ */}
                          {!r.voided && mayReceipt && (r.kind === 'IV' || r.kind === 'IVT')
                            && !r.receipt ? (
                            <Link className="btn sm primary" href={`/income/new?kind=RC&from=${r.id}`}>
                              ออกใบเสร็จ
                            </Link>
                          ) : null}

                          {/* ใบที่ยกเลิกแล้วเหลือทางเดียวคือคัดลอกเป็นใบใหม่ — ต้องกดได้จากแถว
                              ไม่งั้นเดินไปถึงไม่ได้เลยเพราะรายการปกติซ่อนใบพวกนี้ไว้ */}
                          {r.voided && mayEdit ? (
                            <Link className="btn sm"
                                  href={`/income/new?kind=${r.kind}&from=${r.id}&copy=1`}>
                              คัดลอกใบใหม่
                            </Link>
                          ) : null}

                          {/* ยกเลิกไม่ทำทันทีจากแถว — พาไปแผงยืนยันที่ต้องกรอกเหตุผล */}
                          {!r.voided && mayEdit ? (
                            <Link className="btn sm danger" href={`/income/${r.id}?void=1`}>ยกเลิก</Link>
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
