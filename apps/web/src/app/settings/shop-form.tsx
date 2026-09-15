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
  const [banks, setBanks] = useState<{ bank: string; no: string; name: string }[]>(shop.bankAccounts?.length ? shop.bankAccounts : (shop.bankAccountNo ? [{ bank: shop.bankName, no: shop.bankAccountNo, name: shop.bankAccountName }] : []));
  const [sig, setSig] = useState(shop.signatureUrl);
  const sigRef = useRef<HTMLInputElement>(null);
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
    <form autoComplete="off" className="form" action={action}>
      <input type="hidden" name="logoUrl" value={logo} />
      <input type="hidden" name="signatureUrl" value={sig} />

      {state.error ? <div className="err">{state.error}</div> : null}
      {state.ok ? <div className="ok-msg">บันทึกข้อมูลร้านเรียบร้อย</div> : null}

      <div className={bad('name')}>
        <label htmlFor="name">ชื่อร้าน *</label>
        <input className="in" id="name" name="name" required defaultValue={v('name', shop.name)} />
        <span className="hint">ชื่อนี้ขึ้นหัวเอกสารทุกใบ</span>
      </div>
      <div className="field">
        <label htmlFor="ownerName">ชื่อเจ้าของกิจการ</label>
        <input className="in" id="ownerName" name="ownerName" defaultValue={v('ownerName', shop.ownerName)}
               placeholder="พิมพ์ใต้ช่องลงนามบนเอกสาร" />
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

      <div className="field">
        <label htmlFor="noteDefault">หมายเหตุมาตรฐาน</label>
        <textarea className="in" id="noteDefault" name="noteDefault"
                  defaultValue={v('noteDefault', shop.noteDefault)}
                  placeholder="เช่น ยืนราคา 30 วัน · สินค้าซื้อแล้วไม่รับเปลี่ยนคืน" />
        <span className="hint">ขึ้นในช่องหมายเหตุของทุกเอกสารตอนสร้างใหม่ (ใบเสนอราคา ใบส่งมอบ ใบเสร็จ ใบซื้อ ค่าใช้จ่าย) พิมพ์เพิ่มหรือแก้รายใบได้</span>
      </div>


      <div className={bad('expiryWarnDays')} style={{ maxWidth: 260 }}>
        <label htmlFor="expiryWarnDays">เตือนใกล้หมดอายุล่วงหน้า (วัน)</label>
        <input className="in mono" id="expiryWarnDays" name="expiryWarnDays"
               type="number" min={1} max={3650}
               defaultValue={v('expiryWarnDays', String(shop.expiryWarnDays))} />
        <span className="hint">
          อู่ที่ขายของหมุนเร็วตั้ง 30 ก็พอ · อู่ที่เก็บของนานอาจอยากได้ 90
        </span>
      </div>

      {/* ---------- บัญชีรับโอนเงิน — ได้หลายธนาคาร (ผู้ใช้กำหนด) ---------- */}
      <div className="field" style={{ marginTop: 4 }}>
        <label>บัญชีรับโอนเงิน <span className="hint">ตัวแรก = บัญชีหลักที่พิมพ์บนเอกสาร · ตอนรับโอนในใบเสร็จเลือกได้ว่าเข้าบัญชีไหน</span></label>
        <input type="hidden" name="bankAccounts" value={JSON.stringify(banks)} />
        {banks.map((b, i) => (
          <div key={i} className="row-fields f3" style={{ marginBottom: 8, alignItems: 'end' }}>
            <div className="field"><label>ธนาคาร</label>
              <input className="in" value={b.bank} placeholder="เช่น กสิกรไทย" onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, bank: e.target.value } : x)))} /></div>
            <div className="field"><label>เลขที่บัญชี</label>
              <input className="in mono" value={b.no} placeholder="xxx-x-xxxxx-x" onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, no: e.target.value } : x)))} /></div>
            <div className="field"><label>ชื่อบัญชี</label>
              <div className="tag-row"><input className="in" style={{ flex: 1 }} value={b.name} placeholder="ชื่อเจ้าของบัญชี" onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <button className="btn sm" type="button" aria-label="เอาออก" onClick={() => setBanks(banks.filter((_, j) => j !== i))}>✕</button></div></div>
          </div>
        ))}
        <button className="btn" type="button" onClick={() => setBanks([...banks, { bank: '', no: '', name: '' }])}>+ เพิ่มบัญชีธนาคาร</button>
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

      {/* ---------- ลายเซ็นบนเอกสาร ---------- */}
      <div className={bad('signature')}>
        <label>รูปลายเซ็น (พิมพ์ในช่องผู้มีอำนาจลงนามของทุกเอกสาร)</label>
        <div className="tag-row">
          {sig ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={sig} alt="ลายเซ็น" style={{ width: 120, height: 56, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }} />
          ) : (
            <div style={{ width: 120, height: 56, border: '1px dashed var(--line)', borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--ink-3)' }}>ไม่มี</div>
          )}
          <input ref={sigRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setSig(String(r.result ?? '')); r.readAsDataURL(f); }} />
          <button className="btn" type="button" onClick={() => sigRef.current?.click()}>เลือกรูป</button>
          {sig ? <button className="btn" type="button" onClick={() => setSig('')}>เอาออก</button> : null}
        </div>
        <span className="hint">แนะนำ PNG พื้นโปร่ง ไม่เกิน 200 KB · ถ้าไม่ใส่ เอกสารเว้นช่องให้เซ็นมือเหมือนเดิม</span>
      </div>

      <div className="formbar"><Submit /></div>
    </form>
  );
}
