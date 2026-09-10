'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveShopAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { ShopSettings } from '@/lib/settings';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : 'บันทึกข้อมูลร้าน'}
    </button>
  );
}

export function ShopForm({ shop }: { shop: ShopSettings }) {
  const [state, action] = useActionState<FormResult, FormData>(saveShopAction, {});
  const [logo, setLogo] = useState(shop.logoUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const bad = (f: string) => (state.field === f ? 'field bad' : 'field');
  const v = (name: string, fallback: string | number) =>
    state.values?.[name] ?? String(fallback);

  const pickLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  };

  return (
    <form className="form" action={action}>
      <input type="hidden" name="logoUrl" value={logo} />

      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">บันทึกข้อมูลร้านเรียบร้อย</div> : null}

      <div className={bad('name')}>
        <label htmlFor="name">ชื่อร้าน *</label>
        <input className="in" id="name" name="name" required defaultValue={v('name', shop.name)} />
        <span className="hint">ชื่อนี้ขึ้นหัวเอกสารทุกใบ</span>
      </div>

      <div className="row-fields f3">
        <div className={bad('taxId')}>
          <label htmlFor="taxId">เลขประจำตัวผู้เสียภาษี</label>
          <input className="in mono" id="taxId" name="taxId" inputMode="numeric"
                 defaultValue={v('taxId', shop.taxId)} placeholder="13 หลัก" />
        </div>
        <div className="field">
          <label htmlFor="tel">โทรศัพท์</label>
          <input className="in mono" id="tel" name="tel" defaultValue={v('tel', shop.tel)} />
        </div>
        <div className="field">
          <label htmlFor="tel2">โทรศัพท์สำรอง</label>
          <input className="in mono" id="tel2" name="tel2" defaultValue={v('tel2', shop.tel2)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="addrText">ที่อยู่ร้าน</label>
        <textarea className="in" id="addrText" name="addrText" defaultValue={v('addrText', shop.addrText)} />
      </div>

      <div className="row-fields f3">
        <div className={bad('vatRate')}>
          <label htmlFor="vatRate">ภาษีมูลค่าเพิ่ม (%)</label>
          <input className="in mono" id="vatRate" name="vatRate" inputMode="decimal"
                 defaultValue={v('vatRate', shop.vatRate)} />
          <span className="hint">มีผลกับเอกสารที่ออกใหม่เท่านั้น ใบเก่าเก็บอัตราเดิมไว้แล้ว</span>
        </div>
        <div className="field">
          <label htmlFor="whtRate">หัก ณ ที่จ่ายตั้งต้น (%)</label>
          <input className="in mono" id="whtRate" name="whtRate" inputMode="decimal"
                 defaultValue={v('whtRate', shop.whtRate)} />
        </div>
        <div className="field">
          <label htmlFor="priceTier">ระดับราคาตั้งต้น</label>
          <select className="in" id="priceTier" name="priceTier" defaultValue={v('priceTier', shop.priceTier)}>
            <option value="A">A — ราคาปกติ</option>
            <option value="B">B — ลูกค้าประจำ</option>
            <option value="C">C — ราคาพิเศษ</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="proposerName">ชื่อผู้เสนอราคาตั้งต้น</label>
        <input className="in" id="proposerName" name="proposerName"
               defaultValue={v('proposerName', shop.proposerName)} />
      </div>

      <div className="field">
        <label htmlFor="warrantyText">ข้อความรับประกันตั้งต้น</label>
        <textarea className="in" id="warrantyText" name="warrantyText"
                  defaultValue={v('warrantyText', shop.warrantyText)}
                  placeholder="เช่น รับประกันงานซ่อม 3 เดือน หรือ 5,000 กิโลเมตร แล้วแต่อย่างใดถึงก่อน" />
        <span className="hint">เติมให้อัตโนมัติตอนออกใบเสร็จ แก้รายใบได้</span>
      </div>

      {/* ---------- บัญชีธนาคาร ---------- */}
      <div className="field" style={{ marginTop: 4 }}>
        <label>บัญชีรับโอนเงิน</label>
        <span className="hint" style={{ display: 'block', marginBottom: 8 }}>
          พิมพ์ลงบนใบเสร็จและใบวางบิล ให้ลูกค้ารู้ว่าจะโอนไปที่ไหน —
          ไม่กรอกก็ได้ กระดาษจะเว้นเส้นไว้ให้เขียนด้วยมือแทน
        </span>
        <div className="row-fields f3">
          <div className="field">
            <label htmlFor="bankName">ธนาคาร</label>
            <input className="in" id="bankName" name="bankName"
                   defaultValue={v('bankName', shop.bankName)} placeholder="เช่น กสิกรไทย" />
          </div>
          <div className="field">
            <label htmlFor="bankAccountNo">เลขที่บัญชี</label>
            <input className="in mono" id="bankAccountNo" name="bankAccountNo"
                   defaultValue={v('bankAccountNo', shop.bankAccountNo)} placeholder="xxx-x-xxxxx-x" />
          </div>
          <div className="field">
            <label htmlFor="bankAccountName">ชื่อบัญชี</label>
            <input className="in" id="bankAccountName" name="bankAccountName"
                   defaultValue={v('bankAccountName', shop.bankAccountName)}
                   placeholder="ชื่อเจ้าของบัญชี" />
          </div>
        </div>
      </div>

      {/* ---------- โลโก้ ---------- */}
      <div className={bad('logo')}>
        <label>โลโก้บนหัวเอกสาร</label>
        <div className="tag-row">
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt="โลโก้ร้าน"
                 style={{ width: 64, height: 64, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6 }} />
          ) : (
            <div style={{ width: 64, height: 64, border: '1px dashed var(--line)', borderRadius: 6,
                          display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--ink-3)' }}>
              ไม่มี
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                 style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); }} />
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>เลือกรูป</button>
          {logo ? <button className="btn" type="button" onClick={() => setLogo('')}>เอาออก</button> : null}
        </div>
        <span className="hint">
          ไฟล์ไม่เกิน 200 KB · เก็บฝังไว้ในฐานข้อมูลของอู่เอง (หนึ่งรูปต่อหนึ่งอู่)
          ถ้าวันหนึ่งย้ายไปเก็บบน object storage ก็แค่เปลี่ยนค่าในช่องเดิมเป็นลิงก์ ไม่ต้องแก้โครงสร้าง
        </span>
      </div>

      <div className="formbar"><Submit /></div>
    </form>
  );
}
