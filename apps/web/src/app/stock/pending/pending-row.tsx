'use client';

import { useActionState, useState, useTransition } from 'react';
import { createFromPendingAction, ignorePendingAction, linkPendingAction } from '../actions';
import { searchProductsAction } from '../../income/actions';
import type { FormResult } from '@/lib/mutate';
import type { PendingItem } from '@/lib/pending';
import type { PickedProduct } from '@/lib/sales';
import { baht, thDate } from '@/lib/format';

type Panel = null | 'link' | 'create';

export function PendingRow({ item }: { item: PendingItem }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [results, setResults] = useState<PickedProduct[] | null>(null);
  const [q, setQ] = useState(item.name);
  const [searching, startSearch] = useTransition();

  const [linkState, linkAction] = useActionState<FormResult, FormData>(linkPendingAction, {});
  const [createState, createAction] = useActionState<FormResult, FormData>(createFromPendingAction, {});

  const search = () => startSearch(async () => setResults(await searchProductsAction(q)));

  if (linkState.ok || createState.ok) {
    return (
      <tr>
        <td colSpan={6} className="ok-msg" style={{ margin: 0 }}>
          จัดการ “{item.name}” เรียบร้อยแล้ว
          {linkState.values?.linked ? ` — ผูกกับ ${linkState.values.linked} บรรทัด` : ''}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr>
        <td className="wrap"><b>{item.name}</b></td>
        <td className="num">{item.lineCount}</td>
        <td className="num">{item.totalQty.toLocaleString('en-US')}</td>
        <td className="num mono">{item.lastPrice > 0.004 ? baht(item.lastPrice) : '-'}</td>
        <td>
          {thDate(item.lastUsedOn)}
          <span className="subtle"> · {item.lastDocNo}</span>
        </td>
        <td>
          <div className="tag-row">
            <button className="btn" type="button"
                    onClick={() => { setPanel(panel === 'link' ? null : 'link'); if (!results) search(); }}>
              ผูกกับสินค้า
            </button>
            <button className="btn" type="button"
                    onClick={() => setPanel(panel === 'create' ? null : 'create')}>
              สร้างสินค้าใหม่
            </button>
            <form action={ignorePendingAction.bind(null, item.nameNorm)}>
              <button className="btn" type="submit">ข้ามรายการนี้</button>
            </form>
          </div>
        </td>
      </tr>

      {panel === 'link' ? (
        <tr>
          <td colSpan={6} style={{ background: 'var(--bg)' }}>
            <form action={linkAction} className="form" style={{ padding: '6px 0' }}>
              <input type="hidden" name="nameNorm" value={item.nameNorm} />
              {linkState.error ? <div className="err">{linkState.error}</div> : null}

              <div className="tag-row">
                <input className="in" value={q} style={{ width: 280 }}
                       onChange={(e) => setQ(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} />
                <button className="btn" type="button" onClick={search} disabled={searching}>ค้นหา</button>
                <span className="subtle">
                  จะผูก {item.lineCount} บรรทัดในเอกสารเดิมเข้ากับสินค้าที่เลือก โดยไม่แก้ชื่อหรือราคาบนเอกสาร
                </span>
              </div>

              {results ? (
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {results.length === 0 ? (
                    <span className="subtle">ไม่พบสินค้า — ใช้ปุ่ม “สร้างสินค้าใหม่” แทน</span>
                  ) : results.map((p) => (
                    <label key={p.id} className="tag-row" style={{ padding: '4px 0', cursor: 'pointer' }}>
                      <input type="radio" name="productId" value={p.id} />
                      <span className="mono">{p.code}</span>
                      <span>{p.name}</span>
                      <span className="subtle">{baht(p.priceA)} · คงเหลือ {p.qtyOnHand.toLocaleString('en-US')}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="tag-row">
                <button className="btn primary" type="submit">ผูกเข้าทะเบียน</button>
                <button className="btn" type="button" onClick={() => setPanel(null)}>ปิด</button>
              </div>
            </form>
          </td>
        </tr>
      ) : null}

      {panel === 'create' ? (
        <tr>
          <td colSpan={6} style={{ background: 'var(--bg)' }}>
            <form action={createAction} className="form" style={{ padding: '6px 0' }}>
              <input type="hidden" name="nameNorm" value={item.nameNorm} />
              {createState.error ? <div className="err">{createState.error}</div> : null}

              <div className="row-fields f4">
                <div className={createState.field === 'code' ? 'field bad' : 'field'}>
                  <label>รหัสสินค้า *</label>
                  <input className="in mono" name="code" required placeholder="เช่น GEN-001" />
                </div>
                <div className="field">
                  <label>ชื่อสินค้า</label>
                  <input className="in" name="name" defaultValue={item.name} />
                </div>
                <div className="field">
                  <label>หน่วยนับ</label>
                  <input className="in" name="unit" placeholder="ชิ้น" />
                </div>
                <div className="field">
                  <label>ทุน / ราคาขาย</label>
                  <div className="tag-row">
                    <input className="in mono" name="cost" inputMode="decimal" defaultValue="0" style={{ width: 90 }} />
                    <input className="in mono" name="priceA" inputMode="decimal" defaultValue="0" style={{ width: 90 }} />
                  </div>
                </div>
              </div>

              <div className="tag-row">
                <button className="btn primary" type="submit">สร้างและผูกให้เลย</button>
                <button className="btn" type="button" onClick={() => setPanel(null)}>ปิด</button>
                <span className="subtle">สินค้าใหม่จะเริ่มที่ยอดคงเหลือศูนย์ — ปรับยอดได้ที่หน้าสินค้า</span>
              </div>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}
