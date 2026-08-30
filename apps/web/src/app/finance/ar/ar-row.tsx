'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PayForm } from '../pay-form';
import type { ReceivableRow } from '@/lib/receivables';
import { baht, KIND_SHORT, thDate } from '@/lib/format';

export function ArRow({ row }: { row: ReceivableRow }) {
  const [open, setOpen] = useState(false);
  const late = row.daysOverdue > 0;

  return (
    <>
      <tr>
        <td className="mono">
          <Link href={`/income/${row.id}`} style={{ textDecoration: 'underline' }}>{row.docNo}</Link>
        </td>
        <td>{KIND_SHORT[row.kind] ?? row.kind}</td>
        <td className="wrap">{row.partyName || '-'}</td>
        <td className="mono">{row.vehiclePlate || '-'}</td>
        <td>{thDate(row.docDate)}</td>
        <td>
          {thDate(row.dueDate)}
          {late ? <span className="chip due" style={{ marginLeft: 6 }}>เกิน {row.daysOverdue} วัน</span> : null}
        </td>
        <td className="num">{baht(row.payable)}</td>
        <td className="num">{row.paid > 0.004 ? baht(row.paid) : '-'}</td>
        <td className="num" style={{ fontWeight: 600, color: late ? 'var(--due)' : undefined }}>
          {baht(row.outstanding)}
        </td>
        <td>
          <button className="btn" type="button" onClick={() => setOpen(!open)}>
            {open ? 'ปิด' : 'รับชำระ'}
          </button>
        </td>
      </tr>

      {open ? (
        <tr>
          <td colSpan={10} style={{ background: 'var(--bg)' }}>
            <PayForm docId={row.id} docNo={row.docNo} outstanding={row.outstanding} compact />
          </td>
        </tr>
      ) : null}
    </>
  );
}
