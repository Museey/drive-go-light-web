'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addCountItemsAction, applyCountAction, removeCountItemAction, saveCountHeadAction,
  scanAction, searchCountPartsAction, setCountedAction,
} from './actions';
import type { StockCount } from '@/lib/stock-counts';
import { baht } from '@/lib/format';

/**
 * ฟอร์มกรอกใบตรวจนับ
 *
 * ช่องยิงบาร์โค้ดอยู่บนสุดและโฟกัสค้างไว้เสมอ — คนที่ถือปืนยิงอยู่หน้าชั้นวาง
 * ไม่ได้จ้องจอ ต้องยิงต่อเนื่องได้โดยไม่ต้องเอามือมาคลิกช่องใหม่ทุกครั้ง
 *
 * ตัวที่เพิ่งยิงเด้งขึ้นแถวบนสุด ตามรุ่น 6.4 ที่เขียนเหตุผลไว้ว่า
 * "จะได้เห็นทันทีไม่ต้องเลื่อนหา"
 */

const fmtQty = (v: number) => String(Math.round(v * 1000) / 1000);

export function CountEditor({ count }: { count: StockCount }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [scanTerm, setScanTerm] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const [partQuery, setPartQuery] = useState('');
  const [partHits, setPartHits] = useState<
    Awaited<ReturnType<typeof searchCountPartsAction>> | null
  >(null);

  /* ช่องกรอกจำนวนเก็บเป็นข้อความ เพราะ "" กับ "0" ต่างกัน */
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});

  useEffect(() => { scanRef.current?.focus(); }, [count.items.length]);

  const ro = count.applied;

  const scan = (term: string) => start(async () => {
    setErr(''); setMsg('');
    const r = await scanAction(count.id, term);
    if (r.error) { setErr(r.error); return; }
    const res = r.result!;
    if (res.kind === 'none') setErr(`ไม่พบสินค้าที่ตรงกับ "${res.term}"`);
    else if (res.kind === 'many') {
      setErr(`"${res.term}" ตรงกับสินค้า ${res.count} รายการ — พิมพ์ให้เจาะจงกว่านี้`);
    } else {
      setLastId(res.item.id);
      setMsg(res.kind === 'added'
        ? `เพิ่ม ${res.item.code} ${res.item.name} · นับ 1 ${res.item.unit}`
        : `${res.item.code} ${res.item.name} · นับ ${fmtQty(res.item.countedQty ?? 0)} ${res.item.unit}`);
    }
    setScanTerm('');
    router.refresh();
    scanRef.current?.focus();
  });

  const saveQty = (itemId: string, raw: string) => start(async () => {
    const r = await setCountedAction(itemId, raw);
    if (r.error) setErr(r.error);
    router.refresh();
  });

  /* ตัวที่เพิ่งยิงขึ้นก่อน แล้วที่เหลือตามลำดับเดิม */
  const items = lastId
    ? [...count.items].sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : 0))
    : count.items;

  return (
    <>
      {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}
      {msg ? <div className="ok-msg" style={{ marginBottom: 12 }}>{msg}</div> : null}

      {!ro ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="body">
            <div className="row-fields f3">
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="scan">ยิงบาร์โค้ดเข้าใบตรวจนับ</label>
                <input className="in mono" id="scan" ref={scanRef} autoComplete="off"
                       value={scanTerm} disabled={busy}
                       onChange={(e) => setScanTerm(e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key !== 'Enter') return;
                         e.preventDefault();
                         if (scanTerm.trim()) scan(scanTerm);
                       }}
                       placeholder="ยิงบาร์โค้ด หรือพิมพ์รหัสสินค้า แล้วกด Enter" />
              </div>
              <div className="field">
                <span className="hint" style={{ lineHeight: 1.65 }}>
                  ต่อปืนยิงบาร์โค้ดแล้วยิงต่อเนื่องได้เลย รายการจะขึ้น<b>แถวบนสุด</b>ทันที
                  <br /><b>ยิงซ้ำตัวเดิม = นับเพิ่มทีละ 1</b> · พิมพ์รหัสหรือ OEM ก็ได้
                </span>
              </div>
            </div>

            <div className="row-fields f2" style={{ marginTop: 4 }}>
              <div className="field">
                <label htmlFor="pq">หรือดึงสินค้ามาตรวจนับทีละหลายตัว</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="in" id="pq" value={partQuery}
                         onChange={(e) => setPartQuery(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                         placeholder="รหัส ชื่อ หรือหมวด" />
                  <button className="btn" type="button" disabled={busy}
                          onClick={() => start(async () => {
                            setPartHits(await searchCountPartsAction(partQuery));
                          })}>ค้นหา</button>
                </div>
              </div>
            </div>

            {partHits ? (
              <div className="tablewrap" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                <table className="tbl">
                  <tbody>
                    {partHits.length === 0 ? (
                      <tr><td className="subtle">ไม่พบสินค้า</td></tr>
                    ) : (
                      <>
                        <tr>
                          <td colSpan={4}>
                            <button className="btn primary" type="button" disabled={busy}
                                    onClick={() => start(async () => {
                                      const r = await addCountItemsAction(
                                        count.id, partHits.map((p) => p.id));
                                      if (r.error) setErr(r.error);
                                      setPartHits(null);
                                      router.refresh();
                                    })}>
                              + ดึงทั้ง {partHits.length} รายการเข้าใบ
                            </button>
                          </td>
                        </tr>
                        {partHits.map((p) => (
                          <tr key={p.id}>
                            <td className="mono">{p.code}</td>
                            <td className="wrap">{p.name}</td>
                            <td className="num">คงเหลือ {p.qtyOnHand}</td>
                            <td>
                              <button className="btn" type="button" disabled={busy}
                                      onClick={() => start(async () => {
                                        const r = await addCountItemsAction(count.id, [p.id]);
                                        if (r.error) setErr(r.error);
                                        router.refresh();
                                      })}>เลือก</button>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="toolbar">
          <strong>รายการที่ตรวจนับ</strong>
          <span className="subtle">
            {count.lines} รายการ · กรอกแล้ว {count.done} · ไม่ตรง {count.offCount}
          </span>
        </div>

        {count.items.length === 0 ? (
          <div className="empty">
            ยังไม่มีรายการ — ยิงบาร์โค้ดหรือกดค้นหาเพื่อดึงสินค้าที่จะนับ
          </div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th style={{ width: 130 }}>รหัสสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th style={{ width: 56 }}>หน่วย</th>
                  <th className="num" style={{ width: 92 }}>ระบบว่ามี</th>
                  <th className="num" style={{ width: 118 }}>นับได้จริง</th>
                  <th className="num" style={{ width: 92 }}>ส่วนต่าง</th>
                  <th className="num" style={{ width: 108 }}>มูลค่า</th>
                  {!ro ? <th style={{ width: 40 }} /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const off = it.diff !== null && Math.abs(it.diff) > 0.0005;
                  const color = it.diff === null ? 'var(--ink-3)'
                    : !off ? 'var(--ok)' : it.diff < 0 ? 'var(--due)' : 'var(--warn)';
                  return (
                    <tr key={it.id} style={off ? { background: '#FCF3E2' } : undefined}>
                      <td className="subtle" style={{ textAlign: 'center' }}>{i + 1}</td>
                      <td className="mono">{it.code}</td>
                      <td className="wrap">{it.name}</td>
                      <td className="subtle">{it.unit}</td>
                      <td className="num mono">
                        {it.systemQty === null ? '—' : fmtQty(it.systemQty)}
                      </td>
                      <td className="num">
                        {ro ? (
                          <span className="mono">
                            {it.countedQty === null ? '—' : fmtQty(it.countedQty)}
                          </span>
                        ) : (
                          <input className="in mono" inputMode="decimal" placeholder="—"
                                 style={{ textAlign: 'right' }}
                                 value={draftQty[it.id] ?? (it.countedQty === null ? '' : fmtQty(it.countedQty))}
                                 onChange={(e) =>
                                   setDraftQty((d) => ({ ...d, [it.id]: e.target.value }))}
                                 onBlur={(e) => saveQty(it.id, e.target.value)}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                 }} />
                        )}
                      </td>
                      <td className="num mono"
                          style={{ color, fontWeight: off ? 700 : 400 }}>
                        {it.diff === null ? '—' : (it.diff > 0 ? '+' : '') + fmtQty(it.diff)}
                      </td>
                      <td className="num mono" style={{ color }}>
                        {it.diffValue === null || !off ? '—' : baht(it.diffValue)}
                      </td>
                      {!ro ? (
                        <td style={{ textAlign: 'center' }}>
                          <button className="lnk" type="button" title="เอาออก" disabled={busy}
                                  onClick={() => start(async () => {
                                    const r = await removeCountItemAction(it.id, count.id);
                                    if (r.error) setErr(r.error);
                                    router.refresh();
                                  })}>×</button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
              {count.offCount > 0 ? (
                <tfoot>
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>
                      มูลค่าส่วนต่างรวม {count.offCount} รายการ
                    </td>
                    <td />
                    <td className="num" style={{
                      fontWeight: 700,
                      color: count.offValue < 0 ? 'var(--due)' : 'var(--ok)',
                    }}>{baht(count.offValue)}</td>
                    {!ro ? <td /> : null}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </div>

      {!ro ? (
        <ApplyBar count={count} onError={setErr} />
      ) : null}
    </>
  );
}

/**
 * ปุ่มปรับยอด — บอกตัวเลขก่อนถามยืนยัน ตามรุ่น 6.4
 * ย้ำว่าย้อนกลับเองไม่ได้ เพราะเป็นความจริงและเป็นสิ่งที่ผู้ใช้ต้องรู้ก่อนกด
 */
function ApplyBar({
  count, onError,
}: {
  count: StockCount;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();

  if (count.offCount === 0) {
    return (
      <div className="note" style={{ marginTop: 14 }}>
        <b>สต๊อกจะยังไม่เปลี่ยนจนกว่าจะกดปุ่มปรับยอด</b> ·
        ตอนนี้ยังไม่มีรายการที่นับได้ต่างจากระบบ ·
        ช่อง “ระบบว่ามี” อ่านสดทุกครั้งที่เปิดใบ เผื่อมีการขายหรือรับของระหว่างที่นับค้างไว้
      </div>
    );
  }

  if (!open) {
    return (
      <div className="formbar" style={{ marginTop: 14 }}>
        <button className="btn primary" type="button" onClick={() => setOpen(true)}>
          ปรับยอดตามผลตรวจนับ ({count.offCount})
        </button>
        <span className="subtle">
          รายการที่นับได้ตรงกับระบบจะไม่ถูกแตะต้อง · ที่ยังไม่ได้กรอกก็เช่นกัน
        </span>
      </div>
    );
  }

  const up = count.items.filter((i) => (i.diff ?? 0) > 0.0005).length;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="body">
        <div className="err">
          ปรับยอดสินค้า <b>{count.offCount} รายการ</b> ตามใบตรวจนับ {count.no}
          <br />
          รับเข้าเพิ่ม {up} รายการ · ตัดออก {count.offCount - up} รายการ ·
          มูลค่าส่วนต่างรวม {baht(count.offValue)} บาท
          <br />
          สต๊อกจะถูกปรับให้ตรงกับจำนวนที่นับได้ ทุกรายการบันทึกลงประวัติความเคลื่อนไหว
          และ<b>ย้อนกลับเองไม่ได้</b> — ถ้านับผิดต้องเปิดใบใหม่นับใหม่
        </div>
        <div className="tag-row">
          <button className="btn primary" type="button" disabled={busy}
                  onClick={() => start(async () => {
                    const r = await applyCountAction(count.id);
                    if (r.error) { onError(r.error); setOpen(false); return; }
                    router.refresh();
                  })}>
            {busy ? 'กำลังปรับยอด…' : 'ยืนยันปรับยอด'}
          </button>
          <button className="btn" type="button" onClick={() => setOpen(false)}>ยังไม่ปรับ</button>
        </div>
      </div>
    </div>
  );
}
