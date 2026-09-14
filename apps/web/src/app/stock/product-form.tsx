'use client';

import { BARCODE_TYPES, COST_METHODS, barcodeSVGFor, genCode128FromCode, genEan13, validateBarcode, type BarcodeType } from '@drivegolight/core';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveProductAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { Category, ProductRow, ProductSupplier } from '@/lib/products';
import { useLiveSearch } from '@/components/use-live-search';
import { searchVendorsAction } from '../expense/actions';

function Submit({ label }: {
  /** บาร์โค้ดตั้งต้นสำหรับสินค้าใหม่ที่มาจากการยิงแล้วไม่เจอ */
  presetBarcode?: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : label}
    </button>
  );
}

/**
 * ช่องชื่อหมวดใหม่ — โผล่เมื่อเลือก "+ เพิ่มหมวดหมู่…" ในช่องหมวด
 * ฟังการเปลี่ยนของ select ข้างบนผ่าน DOM เพราะฟอร์มนี้เป็น uncontrolled (defaultValue)
 */
function NewCategoryBox() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const sel = document.getElementById('categoryId') as HTMLSelectElement | null;
    if (!sel) return;
    const sync = () => setShow(sel.value === '__new__');
    sync();
    sel.addEventListener('change', sync);
    return () => sel.removeEventListener('change', sync);
  }, []);
  if (!show) return null;
  return (
    <input className="in" name="newCategory" placeholder="ชื่อหมวดหมู่ใหม่" autoFocus
           style={{ marginTop: 6 }} aria-label="ชื่อหมวดหมู่ใหม่" />
  );
}

/**
 * ผู้ขายของสินค้า — การ์ดเล็กใต้วันหมดอายุ (ผู้ใช้กำหนด)
 * ค้นจากทะเบียนผู้ขายแบบสด (5 ชื่อ เกินเลื่อน) หรือ "+ เพิ่มรายชื่อเอง"
 * ชื่อที่พิมพ์เองเก็บกับสินค้าใบนี้เท่านั้น ไม่เข้าทะเบียนผู้ขาย · หนึ่งสินค้ามีได้หลายผู้ขาย
 */
