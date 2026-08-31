'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { bahttext, EXPENSE_CATS, exTotals, poTotals, type VatMode } from '@drivegolight/core';
import { saveBuyDocAction, searchVendorsAction } from './actions';
import { searchProductsAction } from '../income/actions';
import type { FormResult } from '@/lib/mutate';
import type { BuyDocInput, BuyItemInput, ExpenseCat, PickedVendor } from '@/lib/purchases';
import type { PickedProduct } from '@/lib/sales';
import { baht } from '@/lib/format';

const EPS = 0.004;
const round2 = (n: number) => Math.round(n * 100) / 100;

const emptyItem = (): BuyItemInput => ({
  productId: null, code: '', oem: '', name: '', unit: '', qty: 1, unitPrice: 0,
});

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : label}
    </button>
  );
}

export function BuyEditor({
  initial, vatRate, mode,
}: {
  initial: BuyDocInput;
  vatRate: number;
  mode: 'new' | 'edit';
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveBuyDocAction, {});
  const [doc, setDoc] = useState<BuyDocInput>(initial);
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendors, setVendors] = useState<PickedVendor[] | null>(null);
  const [partQuery, setPartQuery] = useState('');
  const [parts, setParts] = useState<PickedProduct[] | null>(null);
  const [pending, startTransition] = useTransition();

  const isPurchase = doc.kind === 'PO';

  const set = <K extends keyof BuyDocInput>(k: K, v: BuyDocInput[K]) =>
    setDoc((d) => ({ ...d, [k]: v }));

  const setItem = (i: number, patch: Partial<BuyItemInput>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  const base = {
    items: doc.items.map((i) => ({ qty: i.qty, price: i.unitPrice })),
    discount: doc.discount,
    vatMode: doc.vatMode,
    date: doc.docDate,
  };
  const t = isPurchase
    ? poTotals(base, { vatRate })
    : exTotals({ ...base, cat: doc.expenseCat ?? 'other', whtRate: doc.whtRate }, { vatRate });

  const paidNow = round2(doc.payments.reduce((s, p) => s + p.amount, 0));
  const remain = round2(t.payable - paidNow);

  /** เปลี่ยนหมวดค่าใช้จ่าย — ดึงอัตราหัก ณ ที่จ่ายที่แนะนำของหมวดนั้นมาให้ */
  const changeCat = (cat: ExpenseCat) => {
    const suggested = EXPENSE_CATS.find((x) => x.key === cat)?.wht ?? 0;
    const previous = EXPENSE_CATS.find((x) => x.key === doc.expenseCat)?.wht ?? 0;
    setDoc((d) => ({
      ...d,
      expenseCat: cat,
      /* แก้อัตราให้เฉพาะตอนที่ผู้ใช้ยังไม่ได้ตั้งเอง — ไม่ทับค่าที่เขาแก้ไว้ */
      whtRate: d.whtRate === previous ? suggested : d.whtRate,
      assetLifeYears: cat === 'asset' ? (d.assetLifeYears ?? 5) : null,
    }));
  };

  const searchVendor = () => startTransition(async () => {
    setVendors(await searchVendorsAction(vendorQuery));
  });
  const searchPart = () => startTransition(async () => {
    setParts(await searchProductsAction(partQuery));
  });

  const addProduct = (p: PickedProduct) => {
    setDoc((d) => {
      const at = d.items.findIndex((i) => i.productId === p.id);
      if (at >= 0) {
        return { ...d, items: d.items.map((i, j) => (j === at ? { ...i, qty: i.qty + 1 } : i)) };
      }
      return {
        ...d,
        items: [...d.items, {
          productId: p.id, code: p.code, oem: p.oem, name: p.name, unit: p.unit,
          qty: 1, unitPrice: 0,
        }],
      };
    });
  };

  const catInfo = EXPENSE_CATS.find((x) => x.key === doc.expenseCat);

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={JSON.stringify(doc)} />

      {state.error ? <div className="err" style={{ marginBottom: 16 }}>{state.error}</div> : null}

      <div className="card">
        <header>
          <h2>{isPurchase ? 'ใบซื้อสินค้า' : 'บันทึกค่าใช้จ่าย'}</h2>
          <div className="spacer" />
          <span className="subtle">
            {isPurchase
              ? 'รับอะไหล่เข้าสต๊อกและตั้งเป็นเจ้าหนี้ถ้ายังไม่จ่าย'
              : catInfo?.desc ?? 'ค่าใช้จ่ายของกิจการ'}
          </span>
        </header>
        <div className="body">
          <div className="row-fields f4">
            <div className="field">
              <label htmlFor="docDate">วันที่</label>
              <input className="in mono" id="docDate" type="date" value={doc.docDate}
                     onChange={(e) => set('docDate', e.target.value)} />
            </div>

            {!isPurchase ? (
              <div className="field">
                <label htmlFor="cat">หมวดค่าใช้จ่าย</label>
                <select className="in" id="cat" value={doc.expenseCat ?? 'other'}
                        onChange={(e) => changeCat(e.target.value as ExpenseCat)}>
                  {EXPENSE_CATS.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="refDocNo">เลขที่ใบกำกับของผู้ขาย</label>
              <input className="in mono" id="refDocNo" value={doc.refDocNo}
                     onChange={(e) => set('refDocNo', e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="vatMode">ภาษีมูลค่าเพิ่ม</label>
              <select className="in" id="vatMode" value={doc.vatMode}
                      onChange={(e) => set('vatMode', e.target.value as VatMode)}>
                <option value="none">ไม่คิดภาษี</option>
                <option value="ex">ราคายังไม่รวมภาษี</option>
                <option value="in">ราคารวมภาษีแล้ว</option>
              </select>
            </div>

            {!isPurchase ? (
              <div className="field">
                <label htmlFor="wht">หัก ณ ที่จ่าย (%)</label>
                <input className="in mono" id="wht" inputMode="decimal" value={doc.whtRate}
                       onChange={(e) => set('whtRate', Number(e.target.value) || 0)} />
                <span className="hint">
                  หมวดนี้แนะนำ {catInfo?.wht ?? 0}% · อู่เป็นผู้หักและนำส่งเอง
                </span>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="creditDays">เครดิต (วัน)</label>
              <input className="in mono" id="creditDays" inputMode="numeric" value={doc.creditDays}
                     onChange={(e) => set('creditDays', Math.max(0, Number(e.target.value) || 0))} />
            </div>

            {doc.expenseCat === 'asset' ? (
              <div className="field">
                <label htmlFor="life">อายุการใช้งาน (ปี)</label>
                <input className="in mono" id="life" inputMode="numeric"
                       value={doc.assetLifeYears ?? 5}
                       onChange={(e) => set('assetLifeYears', Math.max(1, Number(e.target.value) || 1))} />
                <span className="hint">ใช้คิดค่าเสื่อมราคาในอนาคต — ระบบยังไม่คำนวณให้</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- ผู้ขาย / ผู้รับเงิน ---------- */}
      <div className={`card${state.field === 'party' ? ' bad' : ''}`}>
        <header>
          <h2>{isPurchase ? 'ผู้ขาย' : 'ผู้รับเงิน'}</h2>
          {doc.partyId ? <span className="chip ok">เลือกจากทะเบียนแล้ว</span> : null}
        </header>
        <div className="body">
          <div className="tag-row" style={{ marginBottom: 12 }}>
            <input className="in" value={vendorQuery} placeholder="ค้นชื่อ รหัส หรือเบอร์โทร"
                   style={{ width: 280 }}
                   onChange={(e) => setVendorQuery(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchVendor(); } }} />
            <button className="btn" type="button" onClick={searchVendor} disabled={pending}>
              ค้นหาจากทะเบียนผู้ขาย
            </button>
            {doc.partyId ? (
              <button className="btn" type="button" onClick={() => set('partyId', null)}>ล้างการเลือก</button>
            ) : null}
          </div>

          {vendors ? (
            <div className="tablewrap" style={{ marginBottom: 12, maxHeight: 200, overflowY: 'auto' }}>
              <table className="tbl">
                <tbody>
                  {vendors.length === 0 ? (
                    <tr><td className="subtle">ไม่พบ — พิมพ์ชื่อในช่องด้านล่างได้เลย</td></tr>
                  ) : vendors.map((v) => (
                    <tr key={v.id}>
                      <td className="mono">{v.code}</td>
                      <td className="wrap">{v.name}</td>
                      <td className="mono">{v.tel || '-'}</td>
                      <td>
                        <button className="btn" type="button" onClick={() => {
                          setVendors(null);
                          setDoc((d) => ({
                            ...d,
                            partyId: v.id, partyName: v.name, partyTaxId: v.taxId,
                            partyTel: v.tel, partyAddrText: v.addrText,
                            creditDays: d.creditDays || v.creditDays,
                          }));
                        }}>เลือก</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="row-fields f3">
            <div className="field">
              <label>ชื่อ *</label>
              <input className="in" value={doc.partyName}
                     onChange={(e) => set('partyName', e.target.value)} />
            </div>
            <div className="field">
              <label>เลขประจำตัวผู้เสียภาษี</label>
              <input className="in mono" value={doc.partyTaxId} inputMode="numeric"
                     onChange={(e) => set('partyTaxId', e.target.value)} />
            </div>
            <div className="field">
              <label>โทรศัพท์</label>
              <input className="in mono" value={doc.partyTel}
                     onChange={(e) => set('partyTel', e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>ที่อยู่</label>
            <textarea className="in" value={doc.partyAddrText}
                      onChange={(e) => set('partyAddrText', e.target.value)} />
          </div>
        </div>
      </div>

      {/* ---------- รายการ ---------- */}
      <div className={`card${state.field === 'items' ? ' bad' : ''}`}>
        <header>
          <h2>รายการ</h2>
          <div className="spacer" />
          <span className="subtle">{doc.items.length} บรรทัด</span>
        </header>

        <div className="toolbar">
          {isPurchase ? (
            <>
              <input className="in" value={partQuery} placeholder="ค้นอะไหล่จากทะเบียนสินค้า"
                     style={{ width: 260 }}
                     onChange={(e) => setPartQuery(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPart(); } }} />
              <button className="btn" type="button" onClick={searchPart} disabled={pending}>ค้นหาอะไหล่</button>
            </>
          ) : null}
          <button className="btn" type="button"
                  onClick={() => setDoc((d) => ({ ...d, items: [...d.items, emptyItem()] }))}>
            + บรรทัดเปล่า
          </button>
          {isPurchase ? (
            <span className="subtle">เฉพาะบรรทัดที่ผูกทะเบียนสินค้าเท่านั้นที่จะเข้าสต๊อก</span>
          ) : null}
        </div>

        {parts ? (
          <div className="tablewrap" style={{ maxHeight: 220, overflowY: 'auto', borderBottom: '1px solid var(--line)' }}>
            <table className="tbl">
              <tbody>
                {parts.length === 0 ? (
                  <tr><td className="subtle">ไม่พบอะไหล่ในทะเบียน</td></tr>
                ) : parts.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.code}</td>
                    <td className="wrap">{p.name}</td>
                    <td className="num subtle">คงเหลือ {p.qtyOnHand.toLocaleString('en-US')}</td>
                    <td><button className="btn" type="button" onClick={() => addProduct(p)}>เพิ่ม</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {doc.items.length === 0 ? (
          <div className="empty">ยังไม่มีรายการ</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  {isPurchase ? <th style={{ width: 100 }}>รหัส</th> : null}
                  <th>รายการ</th>
                  <th style={{ width: 80 }} className="num">จำนวน</th>
                  <th style={{ width: 70 }}>หน่วย</th>
                  <th style={{ width: 110 }} className="num">ราคา/หน่วย</th>
                  <th style={{ width: 110 }} className="num">จำนวนเงิน</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {doc.items.map((it, i) => (
                  <tr key={i}>
                    <td className="subtle">
                      {i + 1}
                      {isPurchase && it.productId ? <span className="chip ok" style={{ marginLeft: 4 }}>สต๊อก</span> : null}
                    </td>
                    {isPurchase ? (
                      <td>
                        <input className="in mono" style={{ padding: '4px 6px' }} value={it.code}
                               onChange={(e) => setItem(i, { code: e.target.value })} />
                      </td>
                    ) : null}
                    <td>
                      <input className="in" style={{ padding: '4px 6px' }} value={it.name}
                             onChange={(e) => setItem(i, { name: e.target.value })} />
                    </td>
                    <td>
                      <input className="in mono" style={{ padding: '4px 6px', textAlign: 'right' }}
                             inputMode="decimal" value={it.qty}
                             onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className="in" style={{ padding: '4px 6px' }} value={it.unit}
                             onChange={(e) => setItem(i, { unit: e.target.value })} />
                    </td>
                    <td>
                      <input className="in mono" style={{ padding: '4px 6px', textAlign: 'right' }}
                             inputMode="decimal" value={it.unitPrice}
                             onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="num">{baht(round2(it.qty * it.unitPrice))}</td>
                    <td>
                      <button className="btn danger" type="button" style={{ padding: '2px 8px' }}
                              onClick={() => setDoc((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 200 }}>
            <label>ส่วนลด (บาท)</label>
            <input className="in mono" inputMode="decimal" value={doc.discount}
                   onChange={(e) => set('discount', Number(e.target.value) || 0)} />
          </div>

          <div className="totals">
            <div className="row"><span className="lbl">รวมเป็นเงิน</span><span>{baht(t.sub)}</span></div>
            {doc.discount > 0 ? (
              <div className="row"><span className="lbl">ส่วนลด</span><span>−{baht(t.disc)}</span></div>
            ) : null}
            {doc.vatMode !== 'none' ? (
              <>
                <div className="row"><span className="lbl">มูลค่าก่อนภาษี</span><span>{baht(t.net)}</span></div>
                <div className="row"><span className="lbl">ภาษีมูลค่าเพิ่ม {vatRate}%</span><span>{baht(t.vat)}</span></div>
              </>
            ) : null}
            <div className="row grand"><span>รวมทั้งสิ้น</span><span>{baht(t.grand)}</span></div>
            {t.wht > 0 ? (
              <>
                <div className="row">
                  <span className="lbl">หัก ณ ที่จ่าย {doc.whtRate}%</span><span>−{baht(t.wht)}</span>
                </div>
                <div className="row grand"><span>ยอดที่ต้องจ่ายจริง</span><span>{baht(t.payable)}</span></div>
              </>
            ) : null}
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-3)' }}>
              ({bahttext(t.payable)})
            </div>
          </div>
        </div>
      </div>

      {/* ---------- รับของและจ่ายเงิน ---------- */}
      <div className="card">
        <header><h2>การรับของและการจ่ายเงิน</h2></header>
        <div className="body">
          {isPurchase ? (
            <label className="tag-row" style={{ fontSize: 14, marginBottom: 14 }}>
              <input type="checkbox" checked={doc.goodsReceived}
                     onChange={(e) => set('goodsReceived', e.target.checked)} />
              รับของเข้าสต๊อกแล้ว — ติ๊กแล้วอะไหล่ที่ผูกทะเบียนจะถูกบวกเข้าคงเหลือ และทุนล่าสุดอัปเดตตามราคาที่ซื้อ
            </label>
          ) : null}

          <div className="row-fields f3">
            {['เงินสด', 'เงินโอน', 'บัตรเครดิต'].map((method) => {
              const at = doc.payments.findIndex((p) => p.method === method);
              const amount = at >= 0 ? doc.payments[at]!.amount : 0;
              return (
                <div className="field" key={method}>
                  <label>จ่ายด้วย{method}</label>
                  <input className="in mono" inputMode="decimal" value={amount || ''} placeholder="0.00"
                         onChange={(e) => {
                           const v = Number(e.target.value) || 0;
                           setDoc((d) => {
                             const rest = d.payments.filter((p) => p.method !== method);
                             const ref = d.payments.find((p) => p.method === method)?.ref ?? '';
                             return { ...d, payments: v > 0 ? [...rest, { method, amount: v, ref }] : rest };
                           });
                         }} />
                </div>
              );
            })}
          </div>

          <div className="tag-row" style={{ marginTop: 12 }}>
            <button className="btn" type="button"
                    onClick={() => setDoc((d) => ({ ...d, payments: [{ method: 'เงินสด', amount: t.payable, ref: '' }] }))}>
              จ่ายสดเต็มจำนวน
            </button>
            <button className="btn" type="button"
                    onClick={() => setDoc((d) => ({ ...d, payments: [{ method: 'เงินโอน', amount: t.payable, ref: '' }] }))}>
              โอนเต็มจำนวน
            </button>
            <button className="btn" type="button"
                    onClick={() => setDoc((d) => ({ ...d, payments: [] }))}>
              ยังไม่จ่าย (ตั้งเป็นเจ้าหนี้)
            </button>
            <span className="subtle">
              {remain > EPS ? `จะตั้งเป็นเจ้าหนี้ ${baht(remain)} บาท` : 'จ่ายครบแล้ว'}
            </span>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>หมายเหตุ</label>
            <textarea className="in" value={doc.note} onChange={(e) => set('note', e.target.value)} />
          </div>

          <div className="formbar">
            <Submit label={mode === 'new' ? 'บันทึก' : 'บันทึกการแก้ไข'} />
            <Link className="btn" href="/expense">ยกเลิก</Link>
          </div>
        </div>
      </div>
    </form>
  );
}
