'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCountAction, saveCountHeadAction } from './actions';
import type { StockCount } from '@/lib/stock-counts';

/** หัวใบ — วันที่ หมายเหตุ และปุ่มลบร่าง */
export function CountHead({ count }: { count: StockCount }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState('');
  const [date, setDate] = useState(count.countDate);
  const [note, setNote] = useState(count.note);
  const [confirming, setConfirming] = useState(false);

  const save = () => start(async () => {
    const r = await saveCountHeadAction(count.id, date, note);
    if (r.error) setErr(r.error);
    router.refresh();
  });

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="body">
        {err ? <div className="err">{err}</div> : null}
        <div className="row-fields f4">
          <div className="field">
            <label htmlFor="ctNo">เลขที่ใบตรวจนับ</label>
            <input className="in mono" id="ctNo" value={count.no} disabled />
          </div>
          <div className="field">
            <label htmlFor="ctDate">วันที่ตรวจนับ</label>
            <input className="in mono" id="ctDate" type="date" value={date} disabled={count.applied}
                   onChange={(e) => setDate(e.target.value)} onBlur={save} />
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="ctNote">หมายเหตุ</label>
            <input className="in" id="ctNote" value={note} disabled={count.applied}
                   onChange={(e) => setNote(e.target.value)} onBlur={save}
                   placeholder="เช่น ตรวจนับประจำเดือนสิงหาคม ชั้น A–C โดยช่างใหญ่" />
          </div>
        </div>

        {!count.applied ? (
          confirming ? (
            <div className="err" style={{ marginTop: 12 }}>
              ลบใบร่าง {count.no} ทิ้ง? ใบนี้ยังไม่ได้แตะสต๊อกเลย จึงลบได้โดยไม่มีผลอะไร
              <div className="tag-row" style={{ marginTop: 8 }}>
                <button className="btn danger" type="button" disabled={busy}
                        onClick={() => start(async () => {
                          const r = await deleteCountAction(count.id);
                          if (r?.error) { setErr(r.error); setConfirming(false); }
                        })}>
                  {busy ? 'กำลังลบ…' : 'ยืนยันลบ'}
                </button>
                <button className="btn" type="button"
                        onClick={() => setConfirming(false)}>ไม่ลบแล้ว</button>
              </div>
            </div>
          ) : (
            <div className="tag-row" style={{ marginTop: 12 }}>
              <button className="btn danger" type="button"
                      onClick={() => setConfirming(true)}>ลบใบร่างนี้</button>
              <span className="subtle">ลบได้เฉพาะร่าง — ใบที่ปรับยอดแล้วต้องอยู่เป็นหลักฐาน</span>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
