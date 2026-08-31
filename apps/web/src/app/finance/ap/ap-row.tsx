'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EXPENSE_CATS } from '@drivegolight/core';
import { PayForm } from '../pay-form';
import type { PayableRow } from '@/lib/receivables';
import { baht, thDate } from '@/lib/format';

const CAT = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c.label]));

export function ApRow({ row }: { row: PayableRow }) {
  const [open, setOpen] = useState(false);
  const late = row.daysOverdue > 0;

  return (
    <>
      <tr>
        <td className="mono">
          <Link href={`/expense/${row.id}`} style={{ textDecoration: 'underline' }}>{row.docNo}</Link>
        </td>
        <td>{row.kind === 'PO' ? 'ใบซื้อ' : CAT[row.expenseCat ?? ''] ?? 'ค่าใช้จ่าย'}</td>
        <td className="wrap">{row.partyName || '-'}</td>
        <td className="mono subtle">{row.refDocNo || '-'}</td>
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
            {open ? 'ปิด' : 'จ่ายชำระ'}
          </button>
        </td>
      </tr>

      {open ? (
        <tr>
          <td colSpan={10} style={{ background: 'var(--bg)' }}>
            <PayForm docId={row.id} docNo={row.docNo} outstanding={row.outstanding} compact direction="buy" />
          </td>
        </tr>
      ) : null}
    </>
  );
}
