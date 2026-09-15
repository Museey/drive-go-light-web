import { addrLineOf } from '@/lib/contacts';
import Link from 'next/link';
import { PrintReport } from '@/components/print-report';
import { RowLink } from '@/components/row-link';
import { requireTab } from '@/lib/auth';
import { PageSize, pageSizeOf } from '@/components/page-size';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { listContacts } from '@/lib/contacts';
import { baht } from '@/lib/format';
import { ColPicker } from '@/components/col-picker';
import { CUST_COLS, CUST_COLS_FIXED, getCustHiddenCols, type CustCol } from '@/lib/ui-prefs';
import { saveCustColsAction } from './actions';
import { SavedNotice } from '@/components/saved-notice';

export const dynamic = 'force-dynamic';

const KIND_TABS = [
  { key: '', label: 'ทั้งหมด' },
  { key: 'customer', label: 'ลูกค้า' },
  { key: 'vendor', label: 'ผู้ขาย' },
];
const TYPE_TABS = [
  { key: '', label: 'ทุกรูปแบบ' },
  { key: 'person', label: 'บุคคลธรรมดา' },
  { key: 'company', label: 'นิติบุคคล' },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; type?: string; page?: string; size?: string; saved?: string; savedId?: string }>;
}) {
  await requireTab('customer', 'customer');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;

  const pageSize = pageSizeOf(sp.size);
  const [hidden, { rows, total }] = await Promise.all([
    getCustHiddenCols(),
    listContacts({ search: sp.q, kind: sp.kind, type: sp.type, page, pageSize }),
  ]);
  const show = (k: CustCol) => !hidden.includes(k);
  /* คอลัมน์ที่ได้พื้นที่ที่เหลือ: ที่อยู่ถ้าเปิด · ไม่งั้นทะเบียนรถ · ปิดทั้งคู่ให้ชื่อ */
  const flex: CustCol = show('addr') ? 'addr' : show('plate') ? 'plate' : 'name';
  const w = (k: CustCol, px: number) => (flex === k ? undefined : { width: px });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const q = (patch: Record<string, string | number>) => ({
    pathname: '/customers',
    query: {
      ...(sp.q ? { q: sp.q } : {}),
      ...(sp.kind ? { kind: sp.kind } : {}),
      ...(sp.type ? { type: sp.type } : {}),
      ...(sp.size ? { size: sp.size } : {}),
      ...patch,
    },
  });

  /* ตัวกรองที่ไม่รวมจำนวนแถว — ใช้ทั้งกับปุ่มเลือกจำนวนแถวและลิงก์พิมพ์ */
  const filters: Record<string, string> = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.kind ? { kind: sp.kind } : {}),
    ...(sp.type ? { type: sp.type } : {}),
  };
  const printQuery = new URLSearchParams(filters).toString();

  const chipStyle = (on: boolean) =>
    on ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined;

  return (
    <Shell
      current="/customers"
      title="ข้อมูลลูกค้า / ผู้ขาย"
      sub={`${total.toLocaleString('en-US')} ราย`}
      actions={<PrintReport />}
    >
      <SubNav menu="customer" current={sp.kind === 'vendor' ? 'vendor' : 'customer'}>
      {/* แก้ไขผู้ติดต่อจากทะเบียน บันทึกแล้วกลับมาที่นี่พร้อมการ์ด */}
      <SavedNotice saved={sp.saved} savedId={sp.savedId} />
      <div className="card">
        <div className="toolbar">
          {/* ชิปกลุ่มเดียวกันต้องอยู่ใน .tag-row — ลูกตรงของ .toolbar บนมือถือยืดเต็มจอเรียงลงทีละปุ่ม */}
          <div className="tag-row">
            <span style={{ color: 'var(--line)' }}>|</span>
            {TYPE_TABS.map((t) => (
              <Link key={t.key || 'all'} className="chip"
                    href={{ pathname: '/customers', query: { ...(sp.q ? { q: sp.q } : {}), ...(sp.kind ? { kind: sp.kind } : {}), ...(t.key ? { type: t.key } : {}) } }}
                    style={chipStyle((sp.type ?? '') === t.key)}>
                {t.label}
              </Link>
            ))}
          </div>

          <div className="spacer" />

          <form autoComplete="off" action="/customers" method="get" style={{ display: 'flex', gap: 6 }}>
            {sp.kind ? <input type="hidden" name="kind" value={sp.kind} /> : null}
            {sp.type ? <input type="hidden" name="type" value={sp.type} /> : null}
            <input className="in search" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="กรอกคำค้นหา — ชื่อ รหัส เบอร์โทร หรือทะเบียนรถ" style={{ width: 250 }} />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
          <ColPicker cols={CUST_COLS} hidden={hidden} fixed={CUST_COLS_FIXED} action={saveCustColsAction}
                     title="ตั้งค่าการแสดงผลทะเบียนลูกค้า / ผู้ขาย" basicHint="พื้นฐาน: ซ่อน ที่อยู่ · เครดิต · ยอดสะสม" />
        </div>

        {rows.length === 0 ? (
          <div className="empty">ไม่พบผู้ติดต่อที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="tablewrap">
            {/* ตารางพอดีหน้า ตัวอักษร 14px (ผู้ใช้กำหนด): รหัส · ชื่อ(ที่เหลือ) · โทร · ทะเบียนรถ/เลขภาษี · เครดิต · ยอดสะสม · คงค้าง · ปุ่ม */}
            <table className="tbl hist fit cust">
              {/* คอลัมน์ตามการ์ดตั้งค่าการแสดงผล (ผู้ใช้กำหนด: ปกติซ่อน ที่อยู่ · เครดิต · ยอดสะสม) — ชื่อ 260px พอดีข้อมูลที่ 16px ยาวกว่าตัดบรรทัดในช่อง */}
              <colgroup>
                <col style={{ width: 92 }} />
                <col style={w('name', 260)} />
                {show('tel') ? <col style={{ width: 128 }} /> : null}
                {show('plate') ? <col style={w('plate', 180)} /> : null}
                {show('addr') ? <col /> : null}
                {show('credit') ? <col style={{ width: 64 }} /> : null}
                {show('spent') ? <col className="opt" style={{ width: 104 }} /> : null}
                {show('owe') ? <col style={{ width: 104 }} /> : null}
                <col style={{ width: 176 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>รหัส</th><th>ชื่อ</th>
                  {show('tel') ? <th>โทรศัพท์</th> : null}
                  {show('plate') ? <th>{sp.kind === 'vendor' ? 'เลขผู้เสียภาษี' : 'ทะเบียนรถ / ภาษี'}</th> : null}
                  {show('addr') ? <th>ที่อยู่</th> : null}
                  {show('credit') ? <th className="num">เครดิต</th> : null}
                  {show('spent') ? <th className="num opt">ยอดสะสม</th> : null}
                  {show('owe') ? <th className="num">คงค้าง</th> : null}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <RowLink key={c.id} href={`/customers/${c.id}`}>
                    <td className="mono"><b>{c.code}</b></td>
                    <td className="wrap c-name">
                      <b>{c.displayName || <span style={{ color: 'var(--ink-3)' }}>ไม่ระบุชื่อ</span>}</b>
                      <div className="subtle fs-12">
                        {c.type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}{c.email ? ` · ${c.email}` : ''}
                      </div>
                    </td>
                    {show('tel') ? <td className="mono">{c.tel || '-'}</td> : null}
                    {show('plate') ? (
                      /* ทะเบียนจริง (ผู้ใช้แจ้ง: หัวว่าทะเบียนแต่เดิมขึ้น "รถ n คัน") — 2 คันแรกบรรทัดเดียว ที่เหลือบอกจำนวน
                         ไม่ใช่ td.wrap และไม่ซ้อนคันละบรรทัด: จอ < 1280 ช่อง wrap ตัดบรรทัดที่ 160px รถ 3 คันแถวสูง 147px
                         (เกณฑ์ 140) — บรรทัดเดียวแล้วเลื่อนซ้ายขวาในกรอบตารางแบบคอลัมน์อื่น · ≥ 1280 ทุกช่องตัดบรรทัดตามกว้างคอลัมน์อยู่แล้ว */
                      <td className="mono" style={{ color: 'var(--ink-2)' }}>
                        {c.kind === 'customer' ? (
                          <>
                            <div>
                              {c.plates.length ? c.plates.slice(0, 2).join(' · ') : '-'}
                              {c.plates.length > 2 ? <span className="subtle fs-12"> · อีก {c.plates.length - 2} คัน</span> : null}
                            </div>
                            {c.taxId ? <div className="subtle fs-12">{c.taxId}</div> : null}
                          </>
                        ) : (c.taxId || '-')}
                      </td>
                    ) : null}
                    {show('addr') ? <td className="wrap subtle">{addrLineOf(c) || '-'}</td> : null}
                    {show('credit') ? <td className="num">{c.creditDays ? `${c.creditDays} วัน` : '-'}</td> : null}
                    {show('spent') ? <td className="num mono opt">{c.spent > 0.004 ? baht(c.spent) : '-'}</td> : null}
                    {show('owe') ? (
                      <td className={c.owe > 0.004 ? 'num mono due-text' : 'num mono muted-text'}>
                        {c.owe > 0.004 ? baht(c.owe) : '-'}
                      </td>
                    ) : null}
                    <td>
                      {/* ปุ่มสองบรรทัดแบบเดียวกับประวัติ: เปิดใบ(เขียว) แก้ไข(แดงอ่อน) / พิมพ์(เทา) เปิด(เทา) */}
                      <span className="row-acts grid2">
                        {c.kind === 'customer'
                          ? <Link className="btn sm act-pay" href={`/income/new?kind=QT&party=${c.id}`}>ใบเสนอราคา</Link>
                          : <Link className="btn sm act-pay" href={`/expense/new?kind=PO&party=${c.id}`}>ใบซื้อ</Link>}
                        <Link className="btn sm act-edit" href={`/customers/${c.id}`}>แก้ไข</Link>
                        <Link className="btn sm act-print" href={`/customers/print?q=${encodeURIComponent(c.code)}`}>พิมพ์</Link>
                        <Link className="btn sm act-print" href={`/customers/${c.id}`}>เปิด</Link>
                      </span>
                    </td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <PageSize base="/customers" size={pageSize} keep={filters} />
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={q({ page: page - 1 })}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={q({ page: page + 1 })}>ถัดไป</Link> : null}
        </div>
      </div>
      </SubNav>
    </Shell>
  );
}
