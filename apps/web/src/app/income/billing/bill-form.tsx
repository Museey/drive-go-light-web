'use client';

import Link from 'next/link';

import { useActionState, useMemo, useState, useEffect } from 'react';
import { ConfirmSave } from '@/components/confirm-save';
import { saveBillnoteAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { OpenInvoice } from '@/lib/billnotes';

/**
 * ฟอร์มออกและแก้ใบวางบิล
 *
 * เลือกลูกค้าจากรายการที่มีใบค้างเท่านั้น — วางบิลลูกค้าที่ไม่ค้างอะไรไม่มีความหมาย
 * ยอดรวมคิดสดจากใบที่ติ๊กไว้ ไม่ใช่ค่าที่แช่ไว้ ผู้ใช้จึงเห็นยอดที่จะแจ้งจริงก่อนกดบันทึก
 */

const baht = (v: number) =>
  v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const thDate = (iso: string | null) => {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${Number(y) + 543}`;
};


export interface Party {
  key: string;
  partyId: string | null;
  name: string;
  taxId: string;
  addrText: string;
  count: number;
  owed: number;
}

export function BillForm({
  id, no, billDate, dueDate, byWhom, note, parties, invoices, selected, initialPartyKey, readOnly, returnTo,
}: {
  /** บันทึกแล้วกลับหน้าเดิมพร้อมปุ่มพิมพ์ */
  returnTo?: string;
  id?: string;
  no?: string;
  billDate: string;
  dueDate: string;
  byWhom: string;
  note: string;
  /** ลูกค้าที่มีใบค้าง — วางบิลได้เฉพาะรายเหล่านี้ */
  parties: Party[];
  /** ใบค้างทั้งหมด รวมใบที่ถูกเลือกไว้แล้วแม้จะจ่ายครบไปแล้ว */
  invoices: OpenInvoice[];
  selected: string[];
  initialPartyKey: string;
  readOnly?: boolean;
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveBillnoteAction, {});
  const [partyKey, setPartyKey] = useState(initialPartyKey);
  const [picked, setPicked] = useState<string[]>(selected);
  const [confirm, setConfirm] = useState(false);
  const [printAfter, setPrintAfter] = useState(false);
  useEffect(() => { if (state.error) setConfirm(false); }, [state]);

  const party = parties.find((p) => p.key === partyKey) ?? null;

  /* ใบของลูกค้าที่เลือก บวกใบที่ติ๊กไว้แล้วซึ่งอาจจ่ายครบไปแล้ว */
  const pool = useMemo(
    () => invoices.filter((v) => {
      const key = v.partyId ?? `name:${v.partyName}`;
      return key === partyKey || picked.includes(v.id);
    }),
    [invoices, partyKey, picked],
  );

  const total = pool
    .filter((v) => picked.includes(v.id))
    .reduce((s, v) => s + v.outstanding, 0);

  const toggle = (docId: string) =>
    setPicked((cur) => cur.includes(docId) ? cur.filter((x) => x !== docId) : [...cur, docId]);

  if (readOnly) return null;

  return (
    <form className="form" action={action}
          onKeyDown={(e) => { const el = e.target as HTMLElement; if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault(); }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <input type="hidden" name="partyId" value={party?.partyId ?? ''} />
      <input type="hidden" name="partyName" value={party?.name ?? ''} />
      <input type="hidden" name="partyTaxId" value={party?.taxId ?? ''} />
      <input type="hidden" name="partyAddrText" value={party?.addrText ?? ''} />
      {picked.map((d) => <input key={d} type="hidden" name="doc" value={d} />)}

      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="row-fields f3">
        <div className="field">
          <label htmlFor="partyKey">ลูกค้าที่วางบิล *</label>
          <select className="in" id="partyKey" value={partyKey}
                  onChange={(e) => { setPartyKey(e.target.value); setPicked([]); }}>
            <option value="">— เลือกลูกค้าที่มีใบค้าง —</option>
            {parties.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} — ค้าง {p.count} ใบ · {baht(p.owed)}
              </option>
            ))}
          </select>
          <span className="hint">
            {parties.length === 0
              ? 'ยังไม่มีลูกค้าที่ค้างชำระ'
              : party ? `เลือกแล้ว — มีใบค้าง ${party.count} ใบ`
                      : `ลูกค้าที่มีใบค้างทั้งหมด ${parties.length} ราย`}
          </span>
        </div>
        <div className="field">
          <label htmlFor="billDate">วันที่วางบิล</label>
          <input className="in mono" id="billDate" name="billDate" type="date"
                 defaultValue={billDate} required />
        </div>
        <div className="field">
          <label htmlFor="dueDate">นัดรับเงิน</label>
          <input className="in mono" id="dueDate" name="dueDate" type="date" defaultValue={dueDate} />
        </div>
      </div>

      <div className="row-fields f2">
        <div className="field">
          <label htmlFor="byWhom">ผู้วางบิล</label>
          <input className="in" id="byWhom" name="byWhom" defaultValue={byWhom}
                 placeholder="ชื่อผู้นำเอกสารไปวางบิล" />
        </div>
        <div className="field">
          <label htmlFor="note">หมายเหตุ</label>
          <input className="in" id="note" name="note" defaultValue={note}
                 placeholder="เช่น รับเช็คทุกวันศุกร์ 9:00–12:00 น. ที่แผนกการเงิน" />
        </div>
      </div>

      {!party ? (
        <div className="hint" style={{ padding: '14px 4px' }}>
          เลือกลูกค้าก่อน แล้วรายการใบค้างชำระจะแสดงที่นี่
        </div>
      ) : (
        <div className="tablewrap" style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>เลขที่</th><th>วันที่</th><th>ครบกำหนด</th>
                <th className="num">ยอดเอกสาร</th><th className="num">ค้างชำระ</th>
              </tr>
            </thead>
            <tbody>
              {pool.length === 0 ? (
                <tr><td colSpan={6} className="empty">ลูกค้ารายนี้ไม่มีใบค้างชำระ</td></tr>
              ) : pool.map((v) => {
                const taken = v.inBillnoteNo && !selected.includes(v.id);
                return (
                  <tr key={v.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={picked.includes(v.id)}
                             disabled={!!taken}
                             onChange={() => toggle(v.id)} />
                    </td>
                    <td className="mono">
                      {v.docNo}
                      {taken ? (
                        <span className="chip warn" style={{ marginLeft: 6 }}
                              title={`อยู่ในใบวางบิล ${v.inBillnoteNo}`}>
                          {v.inBillnoteNo}
                        </span>
                      ) : null}
                    </td>
                    <td>{thDate(v.docDate)}</td>
                    <td>{thDate(v.dueDate)}</td>
                    <td className="num">{baht(v.payable)}</td>
                    <td className="num" style={{ color: v.outstanding > 0.004 ? 'var(--warn)' : 'var(--ok)' }}>
                      {baht(v.outstanding)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 600 }}>
                  รวมยอดวางบิล ({picked.length} ใบ)
                </td>
                <td className="num" style={{ fontWeight: 700 }}>{baht(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="formbar">
        <button className="btn primary" type="button" onClick={() => { setPrintAfter(false); setConfirm(true); }}>บันทึกใบวางบิล</button>
        {id ? <Link className="btn amber" href={`/income/billing/${id}/print`} target="_blank" rel="noreferrer">🖨 พิมพ์เอกสาร</Link>
          : <button className="btn amber" type="button" onClick={() => { setPrintAfter(true); setConfirm(true); }}>🖨 พิมพ์เอกสาร</button>}
        {printAfter ? <input type="hidden" name="printAfter" value="1" /> : null}
        {no ? <span className="subtle">เลขที่ {no}</span> : null}
      </div>

      <ConfirmSave open={confirm} title="ใบวางบิล" onEdit={() => setConfirm(false)}
                   lines={[
                     { label: 'ใบที่เลือก', value: `${picked.length} ใบ` },
                     { label: 'ยอดรวม', value: baht(total) },
                   ]} />
    </form>
  );
}
