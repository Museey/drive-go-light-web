'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { purgeTrashAction, restoreTrashAction, type TrashActionResult } from './actions';

/**
 * ปุ่มกู้คืน / ลบถาวร ของแต่ละแถวในถังขยะ
 *
 * ลบถาวรยืนยันสองชั้น: แผงยืนยัน แล้วต้องติ๊ก "เข้าใจแล้วว่ากู้คืนไม่ได้" ก่อนปุ่มจะกดได้
 * แผงแขวนที่ body ด้วย portal — ตารางอยู่ในกรอบที่เลื่อนแนวนอนได้ ซึ่ง Safari
 * ตัดภาพลูกที่เป็น position: fixed ตามกรอบนั้น (บั๊กเดียวกับแผงเมนูที่ menu-portal.test.ts กันไว้)
 */
export function TrashActions({ source, id, docNo, kindName, restorable, copyHref }: {
  source: 'doc' | 'billnote';
  id: string;
  docNo: string;
  kindName: string;
  /** ใบส่งมอบ ใบกำกับภาษี ใบเสร็จ กู้คืนไม่ได้ — ดู lib/trash-rules.ts */
  restorable: boolean;
  copyHref: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState('');

  const close = () => { setConfirming(false); setUnderstood(false); };

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const run = (fn: () => Promise<TrashActionResult>) => start(async () => {
    setError('');
    const r = await fn();
    if (r.error) { setError(r.error); return; }
    close();
    router.refresh();
  });

  return (
    <>
      <span className="row-acts">
        {restorable ? (
          <button className="btn sm act-pay" type="button" disabled={pending}
                  onClick={() => run(() => restoreTrashAction(source, id))}>
            กู้คืน
          </button>
        ) : copyHref ? (
          <Link className="btn sm" href={copyHref}
                title="เอกสารนี้อาจส่งให้ลูกค้าหรือยื่นภาษีไปแล้ว — ออกใบใหม่จากข้อมูลเดิมแทนการกู้คืน">
            คัดลอกเป็นใบใหม่
          </Link>
        ) : null}
        <button className="btn sm act-del" type="button" disabled={pending}
                onClick={() => { setError(''); setConfirming(true); }}>
          ลบถาวร
        </button>
      </span>
      {error && !confirming ? <div className="err" role="alert" style={{ marginTop: 4 }}>{error}</div> : null}

      {confirming ? createPortal(
        <>
          <button className="scrim" type="button" aria-label="ปิด" onClick={close} />
          <div className="confirm" role="dialog" aria-modal="true" aria-label={`ยืนยันลบ ${docNo} ถาวร`}>
            <header>
              <b>ลบถาวร — กู้คืนไม่ได้</b>
              <span className="subtle">{kindName} <span className="mono">{docNo}</span></span>
            </header>
            <div style={{ padding: '4px 16px 12px', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 10px' }}>
                เอกสาร <b className="mono">{docNo}</b> จะหายจากทุกหน้า รวมถึงถังขยะนี้ และ<b>กู้คืนไม่ได้อีก</b>
              </p>
              <p className="subtle" style={{ margin: '0 0 14px' }}>
                รายการในบัญชีสต๊อกและการเงินที่อ้างถึงใบนี้ยังเก็บไว้ ยอดย้อนหลังจึงไม่เปลี่ยน
              </p>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={understood} autoFocus
                       onChange={(e) => setUnderstood(e.target.checked)} />
                <span>เข้าใจแล้วว่าเอกสารนี้จะกู้คืนไม่ได้</span>
              </label>
              {error ? <div className="err" role="alert" style={{ marginTop: 10 }}>{error}</div> : null}
            </div>
            <div className="acts">
              <button className="btn act-del" type="button" disabled={!understood || pending}
                      onClick={() => run(() => purgeTrashAction(source, id, true))}>
                {pending ? 'กำลังลบ…' : 'ลบถาวร'}
              </button>
              <button className="btn" type="button" onClick={close}>ยกเลิก</button>
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}
