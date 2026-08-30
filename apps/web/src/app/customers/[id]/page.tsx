import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getContact, getContactHistory, nextContactCode } from '@/lib/contacts';
import { baht, KIND_SHORT, thDate } from '@/lib/format';
import { ContactForm } from '../contact-form';
import { DeleteContactButton } from '../delete-button';

export const dynamic = 'force-dynamic';

export default async function ContactPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; kind?: string }>;
}) {
  await requirePerm('customer');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';
  const defaultKind = sp.kind === 'vendor' ? 'vendor' : 'customer';

  const contact = isNew ? null : await getContact(id);
  if (!isNew && !contact) notFound();

  const [defaultCode, history] = await Promise.all([
    isNew ? nextContactCode(defaultKind) : Promise.resolve(''),
    contact ? getContactHistory(contact.id) : Promise.resolve(null),
  ]);

  return (
    <Shell
      current="/customers"
      title={isNew ? 'เพิ่มผู้ติดต่อใหม่' : contact!.displayName || contact!.code}
      sub={isNew ? undefined : `${contact!.code} · ${contact!.kind === 'vendor' ? 'ผู้ขาย' : 'ลูกค้า'}`}
      actions={<Link className="btn" href="/customers">← กลับทะเบียน</Link>}
    >
      {sp.saved ? <div className="ok-msg" style={{ marginBottom: 16 }}>บันทึกเรียบร้อย</div> : null}
      {sp.error ? <div className="err" style={{ marginBottom: 16 }}>{sp.error}</div> : null}

      <div className="card">
        <header><h2>{isNew ? 'ข้อมูลผู้ติดต่อ' : 'แก้ไขข้อมูลผู้ติดต่อ'}</h2></header>
        <div className="body">
          <ContactForm contact={contact} defaultCode={defaultCode} defaultKind={defaultKind} />
        </div>
      </div>

      {contact && history ? (
        <>
          <div className="card">
            <header>
              <h2>ประวัติซื้อขาย</h2>
              <div className="spacer" />
              <span className="subtle">
                รวม {baht(history.totalAmount)} บาท
                {history.totalOutstanding > 0.004 ? ` · ค้าง ${baht(history.totalOutstanding)} บาท` : ''}
                {history.lastDocDate ? ` · ล่าสุด ${thDate(history.lastDocDate)}` : ''}
              </span>
            </header>
            {history.docs.length === 0 ? (
              <div className="empty">ยังไม่มีเอกสารกับผู้ติดต่อรายนี้</div>
            ) : (
              <div className="tablewrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>เลขที่</th><th>ชนิด</th><th>วันที่</th>
                      <th className="num">ยอด</th><th className="num">ชำระแล้ว</th><th className="num">คงค้าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.docs.map((d) => (
                      <tr key={d.id}>
                        <td className="mono">
                          <Link href={`/income/${d.id}`} style={{ textDecoration: 'underline' }}>{d.docNo}</Link>
                        </td>
                        <td>{KIND_SHORT[d.kind] ?? d.kind}</td>
                        <td>{thDate(d.docDate)}</td>
                        <td className="num">{baht(d.payable)}</td>
                        <td className="num">{baht(d.paid)}</td>
                        <td className="num" style={{ color: d.outstanding > 0.004 ? 'var(--due)' : undefined }}>
                          {d.outstanding > 0.004 ? baht(d.outstanding) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <header><h2>ลบผู้ติดต่อ</h2></header>
            <div className="body">
              {history.docs.length > 0 ? (
                <p className="subtle" style={{ margin: 0 }}>
                  ลบไม่ได้เพราะมีเอกสารอ้างถึงอยู่ {history.docs.length} ฉบับ —
                  ประวัติซื้อขายและยอดค้างชำระจะหายไปด้วย
                </p>
              ) : (
                <DeleteContactButton id={contact.id} name={contact.displayName || contact.code} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </Shell>
  );
}
