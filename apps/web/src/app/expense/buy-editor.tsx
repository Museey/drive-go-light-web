'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addMonths, bahttext, EXPENSE_CATS, exTotals, lineAmount, poTotals, type VatMode,
} from '@drivegolight/core';
import { saveBuyDocAction, searchVendorsAction } from './actions';
import { scanPartAction, searchProductsAction } from '../income/actions';
import { useLiveSearch } from '@/components/use-live-search';
import { ScanBox } from '@/components/scan-box';
import { ConfirmSave } from '@/components/confirm-save';
import { ThaiDateField } from '@/components/thai-date-input';
import { Icon } from '@/components/icon';
import type { FormResult } from '@/lib/mutate';
import type { BuyDocInput, BuyItemInput, ExpenseCat, PickedVendor } from '@/lib/purchases';
import type { PickedProduct } from '@/lib/sales';
import { baht, thDate } from '@/lib/format';
import { formatDocNo } from '@/lib/doc-no';

/**
 * ฟอร์มใบซื้อ / บันทึกค่าใช้จ่าย — โครงเดียวกับฟอร์มขาย (13 ก.ย. 69)
 *
 *   [ผู้ขาย | ข้อมูลเอกสาร] · [รายการ 5 บรรทัดว่าง ค้นหาในบรรทัด] · [หมายเหตุ | สรุปยอด + รับของ/จ่ายเงิน]
 *
 * ใบซื้อ (PO) ยิงบาร์โค้ดได้ — ยิงแล้วดึงชื่อ หน่วย OEM และวันหมดอายุจากอายุการเก็บมาให้
 * ราคาซื้อกรอกเอง เพราะราคาที่จ่ายผู้ขายไม่ใช่ราคาขาย
 * ค่าใช้จ่าย (EX) ไม่ผูกสินค้า พิมพ์ชื่อรายการเอง
 */

const EPS = 0.004;
const round2 = (n: number) => Math.round(n * 100) / 100;
const MIN_ROWS = 5;

const emptyItem = (): BuyItemInput => ({
  productId: null, code: '', oem: '', name: '', unit: '', qty: 1, unitPrice: 0, expiresOn: null, discPct: 0,
});
const isRealItem = (it: BuyItemInput) => Boolean(it.productId) || it.name.trim() !== '' || it.code.trim() !== '';
const padRows = (items: BuyItemInput[]) =>
  items.length >= MIN_ROWS ? items : [...items, ...Array.from({ length: MIN_ROWS - items.length }, emptyItem)];
