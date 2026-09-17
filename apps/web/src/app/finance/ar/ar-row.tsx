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
          {/* ชิปลงบรรทัดใต้วันที่ — ต่อท้ายในบรรทัดเดียวทำให้ช่องกว้าง 194px ตารางเจ้าหนี้ล้นกรอบที่จอ 1280
              ปุ่ม รับชำระ ท้ายแถวโดนตัด (ผู้ใช้แจ้ง 17 ก.ย. 2569) · ลูกหนี้ใช้แบบเดียวกัน */}
          {late ? <span className="chip due under">เกิน {row.daysOverdue} วัน</span> : null}
        </td>
        <td className="num">{baht(row.payable)}</td>
        <td className="num">{row.paid > 0.004 ? baht(row.paid) : '-'}</td>
        <td className="num" style={{ fontWeight: 600, color: late ? 'var(--due)' : undefined }}>
          {baht(row.outstanding)}
        </td>
        <td>
          {/* ปุ่มรับชำระสีเขียว (ผู้ใช้กำหนด) — ตอนเปิดฟอร์มอยู่เป็น "ปิด" สีปกติ */}
          <button className={open ? 'btn' : 'btn ok'} type="button" onClick={() => setOpen(!open)}>
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
