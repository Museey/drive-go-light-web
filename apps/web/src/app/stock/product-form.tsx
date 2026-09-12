'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { genBarcode } from '@drivegolight/core';
import { saveProductAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { Category, ProductRow } from '@/lib/products';

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

export function ProductForm({
  product, categories, presetBarcode,
}: {
  product: ProductRow | null;
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

      <div className="row-fields f3">
        <div className={bad('barcode')}>
          <label htmlFor="barcode">บาร์โค้ด</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="in mono" id="barcode" name="barcode" value={barcode}
                   onChange={(e) => setBarcode(e.target.value.toUpperCase())}
                   placeholder="ว่างได้ — ใช้ยิงเข้าใบตรวจนับ" />
            <button className="btn" type="button" onClick={() => setBarcode(genBarcode())}>
              สร้างให้
            </button>
          </div>
          <span className="hint">
            {product && barcode
              ? <a href={`/stock/${product.id}/barcode`} style={{ textDecoration: 'underline' }}>
                  พิมพ์ฉลากบาร์โค้ด
                </a>
              : 'ยิงเข้าใบตรวจนับได้ทันทีเมื่อมีบาร์โค้ด'}
          </span>
        </div>
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
          </select>
          <span className="hint">จัดการหมวดหมู่ได้ที่หน้าทะเบียนสินค้า</span>
        </div>
        <div className="field">
          <label htmlFor="lastCost">ทุนล่าสุด (บาท)</label>
          <input className="in mono" id="lastCost" name="lastCost" inputMode="decimal"
                 defaultValue={v('lastCost', product?.lastCost ?? 0)} />
          <span className="hint">อัปเดตอัตโนมัติเมื่อบันทึกใบซื้อ</span>
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
