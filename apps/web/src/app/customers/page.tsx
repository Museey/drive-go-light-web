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
  searchParams: Promise<{ q?: string; kind?: string; type?: string; page?: string; size?: string }>;
}) {
  await requireTab('customer', 'customer');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;

  const pageSize = pageSizeOf(sp.size);
  const { rows, total } = await listContacts({
    search: sp.q, kind: sp.kind, type: sp.type, page, pageSize,
  });
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

          <form action="/customers" method="get" style={{ display: 'flex', gap: 6 }}>
            {sp.kind ? <input type="hidden" name="kind" value={sp.kind} /> : null}
            {sp.type ? <input type="hidden" name="type" value={sp.type} /> : null}
            <input className="in search" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="กรอกคำค้นหา — ชื่อ รหัส เบอร์โทร หรือทะเบียนรถ" style={{ width: 250 }} />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="empty">ไม่พบผู้ติดต่อที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="tablewrap">
            {/* ตารางพอดีหน้า ตัวอักษร 14px (ผู้ใช้กำหนด): รหัส · ชื่อ(ที่เหลือ) · โทร · ทะเบียนรถ/เลขภาษี · เครดิต · ยอดสะสม · คงค้าง · ปุ่ม */}
            <table className="tbl hist fit cust">
              <colgroup>
                <col style={{ width: 92 }} /><col style={{ width: '24%' }} /><col style={{ width: 112 }} /><col style={{ width: 120 }} /><col />
                <col style={{ width: 60 }} /><col className="opt" style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 176 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>รหัส</th><th>ชื่อ</th><th>โทรศัพท์</th><th>{sp.kind === 'vendor' ? 'เลขผู้เสียภาษี' : 'ทะเบียนรถ / ภาษี'}</th><th>ที่อยู่</th>
                  <th className="num">เครดิต</th><th className="num opt">ยอดสะสม</th><th className="num">คงค้าง</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <RowLink key={c.id} href={`/customers/${c.id}`}>
                    <td className="mono"><b>{c.code}</b></td>
                    <td className="wrap">
                      <b>{c.displayName || <span style={{ color: 'var(--ink-3)' }}>ไม่ระบุชื่อ</span>}</b>
                      <div className="subtle fs-12">
                        {c.type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}{c.email ? ` · ${c.email}` : ''}
                      </div>
                    </td>
                    <td className="mono">{c.tel || '-'}</td>
                    <td className="mono" style={{ color: 'var(--ink-2)' }}>
                      {c.kind === 'customer' ? (c.vehicleCount ? `รถ ${c.vehicleCount} คัน` : '-') : (c.taxId || '-')}
                      {c.kind === 'customer' && c.taxId ? <div className="subtle fs-12">{c.taxId}</div> : null}
                    </td>
                    <td className="wrap subtle fs-13">{addrLineOf(c) || '-'}</td>
                    <td className="num">{c.creditDays ? `${c.creditDays} วัน` : '-'}</td>
                    <td className="num mono opt">{c.spent > 0.004 ? baht(c.spent) : '-'}</td>
                    <td className={c.owe > 0.004 ? 'num mono due-text' : 'num mono muted-text'}>
                      {c.owe > 0.004 ? baht(c.owe) : '-'}
                    </td>
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