const addDaysIso = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/* ---------- บรรทัด — ใบซื้อค้นหาสินค้าในบรรทัด ผลหล่นใต้บรรทัด ---------- */
function BuyLineRow({
  i, item, isPurchase, isLast, onChange, onPick, onRemove, onEnterLast,
}: {
  i: number;
  item: BuyItemInput;
  isPurchase: boolean;
  isLast: boolean;
  onChange: (patch: Partial<BuyItemInput>) => void;
  onPick: (p: PickedProduct) => void;
  onRemove: () => void;
  onEnterLast: () => void;
}) {
  const [query, setQuery] = useState('');
  const { results, busy, clear } = useLiveSearch(isPurchase ? query : '', searchProductsAction);
  const amount = lineAmount({ qty: item.qty, price: item.unitPrice, discPct: item.discPct ?? 0 });

  const pick = (p: PickedProduct) => { onPick(p); setQuery(''); clear(); };
  const enterKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    if (results && results.length > 0) { e.preventDefault(); e.stopPropagation(); pick(results[0]!); return; }
    if (isLast && (e.target as HTMLElement).classList.contains('mono') && !item.name) { e.preventDefault(); e.stopPropagation(); onEnterLast(); }
  };
  const cols = isPurchase ? 10 : 8;

  return (
    <>
      <tr>
        <td className="idx">{i + 1}</td>
        {isPurchase ? (
          <td style={{ width: 150 }}>
            <input className="in mono" placeholder="พิมพ์รหัส / ชื่อ" value={query || item.code}
                   onChange={(e) => { setQuery(e.target.value); onChange({ code: e.target.value, productId: null }); }}
                   onKeyDown={enterKey} />
          </td>
        ) : null}
        <td>
          <input className="in" placeholder={isPurchase ? '— เลือกสินค้า หรือพิมพ์ชื่อเอง —' : 'รายการค่าใช้จ่าย'}
                 value={item.name} onChange={(e) => onChange({ name: e.target.value })} onKeyDown={enterKey} />
          {isPurchase && item.productId ? <span className="chip ok" style={{ marginTop: 4 }}>เข้าสต๊อก</span> : null}
        </td>
        <td style={{ width: 84 }}>
          <input className="in mono" inputMode="decimal" style={{ textAlign: 'right' }} value={item.qty}
                 onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })} onKeyDown={enterKey} />
        </td>
        <td style={{ width: 80 }}>
          <input className="in" value={item.unit} placeholder="หน่วย" onChange={(e) => onChange({ unit: e.target.value })} onKeyDown={enterKey} />
        </td>
        <td style={{ width: 120 }}>
          <input className="in mono" inputMode="decimal" style={{ textAlign: 'right' }} value={item.unitPrice}
                 onChange={(e) => onChange({ unitPrice: Number(e.target.value) || 0 })} onKeyDown={enterKey} />
        </td>
        <td style={{ width: 84 }}>
          <input className="in mono" inputMode="decimal" style={{ textAlign: 'right' }} value={item.discPct ?? 0} title="ส่วนลดรายบรรทัด (%)"
                 onChange={(e) => onChange({ discPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} onKeyDown={enterKey} />
        </td>
        <td className="amt">{baht(amount)}</td>
        {isPurchase ? (
          <td style={{ width: 118 }}>
            {/* เฉพาะบรรทัดที่ผูกทะเบียน — บรรทัดที่พิมพ์ชื่อเองไม่เข้าสต๊อก จึงไม่มีล็อตให้ผูกวันหมดอายุ */}
            {item.productId ? (
              <ThaiDateField value={item.expiresOn ?? ''} onChange={(iso) => onChange({ expiresOn: iso || null })} style={{ width: 104 }} />
            ) : <span className="subtle">—</span>}
          </td>
        ) : null}
        <td style={{ width: 40 }}>
          <button className="del" type="button" onClick={onRemove} title="ลบบรรทัด" aria-label="ลบบรรทัด">✕</button>
        </td>
      </tr>

      {isPurchase && query.trim() && (results || busy) ? (
        <tr className="hitrow">
          <td colSpan={cols}>
            {busy && !results ? <div className="subtle" style={{ padding: '6px 10px' }}>กำลังค้น…</div> : null}
            {results ? (
              <div className="tablewrap hits5">
                <table className="tbl">
                  <tbody>
                    {results.length === 0 ? (
                      <tr><td className="subtle">ไม่พบในทะเบียน — พิมพ์ชื่อเองได้ (บรรทัดนั้นจะไม่เข้าสต๊อก)</td></tr>
                    ) : results.map((p) => (
                      <tr key={p.id} className="pick" role="button" tabIndex={0}
                          onClick={() => pick(p)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p); } }}>
                        <td className="mono">{p.code}</td>
                        <td className="wrap">{p.name}</td>
                        <td className="subtle">{p.unit}</td>
                        <td className="num subtle">คงเหลือ {p.qtyOnHand.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ====================================================================== */

export function BuyEditor({ initial, vatRate, mode, docNo, returnTo, docNoPreview }: {
  initial: BuyDocInput;
  vatRate: number;
  mode: 'new' | 'edit';
  docNo?: string;
  /** เลขถัดไปของเดือน (ใบใหม่) — โชว์ทันที ยืนยันตอนบันทึก */
  docNoPreview?: { seq: number; month: string };
  /** บันทึกแล้วกลับหน้าเดิมพร้อมปุ่มพิมพ์ */
  returnTo?: string;
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveBuyDocAction, {});
  const [doc, setDoc] = useState<BuyDocInput>({
    ...initial,
    discountMode: initial.discountMode ?? 'baht',
    discountPct: initial.discountPct ?? 0,
    items: padRows(initial.items.map((it) => ({ ...it, discPct: it.discPct ?? 0 }))),
  });
  const [vendorQuery, setVendorQuery] = useState('');
  const [notFound, setNotFound] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [precheck, setPrecheck] = useState('');
  const [printAfter, setPrintAfter] = useState(false);
  useEffect(() => { if (state.error) setConfirm(false); }, [state]);
  const isPurchase = doc.kind === 'PO';
  const tryConfirm = () => {
    const real = doc.items.filter(isRealItem);
    const bad =
      !doc.partyName.trim() ? (isPurchase ? 'ต้องระบุผู้ขาย' : 'ต้องระบุผู้รับเงิน')
      : real.length === 0 ? 'ต้องมีรายการอย่างน้อยหนึ่งบรรทัด'
      : real.some((i) => !i.name.trim()) ? 'ทุกบรรทัดต้องมีชื่อรายการ'
      : real.some((i) => !(i.qty > 0)) ? 'จำนวนทุกบรรทัดต้องมากกว่า 0'
      : '';
    setPrecheck(bad);
    if (!bad) setConfirm(true);
  };

  const { results: vendors, busy: vendorBusy, clear: clearVendors } = useLiveSearch(vendorQuery, searchVendorsAction);

  const set = <K extends keyof BuyDocInput>(k: K, v: BuyDocInput[K]) => setDoc((d) => ({ ...d, [k]: v }));
  const setItem = (i: number, patch: Partial<BuyItemInput>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  /* ---------- ยอด (สูตรเดียวกับเซิร์ฟเวอร์) ---------- */
  const realItems = doc.items.filter(isRealItem);
  const coreItems = realItems.map((i) => ({ qty: i.qty, price: i.unitPrice, discPct: i.discPct ?? 0 }));
  const subBefore = coreItems.reduce((s, it) => s + lineAmount(it), 0);
  const effDiscount = doc.discountMode === 'pct'
    ? round2(subBefore * (doc.discountPct ?? 0) / 100)
    : round2(Math.max(0, doc.discount || 0));
  const base = { items: coreItems, discount: effDiscount, vatMode: doc.vatMode, date: doc.docDate };
  const t = isPurchase
    ? poTotals(base, { vatRate })
    : exTotals({ ...base, cat: doc.expenseCat ?? 'other', whtRate: doc.whtRate }, { vatRate });
  const paidNow = round2(doc.payments.reduce((s, p) => s + p.amount, 0));
  const remain = round2(t.payable - paidNow);
  const catInfo = EXPENSE_CATS.find((c) => c.key === doc.expenseCat);
  const dueDate = doc.creditDays > 0 ? addDaysIso(doc.docDate, doc.creditDays) : doc.docDate;

  const changeCat = (cat: ExpenseCat) => {
    const suggested = EXPENSE_CATS.find((x) => x.key === cat)?.wht ?? 0;
    const previous = EXPENSE_CATS.find((x) => x.key === doc.expenseCat)?.wht ?? 0;
    setDoc((d) => ({
      ...d, expenseCat: cat,
      whtRate: d.whtRate === previous ? suggested : d.whtRate,       /* ไม่ทับค่าที่ผู้ใช้แก้ไว้ */
      assetLifeYears: cat === 'asset' ? (d.assetLifeYears ?? 5) : null,
    }));
  };

  const applyVendor = (v: PickedVendor) => {
    setVendorQuery(''); clearVendors();
    setDoc((d) => ({
      ...d, partyId: v.id, partyName: v.name, partyTaxId: v.taxId, partyTel: v.tel, partyAddrText: v.addrText,
      creditDays: d.creditDays || v.creditDays,
    }));
  };

  /* ---------- สินค้าลงบรรทัด (ใบซื้อ): ดึงชื่อ/หน่วย/OEM/วันหมดอายุจากทะเบียน ราคาซื้อกรอกเอง ---------- */
  const fromProduct = (d: BuyDocInput, p: PickedProduct, qty: number): BuyItemInput => ({
    ...emptyItem(), productId: p.id, code: p.code, oem: p.oem, name: p.name, unit: p.unit, qty,
    expiresOn: addMonths(d.docDate, p.shelfLifeMonths),
  });
  const fillRow = (i: number, p: PickedProduct, qty = 1) =>
    setDoc((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...fromProduct(d, p, qty), unitPrice: it.unitPrice, discPct: it.discPct } : it)) }));
  const addProduct = (p: PickedProduct, qty = 1) => setDoc((d) => {
    const at = d.items.findIndex((i) => i.productId === p.id);
    if (at >= 0) return { ...d, items: d.items.map((i, j) => (j === at ? { ...i, qty: i.qty + qty } : i)) };
    const line = fromProduct(d, p, qty);
    const blank = d.items.findIndex((i) => !isRealItem(i));
    return blank >= 0 ? { ...d, items: d.items.map((i, j) => (j === blank ? line : i)) } : { ...d, items: [...d.items, line] };
  });
  const addRow = (patch: Partial<BuyItemInput> = {}) => setDoc((d) => ({ ...d, items: [...d.items, { ...emptyItem(), ...patch }] }));
  const removeRow = (i: number) => setDoc((d) => ({ ...d, items: padRows(d.items.filter((_, j) => j !== i)) }));

  const onScan = async (raw: string) => {
    const r = await scanPartAction(raw);
    if (r.kind === 'one') { addProduct(r.product, r.qty); return { ok: true, message: `${r.product.code} ${r.product.name} · ${r.qty} ${r.product.unit}` }; }
    if (r.kind === 'inactive') return { ok: false, message: `${r.code} ${r.name} ปิดใช้งานอยู่ — เปิดใช้งานที่ทะเบียนสินค้าก่อน` };
    if (r.kind === 'many') {
      const blank = doc.items.findIndex((i) => !isRealItem(i));
      setItem(blank >= 0 ? blank : doc.items.length, { code: r.term });
      return { ok: false, message: `ตรงกับสินค้า ${r.count} รายการ — พิมพ์ต่อในบรรทัดที่ขึ้นรหัสให้แล้วเลือก` };
    }
    setNotFound(r.term);
    return { ok: false, message: `ไม่พบ "${r.term}"` };
  };

  const payload = useMemo(() => JSON.stringify({ ...doc, items: realItems }), [doc, realItems]);
  const title = isPurchase ? 'ใบซื้อสินค้า' : 'บันทึกค่าใช้จ่าย';
  const confirmLines = [
    { label: isPurchase ? 'ผู้ขาย' : 'ผู้รับเงิน', value: doc.partyName || '(ไม่ระบุ)' },
    { label: 'วันที่', value: thDate(doc.docDate) },
    { label: 'รายการ', value: `${realItems.length} บรรทัด` },
    ...(effDiscount > 0 ? [{ label: 'ส่วนลดท้ายบิล', value: `−${baht(effDiscount)}` }] : []),
    { label: 'รวมทั้งสิ้น', value: baht(t.grand) },
    ...(t.wht > 0 ? [{ label: 'ยอดที่ต้องจ่ายจริง', value: baht(t.payable) }] : []),
    { label: 'จ่ายแล้ว', value: paidNow > EPS ? baht(paidNow) : `ยังไม่จ่าย (เจ้าหนี้ ${baht(remain)})` },
    ...(isPurchase ? [{ label: 'รับของเข้าสต๊อก', value: doc.goodsReceived ? 'รับแล้ว' : 'ยังไม่รับ' }] : []),
  ];

  return (
    <form action={action} id="buy-form"
          onKeyDown={(e) => { const el = e.target as HTMLElement; if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault(); }}>
      <input type="hidden" name="payload" value={payload} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {printAfter ? <input type="hidden" name="printAfter" value="1" /> : null}
      {state.error ? <div className="err" style={{ marginBottom: 16 }}>{state.error}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <header>
          <h2>{mode === 'new' ? `สร้าง${title}` : `แก้ไข${title}`}</h2>
          <div className="spacer" />
          <span className="subtle">{isPurchase ? 'รับอะไหล่เข้าสต๊อกและตั้งเป็นเจ้าหนี้ถ้ายังไม่จ่าย' : catInfo?.desc ?? 'ค่าใช้จ่ายของกิจการ'}</span>
        </header>
      </div>

      {/* ================= ผู้ขาย | ข้อมูลเอกสาร ================= */}
      <div className="docgrid">
        <div className={`card${state.field === 'party' ? ' bad' : ''}`}>
          <header>
            <span className="ic"><Icon name="seeShop" size={18} color="#C25A18" /></span>
            <h2>{isPurchase ? 'ผู้ขาย' : 'ผู้รับเงิน'}</h2>
            <div className="spacer" />
            {doc.partyId ? <span className="chip ok">เลือกจากทะเบียนแล้ว</span> : null}
          </header>
          <div className="body">
            <div className="field">
              <label>ค้นจากทะเบียนผู้ขาย</label>
              <div className="tag-row">
                <input className="in" value={vendorQuery} style={{ flex: 1, minWidth: 200 }}
                       placeholder="พิมพ์ชื่อ รหัส หรือเบอร์โทร — ผลขึ้นทันที" onChange={(e) => setVendorQuery(e.target.value)} />
                {vendorBusy ? <span className="subtle">กำลังค้น…</span> : null}
                {doc.partyId ? <button className="btn sm" type="button" onClick={() => set('partyId', null)}>ล้างการเลือก</button> : null}
              </div>
            </div>
            {vendors ? (
              <div className="tablewrap hits5" style={{ margin: '8px 0 12px', border: '1px solid var(--line)', borderRadius: 8 }}>
                <table className="tbl"><tbody>
                  {vendors.length === 0 ? (
                    <tr><td className="subtle">ไม่พบ — พิมพ์ชื่อในช่องด้านล่างได้เลย</td></tr>
                  ) : vendors.map((v) => (
                    <tr key={v.id} className="pick" role="button" tabIndex={0} onClick={() => applyVendor(v)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyVendor(v); } }}>
                      <td className="mono">{v.code}</td><td className="wrap">{v.name}</td><td className="mono">{v.tel || '-'}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            ) : null}
            <div className="row-fields f2" style={{ marginTop: 10 }}>
              <div className="field"><label>ชื่อ *</label>
                <input className="in" value={doc.partyName} onChange={(e) => set('partyName', e.target.value)} /></div>
              <div className="field"><label>เลขประจำตัวผู้เสียภาษี</label>
                <input className="in mono" inputMode="numeric" value={doc.partyTaxId} onChange={(e) => set('partyTaxId', e.target.value)} /></div>
            </div>
            <div className="field" style={{ marginTop: 10 }}><label>ที่อยู่</label>
              <textarea className="in" value={doc.partyAddrText} placeholder="— แสดงอัตโนมัติเมื่อเลือกจากทะเบียน —" onChange={(e) => set('partyAddrText', e.target.value)} /></div>
            <div className="field" style={{ marginTop: 10 }}><label>เบอร์โทร</label>
              <input className="in mono" value={doc.partyTel} onChange={(e) => set('partyTel', e.target.value)} /></div>
          </div>
        </div>

        <div className="card">
          <header><span className="ic"><Icon name="cart" size={18} color="#C25A18" /></span><h2>ข้อมูลเอกสาร</h2></header>
          <div className="body">
            <div className="row-fields f2">
              <div className="field"><label>เลขที่เอกสาร</label>
                <div className="in mono" style={{ background: 'var(--bg)', fontWeight: 700 }}>{docNo ?? (docNoPreview && doc.docDate.slice(0, 7) === docNoPreview.month ? formatDocNo(doc.kind, doc.docDate, docNoPreview.seq) : 'ออกเลขตามเดือนที่เลือกตอนบันทึก')}</div>{!docNo ? <span className="hint">เลขถัดไปของเดือน ขึ้นทันที · ยืนยันตอนบันทึก</span> : null}</div>
              <div className="field"><label htmlFor="docDate">วันที่</label>
                <ThaiDateField id="docDate" value={doc.docDate} onChange={(iso) => set('docDate', iso)} /></div>
            </div>
            <div className="row-fields f2" style={{ marginTop: 10 }}>
              <div className="field"><label htmlFor="refDocNo">เลขที่ใบกำกับของผู้ขาย</label>
                <input className="in mono" id="refDocNo" value={doc.refDocNo} onChange={(e) => set('refDocNo', e.target.value)} /></div>
              <div className="field"><label htmlFor="vatMode">ภาษีมูลค่าเพิ่ม</label>
                <select className="in" id="vatMode" value={doc.vatMode} onChange={(e) => set('vatMode', e.target.value as VatMode)}>
                  <option value="none">ไม่คิดภาษี</option><option value="ex">ราคายังไม่รวมภาษี</option><option value="in">ราคารวมภาษีแล้ว</option>
                </select></div>
            </div>
            {!isPurchase ? (
              <div className="row-fields f2" style={{ marginTop: 10 }}>
                <div className="field"><label htmlFor="cat">หมวดค่าใช้จ่าย</label>
                  <select className="in" id="cat" value={doc.expenseCat ?? 'other'} onChange={(e) => changeCat(e.target.value as ExpenseCat)}>
                    {EXPENSE_CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="wht">หัก ณ ที่จ่าย (%)</label>
                  <input className="in mono" id="wht" inputMode="decimal" value={doc.whtRate} onChange={(e) => set('whtRate', Number(e.target.value) || 0)} />
                  <span className="hint">หมวดนี้แนะนำ {catInfo?.wht ?? 0}% · อู่เป็นผู้หักและนำส่งเอง</span></div>
                {doc.expenseCat === 'asset' ? (
                  <div className="field"><label htmlFor="life">อายุการใช้งาน (ปี)</label>
                    <input className="in mono" id="life" inputMode="numeric" value={doc.assetLifeYears ?? 5}
                           onChange={(e) => set('assetLifeYears', Math.max(1, Number(e.target.value) || 1))} />
                    <span className="hint">ใช้คิดค่าเสื่อมราคาในอนาคต — ระบบยังไม่คำนวณให้</span></div>
                ) : null}
              </div>
            ) : null}
            <div className="row-fields f3" style={{ marginTop: 10 }}>
              <div className="field"><label>เงื่อนไขชำระเงิน</label>
                <select className="in amber" value={doc.creditDays > 0 ? 'credit' : 'cash'}
                        onChange={(e) => set('creditDays', e.target.value === 'credit' ? Math.max(doc.creditDays, 30) : 0)}>
                  <option value="cash">เงินสด</option><option value="credit">เครดิต</option>
                </select></div>
              <div className="field"><label htmlFor="creditDays">กำหนดชำระ (วัน)</label>
                <input className="in mono amber" id="creditDays" inputMode="numeric" value={doc.creditDays}
                       onChange={(e) => set('creditDays', Math.max(0, Number(e.target.value) || 0))} /></div>
              <div className="field"><label>วันครบกำหนด <span className="hint">พิมพ์ วว/ดด/ปป หรือกดปฏิทิน</span></label>
                <ThaiDateField value={doc.creditDays > 0 ? dueDate : ''} style={{ background: '#FFF3CC', borderColor: '#F0C24A', fontWeight: 600 }}
                               onChange={(iso) => set('creditDays', Math.max(0, Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(doc.docDate + 'T00:00:00').getTime()) / 86400000)))} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= รายการ ================= */}
      <div className={`card${state.field === 'items' ? ' bad' : ''}`}>
        <header>
          <h2>{isPurchase ? 'รายการสินค้า' : 'รายการค่าใช้จ่าย'}</h2>
          <div className="spacer" />
          <span className="subtle">{isPurchase ? 'เฉพาะบรรทัดที่ผูกทะเบียนสินค้าเท่านั้นที่จะเข้าสต๊อก' : ''} · {realItems.length} บรรทัด</span>
        </header>

        {isPurchase ? <ScanBox onScan={onScan} /> : null}

        {notFound ? (
          <div className="body" style={{ paddingBottom: 0 }}>
            <div className="note" style={{ background: '#FCF1F1', borderColor: '#EEC4C4' }}>
              ยิงแล้วไม่พบบาร์โค้ด <b className="mono">{notFound}</b> ในทะเบียนสินค้า
              <div className="tag-row" style={{ marginTop: 8 }}>
                <a className="btn" target="_blank" rel="noreferrer" href={`/stock/new?barcode=${encodeURIComponent(notFound)}`}>เพิ่มเป็นสินค้าใหม่ (เปิดแท็บใหม่)</a>
                <button className="btn" type="button" onClick={() => setNotFound('')}>ปิด</button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="tablewrap">
          <table className="tbl lines picked">
            <thead><tr>
              <th className="idx">ลำดับ</th>
              {isPurchase ? <th>รหัสสินค้า</th> : null}
              <th>{isPurchase ? 'ชื่อสินค้า' : 'รายการ'}</th>
              <th className="num">จำนวน</th>
              <th>หน่วย</th>
              <th className="num">{isPurchase ? 'ราคาซื้อ/หน่วย' : 'ราคา/หน่วย'}</th>
              <th className="num">ส่วนลด %</th>
              <th className="num">จำนวนเงิน</th>
              {isPurchase ? <th>วันหมดอายุ</th> : null}
              <th />
            </tr></thead>
            <tbody>
              {doc.items.map((it, i) => (
                <BuyLineRow key={i} i={i} item={it} isPurchase={isPurchase} isLast={i === doc.items.length - 1}
                            onChange={(patch) => setItem(i, patch)} onPick={(p) => fillRow(i, p, it.qty || 1)}
                            onRemove={() => removeRow(i)} onEnterLast={() => addRow()} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
          <button className="btn" type="button" onClick={() => addRow()}>+ เพิ่มบรรทัด</button>
          <span className="subtle">เคล็ดลับ: กด Enter ที่บรรทัดสุดท้ายเพื่อเพิ่มบรรทัดใหม่{isPurchase ? ' · ในช่องรหัส Enter = เลือกผลค้นหาตัวแรก' : ''}</span>
        </div>
      </div>

      {/* ================= หมายเหตุ | สรุปยอด ================= */}
      <div className="docgrid">
        <div className="card">
          <header><h2>หมายเหตุเอกสาร</h2></header>
          <div className="body">
            <div className="field"><label>หมายเหตุ</label>
              <textarea className="in" value={doc.note} placeholder="เช่น อ้างอิงใบสั่งซื้อ / เงื่อนไขการส่งมอบ" onChange={(e) => set('note', e.target.value)} /></div>
            {isPurchase ? (
              <label className="tag-row" style={{ fontSize: 14, marginTop: 12 }}>
                <input type="checkbox" checked={doc.goodsReceived} onChange={(e) => set('goodsReceived', e.target.checked)} />
                รับของเข้าสต๊อกแล้ว — อะไหล่ที่ผูกทะเบียนจะถูกบวกเข้าคงเหลือ และราคาซื้อล่าสุดอัปเดตตามใบนี้
              </label>
            ) : null}
          </div>
        </div>

        <div className="card sumbox">
          <header><h2>สรุปยอด</h2><div className="spacer" />
            <span className="chip">{doc.vatMode === 'none' ? 'ไม่มีภาษีมูลค่าเพิ่ม' : doc.vatMode === 'in' ? 'ราคารวมภาษีแล้ว' : `ภาษีมูลค่าเพิ่ม ${vatRate}%`}</span></header>
          <div className="body">
            <div className="row"><span className="lbl">รวมเป็นเงิน{doc.vatMode !== 'none' ? ' (ก่อนภาษี)' : ''}</span><span>{baht(t.sub)}</span></div>
            <div className="row">
              <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                ส่วนลดท้ายบิล
                <input className="in mono" inputMode="decimal" style={{ width: 96, textAlign: 'right' }}
                       value={doc.discountMode === 'pct' ? (doc.discountPct ?? 0) : doc.discount}
                       onChange={(e) => { const v = Number(e.target.value) || 0;
                         if (doc.discountMode === 'pct') set('discountPct', Math.min(100, Math.max(0, v))); else set('discount', Math.max(0, v)); }} />
                <span className="pctswitch" role="group" aria-label="หน่วยส่วนลด">
                  {(['pct', 'baht'] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={doc.discountMode === m} onClick={() => set('discountMode', m)}>{m === 'pct' ? '%' : 'บาท'}</button>
                  ))}
                </span>
              </span>
              <span>{effDiscount > 0 ? `−${baht(effDiscount)}` : baht(0)}</span>
            </div>
            {doc.vatMode !== 'none' ? (<>
              <div className="row"><span className="lbl">มูลค่าก่อนภาษี</span><span>{baht(t.net)}</span></div>
              <div className="row"><span className="lbl">ภาษีมูลค่าเพิ่ม {vatRate}%</span><span>{baht(t.vat)}</span></div>
            </>) : null}
            <div className="row grand"><span>รวมทั้งสิ้น</span><span>{baht(t.grand)}</span></div>
            {t.wht > 0 ? (<>
              <div className="row"><span className="lbl">หัก ณ ที่จ่าย {doc.whtRate}%</span><span>−{baht(t.wht)}</span></div>
              <div className="row grand"><span>ยอดที่ต้องจ่ายจริง</span><span>{baht(t.payable)}</span></div>
            </>) : null}
            <div className="subtle" style={{ fontSize: 12.5, marginTop: 4 }}>({bahttext(t.payable)})</div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <div className="tag-row" style={{ marginBottom: 8 }}><b>การจ่ายเงิน</b>
                <span className="subtle">{paidNow > EPS ? `จ่ายแล้ว ${baht(paidNow)} · ` : ''}{remain > EPS ? <b style={{ color: 'var(--warn)' }}>ค้างชำระ {baht(remain)} (ตั้งเป็นเจ้าหนี้)</b> : 'จ่ายครบแล้ว'}</span></div>
              <div className="row-fields f3">
                {['เงินสด', 'เงินโอน', 'บัตรเครดิต'].map((method) => {
                  const at = doc.payments.findIndex((p) => p.method === method);
                  const amount = at >= 0 ? doc.payments[at]!.amount : 0;
                  return (
                    <div className="field" key={method}><label>{method}</label>
                      <input className="in mono" id={`bpay-${method}`} inputMode="decimal" value={amount || ''} placeholder="0.00"
                             onChange={(e) => { const v = Number(e.target.value) || 0;
                               setDoc((d) => { const rest = d.payments.filter((p) => p.method !== method);
                                 const ref = d.payments.find((p) => p.method === method)?.ref ?? '';
                                 return { ...d, payments: v > 0 ? [...rest, { method, amount: v, ref }] : rest }; }); }} />
                    </div>
                  );
                })}
              </div>
              <div className="tag-row" style={{ marginTop: 10 }}>
                <button className="btn sm" type="button" onClick={() => setDoc((d) => ({ ...d, payments: [{ method: 'เงินสด', amount: t.payable, ref: '' }] }))}>จ่ายสดเต็มจำนวน</button>
                <button className="btn sm" type="button" onClick={() => setDoc((d) => ({ ...d, payments: [{ method: 'เงินโอน', amount: t.payable, ref: '' }] }))}>โอนเต็มจำนวน</button>
                <button className="btn sm" type="button" onClick={() => { setDoc((d) => ({ ...d, payments: [{ method: 'เงินสด', amount: 0, ref: '' }] })); setTimeout(() => (document.getElementById('bpay-เงินสด') as HTMLInputElement | null)?.focus(), 0); }}>ชำระบางส่วน — กรอกยอด</button>
                <button className="btn sm" type="button" onClick={() => setDoc((d) => ({ ...d, payments: [] }))}>ยังไม่จ่าย (ตั้งเป็นเจ้าหนี้)</button>
              </div>
            </div>

            <div className="formbar" style={{ marginTop: 14 }}>
              <button className="btn primary" type="button" onClick={() => { setPrintAfter(false); tryConfirm(); }}>{mode === 'new' ? `บันทึก${title}` : 'บันทึกการแก้ไข'}</button>
              {initial.id ? <Link className="btn amber" href={`/expense/${initial.id}/print`} target="_blank" rel="noreferrer">🖨 พิมพ์เอกสาร</Link>
                : <button className="btn amber" type="button" onClick={() => { setPrintAfter(true); tryConfirm(); }}>🖨 พิมพ์เอกสาร</button>}
              {precheck ? <span className="chip due" role="alert">{precheck}</span> : null}
              <Link className="btn" href="/expense">ยกเลิก</Link>
            </div>
          </div>
        </div>
      </div>

      <ConfirmSave open={confirm} title={title} lines={confirmLines}
                   submitLabel={mode === 'new' ? 'บันทึก' : 'บันทึกการแก้ไข'} onEdit={() => setConfirm(false)} />
    </form>
  );
}
