import Link from 'next/link';
import { notFound } from 'next/navigation';
import { today } from '@drivegolight/core';
import { query, requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getBillnote, openInvoices } from '@/lib/billnotes';
import { BillForm, type Party } from '../bill-form';
import { VoidBillnote } from '../void-billnote';
import { baht, thDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BillnotePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePerm('income');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';

  const data = await query(async (c) => {
    const note = isNew ? null : await getBillnote(c, id);
    if (!isNew && !note) return null;

    const keep = note?.docs.map((d) => d.id) ?? [];
    const open = await openInvoices(c, { includeDocIds: keep });
    return { note, open };
  });

  if (!isNew && !data) notFound();
  const { note, open } = data!;

  /* ลูกค้าที่มีใบค้าง — วางบิลได้เฉพาะรายเหล่านี้ */
  const byKey = new Map<string, Party>();
  for (const v of open) {
    if (v.inBillnoteNo && !note?.docs.some((d) => d.id === v.id)) continue;
    const key = v.partyId ?? `name:${v.partyName}`;
    const cur = byKey.get(key) ?? {
      key, partyId: v.partyId, name: v.partyName || 'ไม่ระบุชื่อ',
      taxId: '', addrText: '', count: 0, owed: 0,
    };
    cur.count += 1;
    cur.owed += v.outstanding;
    byKey.set(key, cur);
  }
  const parties = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));

  const voided = note?.note.status === 'void';

  return (
    <Shell
      doc
      current="/income"
      title={isNew ? 'ออกใบวางบิล' : `ใบวางบิล ${note!.note.no}`}
      sub={isNew ? 'รวมใบที่ยังค้างของลูกค้ารายเดียว' : `วันที่ ${thDate(note!.note.billDate)}`}
      actions={
        <div className="tag-row">
          {!isNew ? (
            <>
              <Link className="btn" href={`/income/billing/${id}/print`}>พิมพ์ใบวางบิล</Link>
              {/* ลูกค้าจ่ายตามใบวางบิลทีเดียว — พาไปหน้าลูกหนี้ที่กรองรายนี้ไว้แล้ว */}
              {!voided ? (
                <Link className="btn"
                      href={`/finance/ar?bulk=1&q=${encodeURIComponent(note!.note.partyName)}`}>
                  รับชำระตามใบวางบิลนี้
                </Link>
              ) : null}
            </>
          ) : null}
          <Link className="btn" href="/income/billing">← กลับรายการ</Link>
        </div>
      }
    >
      {sp.saved ? <div className="ok-msg" style={{ marginBottom: 16 }}>บันทึกเรียบร้อย</div> : null}

      {voided ? (
        <div className="err" style={{ marginBottom: 16 }}>
          ใบวางบิลนี้ถูกยกเลิกแล้ว{note!.note.voidedReason ? ` — ${note!.note.voidedReason}` : ''}
          <br />ใบแจ้งหนี้ที่เคยอยู่ในใบนี้กลับไปวางบิลใบใหม่ได้แล้ว
        </div>
      ) : null}

      <div className="note" style={{ marginBottom: 16 }}>
        เอกสารนี้ใช้แจ้งเก็บเงินเท่านั้น <b>ไม่ตั้งลูกหนี้ซ้ำและไม่นับเป็นรายได้</b> —
        เมื่อได้รับเงินแล้วให้ออกใบเสร็จรับเงินตามปกติ
      </div>

      {!voided ? (
        <div className="card">
          <header><h2>{isNew ? 'รายละเอียดใบวางบิล' : 'แก้ไขใบวางบิล'}</h2></header>
          <div className="body">
            <BillForm
              id={isNew ? undefined : id}
              no={note?.note.no}
              billDate={note?.note.billDate ?? today()}
              dueDate={note?.note.dueDate ?? ''}
              byWhom={note?.note.byWhom ?? ''}
              note={note?.note.note ?? ''}
              parties={parties}
              invoices={open}
              selected={note?.docs.map((d) => d.id) ?? []}
              initialPartyKey={
                note ? (note.note.partyId ?? `name:${note.note.partyName}`) : ''
              }
            />
          </div>
        </div>
      ) : (
        <div className="card">
          <header><h2>ใบที่เคยรวมไว้</h2></header>
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>เลขที่</th><th>วันที่</th><th className="num">ยอดเอกสาร</th></tr></thead>
              <tbody>
                {note!.docs.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.docNo}</td>
                    <td>{thDate(d.docDate)}</td>
                    <td className="num">{baht(d.payable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isNew && !voided ? <VoidBillnote id={id} no={note!.note.no} /> : null}
    </Shell>
  );
}
