import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bahttext } from '@drivegolight/core';
import { BankLine } from '@/components/bank-line';
import { query, requireTab } from '@/lib/auth';
import { getBillnote } from '@/lib/billnotes';
import { getShop } from '@/lib/queries';
import { PrintButton } from '../../../[id]/print/print-button';
import { baht, KIND_SHORT, thDate, thDateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BillnotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('income', 'billing');
  const { id } = await params;

  const [data, shop] = await Promise.all([
    query((c) => getBillnote(c, id)),
    getShop(),
  ]);
  if (!data) notFound();

  const { note, docs } = data;
  const blankRows = Math.max(0, 8 - docs.length);

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={`/income/billing/${id}`}>← กลับใบวางบิล</Link>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          เอกสารแจ้งเก็บเงิน ไม่ใช่ใบกำกับภาษี — ยอดคิดจากที่ค้างอยู่ ณ วันที่พิมพ์
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        <div className="paper">
          <div className="doc-head">
            <div className="co">
              <b>{shop.name}</b>
              <div>{shop.addrText || ''}</div>
              <div>
                โทร. {shop.tel || '-'}{shop.tel2 ? ` / ${shop.tel2}` : ''}
                {shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${shop.taxId}` : ''}
              </div>
            </div>
            <div className="doc-meta">
              <h1>ใบวางบิล</h1>
              <div style={{ fontSize: 11, letterSpacing: '.08em' }}>BILLING NOTE</div>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  <tr><td>เลขที่</td><td style={{ textAlign: 'right' }}><b>{note.no}</b></td></tr>
                  <tr><td>วันที่วางบิล</td><td style={{ textAlign: 'right' }}>{thDateLong(note.billDate)}</td></tr>
                  {note.dueDate ? (
                    <tr>
                      <td>นัดรับเงิน</td>
                      <td style={{ textAlign: 'right' }}><b>{thDateLong(note.dueDate)}</b></td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="box">
            <h4>วางบิลถึง</h4>
            <div className="kv"><b>ชื่อ:</b><span>{note.partyName || '-'}</span></div>
            {note.partyAddrText ? (
              <div className="kv"><b>ที่อยู่:</b><span>{note.partyAddrText}</span></div>
            ) : null}
            {note.partyTaxId ? (
              <div className="kv">
                <b>เลขประจำตัวผู้เสียภาษี:</b><span>{note.partyTaxId}</span>
              </div>
            ) : null}
          </div>

          <table className="doc">
            <thead>
              <tr>
                <th style={{ width: 34 }}>ลำดับ</th>
                <th style={{ width: 150 }}>เลขที่เอกสาร</th>
                <th style={{ width: 106 }}>วันที่</th>
                <th style={{ width: 112 }}>ครบกำหนด</th>
                <th>รายละเอียด</th>
                <th style={{ width: 110 }}>ยอดค้างชำระ</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td>{d.docNo}</td>
                  <td>{thDate(d.docDate)}</td>
                  <td>{thDate(d.dueDate)}</td>
                  <td>{KIND_SHORT[d.kind] ?? d.kind}</td>
                  <td style={{ textAlign: 'right' }}>{baht(d.outstanding)}</td>
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr key={`b-${i}`}>
                  <td className="blank">&nbsp;</td><td /><td /><td /><td /><td />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', background: '#EDEFF1' }}>
                  <b>รวมยอดที่ขอเก็บ ({docs.length} ฉบับ)</b>
                </td>
                <td style={{ textAlign: 'right', background: '#EDEFF1' }}>
                  <b>{baht(note.total)}</b>
                </td>
              </tr>
            </tfoot>
          </table>

          <div style={{ fontSize: 11.5, marginTop: 6 }}>
            จำนวนเงิน (ตัวอักษร) <b>{bahttext(note.total)}</b>
          </div>

          {/* ใบวางบิลคือใบที่ส่งไปให้แผนกการเงินของลูกค้าโอนเงิน
              ขาดเลขบัญชีแล้วเขาต้องโทรกลับมาถาม */}
          <BankLine shop={shop} />

          {note.note ? (
            <div className="box">
              <h4>หมายเหตุ</h4>
              <div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{note.note}</div>
            </div>
          ) : null}

          <div className="box">
            <div style={{ fontSize: 10.5, color: '#555', lineHeight: 1.7 }}>
              เอกสารนี้เป็นใบวางบิลสำหรับแจ้งเก็บเงินเท่านั้น ไม่ใช่ใบกำกับภาษีและไม่ใช่ใบเสร็จรับเงิน
              เมื่อชำระเงินแล้วทางร้านจะออกใบเสร็จรับเงินให้ตามปกติ
            </div>
          </div>

          <div className="sign">
            <div>
              <div className="line" />ผู้วางบิล
              <br /><span style={{ fontSize: 11 }}>( {note.byWhom || '................................................'} )</span>
            </div>
            <div>
              <div className="line" />ผู้รับวางบิล
              <br /><span style={{ fontSize: 11 }}>( ................................................ )</span>
            </div>
          </div>

          <div className="brandfoot">
            <span>จัดทำด้วยโปรแกรม DriveGoLight!</span>
            <span>www.drivebizbegin.com</span>
          </div>
        </div>
      </div>
    </>
  );
}
