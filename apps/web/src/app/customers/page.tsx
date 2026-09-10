import Link from 'next/link';
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
      actions={
        <div className="tag-row">
          <Link className="btn" href={`/customers/print${printQuery ? `?${printQuery}` : ''}`}>พิมพ์รายชื่อ</Link>
          <Link className="btn primary" href="/customers/new">+ เพิ่มผู้ติดต่อ</Link>
        </div>
      }
    >
      <SubNav menu="customer" current={sp.kind === 'vendor' ? 'vendor' : 'customer'}>
      <div className="card">
        <div className="toolbar">
          {KIND_TABS.map((t) => (
            <Link key={t.key || 'all'} className="chip"
                  href={{ pathname: '/customers', query: { ...(sp.q ? { q: sp.q } : {}), ...(sp.type ? { type: sp.type } : {}), ...(t.key ? { kind: t.key } : {}) } }}
                  style={chipStyle((sp.kind ?? '') === t.key)}>
              {t.label}
            </Link>
          ))}
          <span style={{ color: 'var(--line)' }}>|</span>
          {TYPE_TABS.map((t) => (
            <Link key={t.key || 'all'} className="chip"
                  href={{ pathname: '/customers', query: { ...(sp.q ? { q: sp.q } : {}), ...(sp.kind ? { kind: sp.kind } : {}), ...(t.key ? { type: t.key } : {}) } }}
                  style={chipStyle((sp.type ?? '') === t.key)}>
              {t.label}
            </Link>
          ))}

          <div className="spacer" />

          <form action="/customers" method="get" style={{ display: 'flex', gap: 6 }}>
            {sp.kind ? <input type="hidden" name="kind" value={sp.kind} /> : null}
            {sp.type ? <input type="hidden" name="type" value={sp.type} /> : null}
            <input className="in" type="search" name="q" defaultValue={sp.q ?? ''}
                   placeholder="ชื่อ รหัส เบอร์โทร หรือทะเบียนรถ" style={{ width: 250 }} />
            <button className="btn" type="submit">ค้นหา</button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="empty">ไม่พบผู้ติดต่อที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>รหัส</th><th>ชื่อ</th><th>ประเภท</th><th>บันทึกเป็น</th>
                  <th>โทรศัพท์</th><th>อีเมล</th><th>เลขผู้เสียภาษี</th>
                  <th className="num">รถ</th><th className="num">เครดิต</th>
                  <th className="num">ยอดสะสม</th><th className="num">คงค้าง</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">
                      <Link href={`/customers/${c.id}`} style={{ textDecoration: 'underline' }}>{c.code}</Link>
                    </td>
                    <td className="wrap">{c.displayName || <span style={{ color: 'var(--ink-3)' }}>ไม่ระบุชื่อ</span>}</td>
                    <td>{c.type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</td>
                    <td>
                      <span className="chip">{c.kind === 'vendor' ? 'ผู้ขาย' : 'ลูกค้า'}</span>
                    </td>
                    <td className="mono">{c.tel || '-'}</td>
                    <td className="wrap" style={{ color: 'var(--ink-3)' }}>{c.email || '-'}</td>
                    <td className="mono" style={{ color: 'var(--ink-3)' }}>{c.taxId || '-'}</td>
                    <td className="num">{c.vehicleCount || '-'}</td>
                    <td className="num">{c.creditDays ? `${c.creditDays} วัน` : '-'}</td>
                    <td className="num mono">{c.spent > 0.004 ? baht(c.spent) : '-'}</td>
                    {/* คงค้างเป็นตัวเลขที่ต้องสะดุดตา เพราะเป็นเงินที่ยังตามไม่ได้ */}
                    <td className="num mono"
                        style={{ color: c.owe > 0.004 ? 'var(--due)' : 'var(--ink-3)' }}>
                      {c.owe > 0.004 ? baht(c.owe) : '-'}
                    </td>
                  </tr>
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