function SupplierPicker({ initial }: { initial: ProductSupplier[] }) {
  const [list, setList] = useState<ProductSupplier[]>(initial);
  const [q, setQ] = useState('');
  const { results, busy, clear } = useLiveSearch(q, searchVendorsAction);
  const add = (sp: ProductSupplier) => {
    const name = sp.name.trim();
    if (!name || list.some((x) => (sp.vendorId && x.vendorId === sp.vendorId) || x.name === name)) { setQ(''); clear(); return; }
    setList([...list, { vendorId: sp.vendorId, name }]);
    setQ(''); clear();
  };
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <header><h2 style={{ fontSize: 14 }}>ผู้ขายของสินค้านี้</h2><div className="spacer" /><span className="subtle">มีได้หลายราย</span></header>
      <div className="body" style={{ padding: 12 }}>
        <input type="hidden" name="suppliers" value={JSON.stringify(list)} />
        {list.length ? (
          <div className="tag-row" style={{ marginBottom: 8 }}>
            {list.map((sp, i) => (
              <span key={i} className={`chip${sp.vendorId ? ' ok' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 13 }}
                    title={sp.vendorId ? 'จากทะเบียนผู้ขาย' : 'พิมพ์เอง — เก็บกับสินค้านี้เท่านั้น'}>
                {sp.name}{sp.vendorId ? '' : ' (พิมพ์เอง)'}
                <button type="button" aria-label="เอาออก" onClick={() => setList(list.filter((_, j) => j !== i))}
                        style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>✕</button>
              </span>
            ))}
          </div>
        ) : <div className="hint" style={{ marginBottom: 8 }}>ยังไม่ระบุผู้ขาย</div>}
        <div className="tag-row">
          <input className="in search" value={q} placeholder="กรอกคำค้นหา — ชื่อหรือรหัสผู้ขาย" style={{ flex: 1, minWidth: 200 }}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (results?.[0]) add({ vendorId: results[0].id, name: results[0].name }); else if (q.trim()) add({ vendorId: null, name: q }); } }} />
          <button className="btn" type="button" disabled={!q.trim()} onClick={() => add({ vendorId: null, name: q })}>+ เพิ่มรายชื่อเอง</button>
          {busy ? <span className="subtle">กำลังค้น…</span> : null}
        </div>
        {results ? (
          <div className="tablewrap hits5" style={{ marginTop: 8, border: '1px solid var(--line)', borderRadius: 8 }}>
            <table className="tbl"><tbody>
              {results.length === 0 ? (
                <tr><td className="subtle">ไม่พบในทะเบียนผู้ขาย — กด "+ เพิ่มรายชื่อเอง" ได้</td></tr>
              ) : results.map((v) => (
                <tr key={v.id} className="pick" role="button" tabIndex={0} onClick={() => add({ vendorId: v.id, name: v.name })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add({ vendorId: v.id, name: v.name }); } }}>
                  <td className="mono">{v.code}</td><td className="wrap">{v.name}</td><td className="mono">{v.tel || '-'}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ) : null}
        <span className="hint">ชื่อที่พิมพ์เองไม่เข้าทะเบียนผู้ขาย — ถ้าจะซื้อประจำให้เพิ่มที่ 02.0 + เพิ่มผู้ติดต่อ</span>
      </div>
    </div>
  );
}

export function ProductForm({
  product, categories, presetBarcode, suppliers,
}: {
  product: ProductRow | null;
  suppliers?: ProductSupplier[];
  categories: Category[];
  /** บาร์โค้ดตั้งต้นสำหรับสินค้าใหม่ที่มาจากการยิงแล้วไม่เจอ */
  presetBarcode?: string;
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveProductAction, {});
  const isNew = !product;
  const bad = (f: string) => (state.field === f ? 'field bad' : 'field');

  /** ค่าที่ผู้ใช้เพิ่งกรอกมาชนะเสมอ ไม่งั้นบันทึกไม่ผ่านทีเดียวต้องพิมพ์ใหม่หมด */
  const v = (name: string, fallback: string | number | undefined) =>
    state.values?.[name] ?? (fallback === undefined ? '' : String(fallback));

  /* บาร์โค้ดที่ยิงมาจากหน้าออกเอกสารแล้วไม่เจอ — เติมให้เลยจะได้ไม่ต้องพิมพ์ซ้ำ
     และไม่ต้องเสี่ยงพิมพ์ผิดจนยิงกลับไปแล้วยังไม่เจออีก */
  const [barcode, setBarcode] = useState(v('barcode', product?.barcode ?? presetBarcode));
  const [bType, setBType] = useState<BarcodeType | 'AUTO'>((product?.barcodeType as BarcodeType | undefined) ?? 'AUTO');
  const bcheck = validateBarcode(barcode, bType);

  return (
    <form className="form" action={action}>
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="row-fields f3">
        <div className={bad('code')}>
          <label htmlFor="code">รหัสสินค้า *</label>
          <input className="in mono" id="code" name="code" required
                 defaultValue={v('code', product?.code)} placeholder="เช่น BRK-001" />
        </div>
        <div className="field">
          <label htmlFor="oem">รหัส OEM</label>
          <input className="in mono" id="oem" name="oem" defaultValue={v('oem', product?.oem)}
                 placeholder="รหัสของผู้ผลิต" />
        </div>
        <div className="field">
          <label htmlFor="unit">หน่วยนับ</label>
          <input className="in" id="unit" name="unit" defaultValue={v('unit', product?.unit)}
                 placeholder="ชิ้น · ชุด · ลิตร" />
        </div>
      </div>

      {/* ---------- บาร์โค้ด: รองรับ UPC-A · EAN-13/8 · Code 39 · Code 128 ----------
          ยิงจากเครื่องอ่านลงช่องนี้ได้ตรง ๆ (สินค้ามีบาร์โค้ดจากโรงงานอยู่แล้ว)
          หรือกด "สร้างให้" ระบบออก EAN-13 ใช้ในร้าน (นำหน้า 20) / Code 128 จากรหัสสินค้า
          ตรวจเลขตรวจสอบทันทีตอนพิมพ์ — ผิดตั้งแต่ตรงนี้ดีกว่าไปรู้ตอนยิงไม่ติดหน้าร้าน */}
      <div className={bad('barcode')} style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="barcode">บาร์โค้ด</label>
        <div className="row-fields f3">
          <select className="in" name="barcodeType" value={bType} onChange={(e) => setBType(e.target.value as typeof bType)}>
            <option value="AUTO">ระบบ: ตรวจให้อัตโนมัติ</option>
            {BARCODE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label} — {t.desc}</option>)}
          </select>
          <input className="in mono" id="barcode" name="barcode" value={barcode} inputMode="text"
                 style={{ borderColor: barcode && !bcheck.ok ? 'var(--due)' : barcode && bcheck.ok ? 'var(--ok)' : undefined }}
                 onChange={(e) => setBarcode(e.target.value)}
                 placeholder="ยิงจากเครื่องอ่าน หรือพิมพ์ — ว่างได้" />
          <div className="tag-row">
            <button className="btn" type="button" title="EAN-13 ใช้ในร้าน นำหน้า 20 พร้อมเลขตรวจสอบ"
                    onClick={() => { setBarcode(genEan13()); setBType('EAN13'); }}>สร้าง EAN-13</button>
            <button className="btn" type="button" title="Code 128 จากรหัสสินค้า ยิงแล้วได้รหัสร้านตรง ๆ"
                    onClick={() => { const el = document.getElementById('code') as HTMLInputElement | null; setBarcode(genCode128FromCode(el?.value || product?.code || '')); setBType('CODE128'); }}>สร้างจากรหัส</button>
          </div>
        </div>
        <span className="hint" style={{ color: barcode && !bcheck.ok ? 'var(--due)' : undefined }}>
          {barcode
            ? (bcheck.ok
                ? <>ตรวจแล้ว: <b>{BARCODE_TYPES.find((t) => t.key === bcheck.type)?.label}</b>{bcheck.type === 'CODE39' ? ' (ตัวพิมพ์ใหญ่)' : ''}
                    {product ? <> · <a href={`/stock/${product.id}/barcode`} style={{ textDecoration: 'underline' }}>พิมพ์ฉลากบาร์โค้ด</a></> : null}</>
                : bcheck.error)
            : 'ยิงเข้าใบขาย/ใบซื้อ/ใบตรวจนับได้ทันทีเมื่อมีบาร์โค้ด'}
        </span>
        {barcode && bcheck.ok ? (
          <div style={{ maxWidth: 260, marginTop: 6 }} dangerouslySetInnerHTML={{ __html: barcodeSVGFor(barcode, bcheck.type, 240, 46) }} />
        ) : null}
      </div>

      <div className={bad('name')}>
        <label htmlFor="name">ชื่อสินค้า *</label>
        <input className="in" id="name" name="name" required defaultValue={v('name', product?.name)} />
      </div>

      <div className="row-fields f2">
        <div className="field">
          <label htmlFor="categoryId">หมวดหมู่</label>
          <select className="in" id="categoryId" name="categoryId" defaultValue={v('categoryId', product?.categoryId ?? '')}>
            <option value="">— ไม่ระบุหมวดหมู่ —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {/* บรรทัดสุดท้ายเสมอ — เพิ่มหมวดใหม่ได้ตรงนี้ ไม่ต้องออกไปหน้าจัดการหมวด (เจ๊ก ข้อ 11) */}
            <option value="__new__">+ เพิ่มหมวดหมู่อะไหล่…</option>
          </select>
          <NewCategoryBox />
          <span className="hint">จัดการหมวดหมู่ได้ที่หน้าทะเบียนสินค้า</span>
        </div>
        <div className="field">
          <label htmlFor="lastCost">ราคาซื้อล่าสุด (บาท)</label>
          <input className="in mono" id="lastCost" name="lastCost" inputMode="decimal"
                 defaultValue={v('lastCost', product?.lastCost ?? 0)} />
          <span className="hint">อัปเดตอัตโนมัติเมื่อบันทึกใบซื้อ</span>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>วิธีคิดต้นทุนของสินค้านี้</label>
          <div className="tag-row" role="radiogroup" aria-label="วิธีคิดต้นทุน" style={{ gap: 10 }}>
            {COST_METHODS.map((m) => (
              <label key={m.key} className="chip" title={m.desc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="costMethod" value={m.key}
                       defaultChecked={v('costMethod', product?.costMethod ?? 'FEFO') === m.key} />
                {m.label}
              </label>
            ))}
          </div>
          <span className="hint">ตั้งตั้งแต่ตอนเพิ่มสินค้า · FEFO = ของใกล้หมดอายุตัดก่อน (ค่าเริ่มต้น) · FIFO = เข้าก่อนออกก่อน · AVG = ถัวเฉลี่ย</span>
        </div>
      </div>

      <div className="row-fields f3">
        <div className="field">
          <label htmlFor="priceA">ราคาขาย A (บาท)</label>
          <input className="in mono" id="priceA" name="priceA" inputMode="decimal"
                 defaultValue={v('priceA', product?.priceA ?? 0)} />
        </div>
        <div className="field">
          <label htmlFor="priceB">ราคาขาย B</label>
          <input className="in mono" id="priceB" name="priceB" inputMode="decimal"
                 defaultValue={v('priceB', product?.priceB ?? 0)} />
        </div>
        <div className="field">
          <label htmlFor="priceC">ราคาขาย C</label>
          <input className="in mono" id="priceC" name="priceC" inputMode="decimal"
                 defaultValue={v('priceC', product?.priceC ?? 0)} />
        </div>
      </div>

      <div className="row-fields f3">
        <div className="field">
          <label htmlFor="qtyMin">จุดสั่งซื้อ</label>
          <input className="in mono" id="qtyMin" name="qtyMin" inputMode="decimal"
                 defaultValue={v('qtyMin', product?.qtyMin ?? 0)} />
          <span className="hint">คงเหลือต่ำกว่านี้จะขึ้นเตือนที่หน้าแรก</span>
        </div>
        <div className="field">
          <label htmlFor="qtyMax">เก็บสูงสุด</label>
          <input className="in mono" id="qtyMax" name="qtyMax" inputMode="decimal"
                 defaultValue={v('qtyMax', product?.qtyMax ?? 0)} />
        </div>
        {/* อายุการเก็บเป็นตัวช่วยกรอก ไม่ได้ใช้ตัดสินอะไรตอนตัดสต๊อก
            ตัวที่ใช้จริงคือวันหมดอายุของแต่ละล็อตที่รับเข้า */}
        <div className="field">
          <label htmlFor="shelfLifeMonths">อายุการเก็บ (เดือน)</label>
          <input className="in mono" id="shelfLifeMonths" name="shelfLifeMonths"
                 inputMode="numeric"
                 defaultValue={v('shelfLifeMonths', product?.shelfLifeMonths ?? '')} />
          <span className="hint">
            เว้นว่างถ้าของไม่มีวันหมดอายุ · ใส่แล้วระบบเติมวันหมดอายุให้ตอนรับของ
          </span>
        </div>
        {isNew ? (
          <div className="field">
            <label htmlFor="openingQty">ยอดยกมา</label>
            <input className="in mono" id="openingQty" name="openingQty" inputMode="decimal" defaultValue={v('openingQty', 0)} />
            <span className="hint">จำนวนที่มีอยู่ในร้านตอนนี้</span>
            <label htmlFor="openingExpiresOn" style={{ marginTop: 8 }}>วันหมดอายุของยอดยกมา</label>
            <input className="in mono" id="openingExpiresOn" name="openingExpiresOn" type="date"
                   defaultValue={v('openingExpiresOn', '')} />
            <span className="hint">เว้นว่างได้ถ้าของไม่มีวันหมดอายุ</span>
          </div>
        ) : (
          <div className="field">
            <label>คงเหลือปัจจุบัน</label>
            <div className="in mono" style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}>
              {product.qtyOnHand.toLocaleString('en-US')} {product.unit}
            </div>
            <span className="hint">แก้ได้ที่ช่องปรับยอดด้านล่าง</span>
          </div>
        )}
      </div>

      {/* ผู้ขายของสินค้า — ใต้บรรทัดวันหมดอายุ */}
      <SupplierPicker initial={suppliers ?? []} />

      <label className="tag-row" style={{ fontSize: 14 }}>
        <input type="checkbox" name="active" defaultChecked={state.values ? state.values.active === 'on' : (product?.active ?? true)} />
        เปิดใช้งาน — สินค้าที่ปิดจะไม่ขึ้นในรายการให้เลือกตอนออกเอกสาร
      </label>

      <div className="formbar">
        <Submit label={isNew ? 'เพิ่มสินค้า' : 'บันทึกการแก้ไข'} />
        <Link className="btn" href="/stock">ยกเลิก</Link>
      </div>
    </form>
  );
}
