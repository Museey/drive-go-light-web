import Link from 'next/link';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { listContacts } from '@/lib/contacts';

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
  searchParams: Promise<{ q?: string; kind?: string; type?: string; page?: string }>;
}) {
  await requirePerm('customer');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;

  const { rows, total } = await listContacts({
    search: sp.q, kind: sp.kind, type: sp.type, page,
  });
  const lastPage = Math.max(1, Math.ceil(total / 40));

  const q = (patch: Record<string, string | number>) => ({
    pathname: '/customers',
    query: {
      ...(sp.q ? { q: sp.q } : {}),
      ...(sp.kind ? { kind: sp.kind } : {}),
      ...(sp.type ? { type: sp.type } : {}),
      ...patch,
    },
  });

  const chipStyle = (on: boolean) =>
    on ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined;

  return (
    <Shell
      current="/customers"
      title="ข้อมูลลูกค้า / ผู้ขาย"
      sub={`${total.toLocaleString('en-US')} ราย`}
      actions={<Link className="btn primary" href="/customers/new">+ เพิ่มผู้ติดต่อ</Link>}
    >
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
                  <th>โทรศัพท์</th><th>เลขผู้เสียภาษี</th><th className="num">รถ</th><th className="num">เครดิต</th>
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
                    <td className="mono" style={{ color: 'var(--ink-3)' }}>{c.taxId || '-'}</td>
                    <td className="num">{c.vehicleCount || '-'}</td>
                    <td className="num">{c.creditDays ? `${c.creditDays} วัน` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={q({ page: page - 1 })}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={q({ page: page + 1 })}>ถัดไป</Link> : null}
        </div>
      </div>
    </Shell>
  );
}
