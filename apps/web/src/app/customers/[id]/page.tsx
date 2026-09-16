import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { today } from '@drivegolight/core';
import { isUuid } from '@/lib/ids';
import { safeBack } from '@/lib/saved-target';
import { SavedNotice } from '@/components/saved-notice';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { addrLineOf, getContact, getContactHistory, nextContactCode } from '@/lib/contacts';
import { contactDetailRows, contactHistoryCard, plateOf } from '@/lib/contact-card';
import { DocCards } from '@/components/doc-cards';
import { baht, KIND_SHORT, thDate } from '@/lib/format';
import { ContactForm } from '../contact-form';
import { DeleteContactButton } from '../delete-button';

export const dynamic = 'force-dynamic';

export default async function ContactPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; savedId?: string; error?: string; kind?: string;
    /** จอแคบ: เปิดฟอร์มแก้ไขแทนการ์ดอ่าน (เฟส 4) — เดสก์ท็อปเห็นฟอร์มเสมออยู่แล้ว */
    edit?: string;
  }>;
}) {
  await requireTab('customer', 'customer');
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (id !== 'new' && !isUuid(id)) notFound();
  const sp = await searchParams;
  const isNew = id === 'new';
  const defaultKind = sp.kind === 'vendor' ? 'vendor' : 'customer';
  /* แก้ไขผู้ติดต่อเดิม บันทึกแล้วกลับหน้าที่กดแก้ไขมา (ผู้ใช้กำหนด) · เพิ่มใหม่กลับฟอร์มเปล่า (ฝั่ง action) */
  const back = isNew ? undefined : (safeBack((await headers()).get('referer'), ['/customers']) ?? undefined);

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
    >
      <SavedNotice saved={sp.saved} savedId={sp.savedId} />
      {sp.error ? <div className="err" style={{ marginBottom: 16 }}>{sp.error}</div> : null}

      {/* จอต่ำกว่า 1280: เปิดมาเป็นการ์ดอ่านก่อน แล้วค่อยกดแก้ไข (ผู้ใช้เลือก · ต้นแบบ mCustomerDetail)
          ทุกก้อนเรนเดอร์เสมอแล้วสลับด้วย CSS — เดสก์ท็อปเห็นฟอร์ม ประวัติ และการ์ดลบ ลำดับเดิมทุกอย่าง
          ข้อผิดพลาดจากการบันทึกต้องเห็นฟอร์มทันที จึงนับเป็นโหมดแก้ไขด้วย */}
      <div className={isNew || sp.edit === '1' || sp.error ? 'cpanes editing' : 'cpanes'}>
      {contact ? (
        <Link className="mback" href={`/customers?kind=${contact.kind}`}>← กลับรายชื่อ</Link>
      ) : null}

      {contact && history ? (
        <div className="contact-read">
          <div className="mdetail">
            <div className="dh">
              <b>{contact.displayName || contact.code}</b>
              <span className={contact.kind === 'vendor' ? 'chip' : 'chip ok'}>
                {contact.kind === 'vendor' ? 'ผู้ขาย' : 'ลูกค้า'}
              </span>
            </div>
            {contactDetailRows({
              kind: contact.kind, code: contact.code, tel: contact.tel, tel2: contact.tel2,
              email: contact.email, taxId: contact.taxId, creditDays: contact.creditDays,
              note: contact.note, addrLine: addrLineOf(contact),
              plates: (contact.vehicles ?? []).map(plateOf),
            }).map((r) => (
              <div key={r.label} className="mkv"><span className="k">{r.label}</span><span className="v">{r.value}</span></div>
            ))}
          </div>

          {/* ตัวเลขสองใบคิดจากประวัติที่หน้านี้ดึงมาอยู่แล้ว — ไม่เพิ่มคิวรี */}
          <div className="mstat-grid">
            <div className="mstat">
              <span className="lbl">📄 จำนวนเอกสาร</span>
              <span className="val">{history.docs.length.toLocaleString('en-US')} <small>ใบ</small></span>
            </div>
            <div className="mstat">
              <span className="lbl">💰 ยอดคงค้าง</span>
              <span className={history.totalOutstanding > 0.004 ? 'val due' : 'val ok'}>
                {baht(history.totalOutstanding)} <small>บาท</small>
              </span>
            </div>
          </div>

          <div className="mdet-acts">
            <Link className="btn primary" href={`/customers/${contact.id}?edit=1`}>✎ แก้ไขข้อมูลผู้ติดต่อ</Link>
          </div>
        </div>
      ) : null}

      <div className="card contact-edit">
        <header><h2>{isNew ? 'ข้อมูลผู้ติดต่อ' : 'แก้ไขข้อมูลผู้ติดต่อ'}</h2></header>
        <div className="body">
          {/* key = ใบบันทึกล่าสุด — เพิ่มรายถัดไปติดกัน ฟอร์มต้องเริ่มใหม่ ไม่ค้างค่าที่พิมพ์ของรายก่อน */}
          <ContactForm key={`${id}:${sp.savedId ?? ''}`} contact={contact} defaultCode={defaultCode} defaultKind={defaultKind} returnTo={back} />
        </div>
      </div>

      {contact && history ? (
        <>
          <div className="card contact-view">
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
              <>
              {/* จอแคบเป็นการ์ดเอกสารของเฟส 2 · เดสก์ท็อปและตอนพิมพ์เป็นตารางเดิม */}
              <DocCards title="เอกสารของผู้ติดต่อ"
                        cards={history.docs.map((d) => contactHistoryCard(d, contact.displayName || contact.code, today()))} />
              <div className="tablewrap doc-table">
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
              </>
            )}
          </div>

          <div className="card contact-edit">
            <header><h2>ลบผู้ติดต่อ</h2></header>
            <div className="body">
              {history.docs.length > 0 ? (
                <p className="subtle" style={{ margin: 0 }}>
                  ลบไม่ได้เพราะมีเอกสารอ้างถึงอยู่ {history.docs.length} ฉบับ —
                  ประวัติซื้อขายและยอดค้างชำระจะหายไปด้วย
                </p>
              ) : (
                <DeleteContactButton id={contact.id} kind={contact.kind}
                                     name={contact.displayName || contact.code} />
              )}
            </div>
          </div>
        </>
      ) : null}
      </div>
    </Shell>
  );
}
