'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ThaiDateInput } from '@/components/thai-date-input';
import { shrink } from '@/components/pic-shrink';
import { bahtText, type Quote } from '@/lib/billing';
import { checkSignup, formatTaxId, PREFIXES, type CustomerType } from '@/lib/signup-core';
import { todayIso } from '@/lib/license-window';
import { submitSignupAction } from './actions';

/** สลิปต้องอ่านตัวเลขเล็ก ๆ ออก — ด้านยาวและคุณภาพสูงกว่ารูปสินค้า แต่ยังไม่เกิน 1 MB */
const SLIP_EDGE = 1600;
const SLIP_QUALITY = 0.8;

interface Props {
  provinces: readonly string[];
  price: { perYear: number; vatRate: number; whtRate: number };
  quotes: { plain: Quote; wht: Quote };
  vendor: { name: string; bank: string; accountName: string; accountNo: string; lineId: string; line: string };
}

/** กรอบช่องกรอก — ข้อความผิดของช่องนั้นอยู่ใต้ช่องเสมอ */
function F({ name, label, req, hint, err, wide, children }: {
  name: string; label: string; req?: boolean; hint?: React.ReactNode; err?: string;
  wide?: 2 | 3 | 4 | 6; children: React.ReactNode;
}) {
  return (
    <div className={`su-f c${wide ?? 6}${err ? ' bad' : ''}`} data-k={name}>
      <label className="su-lbl" htmlFor={name}>{label}{req ? <span className="su-req" /> : null}</label>
      {children}
      {hint ? <div className="su-hint">{hint}</div> : null}
      {err ? <div className="su-msg" role="alert">{err}</div> : null}
    </div>
  );
}

function Opt({ name, value, title, sub, checked, onPick }: {
  name: string; value: string; title: string; sub?: string; checked: boolean; onPick: (v: string) => void;
}) {
  return (
    <label className={checked ? 'su-opt on' : 'su-opt'}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onPick(value)} />
      <span><b>{title}</b>{sub ? <small>{sub}</small> : null}</span>
    </label>
  );
}

/** แนบรูป — ย่อที่เบราว์เซอร์ก่อนส่ง แล้วถือไว้ใน state จนกดส่ง (ช่องไฟล์จริงไม่มี name จึงไม่ถูกส่งดิบ) */
function Attach({ id, label, req, hint, err, file, onFile }: {
  id: string; label: string; req?: boolean; hint?: string; err?: string;
  file: { blob: Blob; url: string } | null; onFile: (f: { blob: Blob; url: string } | null, err?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <F name={id} label={label} req={req} hint={hint} err={err}>
      <div className="su-attach">
        {file ? <img src={file.url} alt={label} /> : null}
        <label className="btn" htmlFor={`${id}-pick`} aria-disabled={busy}>
          {busy ? 'กำลังย่อรูป…' : file ? 'เปลี่ยนรูป' : 'เลือกรูป'}
        </label>
        <input id={`${id}-pick`} type="file" accept="image/*" className="su-file"
               onChange={async (e) => {
                 const f = e.target.files?.[0];
                 e.target.value = '';
                 if (!f) return;
                 setBusy(true);
                 try {
                   const blob = await shrink(f, SLIP_EDGE, SLIP_QUALITY);
                   if (file) URL.revokeObjectURL(file.url);
                   onFile({ blob, url: URL.createObjectURL(blob) });
                 } catch {
                   onFile(null, 'เปิดไฟล์รูปนี้ไม่ได้ — ลองบันทึกภาพหน้าจอสลิปแล้วแนบใหม่');
                 } finally {
                   setBusy(false);
                 }
               }} />
        {file ? <button type="button" className="btn ghost" onClick={() => { URL.revokeObjectURL(file.url); onFile(null); }}>เอาออก</button> : null}
      </div>
    </F>
  );
}

export function SignupForm({ provinces, price, quotes, vendor }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [ctype, setCtype] = useState<CustomerType | ''>('');
  const [vat, setVat] = useState('');
  const [branch, setBranch] = useState('');
  const [wht, setWht] = useState('');
  const [taxId, setTaxId] = useState('');
  const [slip, setSlip] = useState<{ blob: Blob; url: string } | null>(null);
  const [cert, setCert] = useState<{ blob: Blob; url: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState('');
  const [done, setDone] = useState<{ email: string; wht: boolean; cert: boolean } | null>(null);
  const [pending, start] = useTransition();

  const juristic = ctype === 'juristic';
  const q = juristic && wht === 'yes' ? quotes.wht : quotes.plain;
  const taxReq = juristic || vat === 'yes';

  /* ข้อผิดพลาดหายเมื่อแก้ช่องนั้น — ไม่ต้องรอกดส่งใหม่ */
  const clear = (k: string) => setErrors((e) => {
    if (!e[k]) return e;
    const { [k]: _gone, ...rest } = e;
    return rest;
  });

  useEffect(() => () => { if (slip) URL.revokeObjectURL(slip.url); }, [slip]);

  const scrollToFirst = (errs: Record<string, string>) => {
    const first = [...(formRef.current?.querySelectorAll<HTMLElement>('[data-k]') ?? [])]
      .find((el) => errs[el.dataset.k!]);
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const check = checkSignup((k) => String(fd.get(k) ?? ''));
    const errs: Record<string, string> = check.ok ? {} : { ...check.errors };
    if (!slip) errs.slip = 'กรุณาแนบรูปสลิปการโอนเงิน';
    if (Object.keys(errs).length) {
      setErrors(errs);
      setAlert(`ยังมีข้อมูลที่ต้องแก้ไข ${Object.keys(errs).length} รายการ กรุณาตรวจสอบช่องที่มีกรอบสีแดง`);
      scrollToFirst(errs);
      return;
    }

    fd.set('slip', new File([slip!.blob], 'slip.jpg', { type: 'image/jpeg' }));
    if (cert) fd.set('wht_cert', new File([cert.blob], 'wht.jpg', { type: 'image/jpeg' }));
    start(async () => {
      const r = await submitSignupAction(fd);
      if (r.ok) {
        setDone({ email: String(fd.get('c_email') ?? ''), wht: juristic && wht === 'yes', cert: !!cert });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setErrors(r.errors ?? {});
      setAlert(r.error ?? 'ส่งใบสมัครไม่สำเร็จ');
      if (r.errors) scrollToFirst(r.errors);
    });
  };

  if (done) {
    return (
      <section className="card su-card su-done" aria-live="polite">
        <h2><span className="su-num">✓</span>ได้รับใบสมัครและหลักฐานการโอนแล้ว</h2>
        <ol className="su-steps">
          <li>ทีมงานตรวจยอดเงินเข้าบัญชีภายใน 1 วันทำการ</li>
          <li>เมื่ออนุมัติแล้ว ทีมงานจะส่ง<b>ลิงก์ตั้งรหัสผ่าน</b>ไปที่ <b>{done.email}</b> — ใช้อีเมลนี้เข้าสู่ระบบ</li>
          {done.wht && !done.cert
            ? <li>อย่าลืมส่ง<b>หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</b> ให้ทีมงานทาง LINE {vendor.lineId}</li>
            : null}
        </ol>
        <p className="su-sub">
          สอบถามได้ที่ LINE Official <a href={vendor.line} target="_blank" rel="noopener noreferrer">{vendor.lineId}</a>
        </p>
      </section>
    );
  }

  const prov = (name: string) => (
    <select className="in" id={name} name={name} defaultValue="" onChange={() => clear(name)}>
      <option value="">— เลือก —</option>
      {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
  const text = (name: string, max: number, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="in" id={name} name={name} maxLength={max} autoComplete="off"
           onChange={() => clear(name)} {...extra} />
  );

  return (
    <form ref={formRef} autoComplete="off" noValidate onSubmit={onSubmit}>
      {/* ช่องกับดักบอต — คนมองไม่เห็นและกดไปไม่ถึง */}
      <input className="su-trap" name="website" tabIndex={-1} aria-hidden="true" autoComplete="off" />

      <section className="card su-card">
        <h2><span className="su-num">1</span>ประเภทผู้สมัคร</h2>
        <p className="su-sub">เลือกให้ตรงกับผู้ที่จะมีชื่อในใบกำกับภาษี</p>
        <div className="su-grid">
          <F name="ctype" label="สถานะผู้สมัคร" req err={errors.ctype}>
            <div className="su-opts">
              <Opt name="ctype" value="juristic" title="นิติบุคคล" sub="บริษัทจำกัด / ห้างหุ้นส่วนจำกัด / ห้างหุ้นส่วนสามัญนิติบุคคล"
                   checked={ctype === 'juristic'} onPick={(v) => { setCtype(v as CustomerType); clear('ctype'); }} />
              <Opt name="ctype" value="person" title="บุคคลธรรมดา" sub="เจ้าของร้าน / อู่ ที่ไม่ได้จดทะเบียนเป็นนิติบุคคล"
                   checked={ctype === 'person'} onPick={(v) => { setCtype(v as CustomerType); clear('ctype'); }} />
            </div>
          </F>
          <F name="vat" label="จดทะเบียนภาษีมูลค่าเพิ่ม (VAT) หรือไม่" req err={errors.vat}
             hint="ใช้ตั้งค่าเริ่มต้นของร้านด้วย — ร้านที่ไม่จดจะออกเอกสารแบบไม่คิด VAT">
            <div className="su-opts">
              <Opt name="vat" value="yes" title="จดทะเบียน VAT แล้ว" sub="มีใบทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.20)"
                   checked={vat === 'yes'} onPick={(v) => { setVat(v); clear('vat'); }} />
              <Opt name="vat" value="no" title="ไม่ได้จดทะเบียน VAT" sub="ไม่มี ภ.พ.20"
                   checked={vat === 'no'} onPick={(v) => { setVat(v); clear('vat'); }} />
            </div>
          </F>
        </div>
      </section>

      <section className="card su-card">
        <h2><span className="su-num">2</span>ข้อมูลสำหรับออกใบกำกับภาษี</h2>
        <p className="su-sub">ชื่อ ที่อยู่ เลขประจำตัวผู้เสียภาษี และสถานประกอบการของผู้รับบริการ</p>
        <div className="su-tip">
          <b>กรอกให้ตรงกับเอกสารทุกตัวอักษร</b>
          <ul>
            <li>ผู้จดทะเบียน VAT: ใช้ชื่อและที่อยู่ตาม <b>ภ.พ.20</b></li>
            <li>นิติบุคคลที่ไม่จด VAT: ใช้ตาม <b>หนังสือรับรองบริษัท</b></li>
            <li>บุคคลธรรมดา: ใช้ชื่อ-นามสกุลตาม <b>บัตรประจำตัวประชาชน</b></li>
          </ul>
        </div>
        <div className="su-grid">
          <F name="prefix" label="คำนำหน้า / ประเภท" req wide={2} err={errors.prefix}>
            {/* key เปลี่ยนตามประเภท — สลับประเภทแล้วค่าที่เลือกไว้ต้องหาย ไม่ใช่ค้างเป็นคำนำหน้าของอีกแบบ */}
            <select key={ctype} className="in" id="prefix" name="prefix" defaultValue="" onChange={() => clear('prefix')}>
              <option value="">{ctype ? '— เลือก —' : '— เลือกประเภทผู้สมัครก่อน —'}</option>
              {(ctype ? PREFIXES[ctype] : []).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </F>
          <F name="name" wide={4} req err={errors.name}
             label={ctype === 'person' ? 'ชื่อ-นามสกุล (ตามบัตรประชาชน)' : ctype === 'juristic' ? 'ชื่อนิติบุคคล (ตามที่จดทะเบียน)' : 'ชื่อผู้รับบริการ'}
             hint={ctype === 'person' ? 'เว้นวรรค 1 ครั้งระหว่างชื่อและนามสกุล' : 'พิมพ์เฉพาะชื่อ ไม่ต้องพิมพ์คำว่า "บริษัท" หรือ "จำกัด" ซ้ำ'}>
            {text('name', 150)}
          </F>
          <F name="taxid" wide={3} req={taxReq} err={errors.taxid}
             label="เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)"
             hint={!taxReq ? 'ไม่บังคับสำหรับผู้ที่ไม่ได้จด VAT — กรอกหากต้องการให้แสดงในเอกสาร'
               : juristic ? 'เลขทะเบียนนิติบุคคล 13 หลัก' : 'เลขบัตรประจำตัวประชาชน 13 หลัก (ตาม ภ.พ.20)'}>
            <input className="in mono" id="taxid" name="taxid" inputMode="numeric" maxLength={17}
                   placeholder="0-0000-00000-00-0" autoComplete="off" value={taxId}
                   onChange={(e) => { setTaxId(formatTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))); clear('taxid'); }} />
          </F>
          {vat === 'no' ? null : (
            <F name="branch" label="สถานประกอบการ" req wide={3} err={errors.branch}>
              <div className="su-opts">
                <Opt name="branch" value="hq" title="สำนักงานใหญ่" checked={branch === 'hq'} onPick={(v) => { setBranch(v); clear('branch'); }} />
                <Opt name="branch" value="br" title="สาขา" checked={branch === 'br'} onPick={(v) => { setBranch(v); clear('branch'); }} />
              </div>
              {branch === 'br' ? (
                <input className="in mono su-brno" name="brno" inputMode="numeric" maxLength={5} autoComplete="off"
                       placeholder="เลขที่สาขา 5 หลัก เช่น 00001" aria-label="เลขที่สาขา" onChange={() => clear('branch')} />
              ) : null}
            </F>
          )}

          <F name="a_no" label="เลขที่" req wide={2} err={errors.a_no}>{text('a_no', 30)}</F>
          <F name="a_moo" label="หมู่ที่" wide={2}>{text('a_moo', 10)}</F>
          <F name="a_room" label="ชั้น / ห้องเลขที่" wide={2}>{text('a_room', 30)}</F>
          <F name="a_bld" label="อาคาร / หมู่บ้าน" wide={3}>{text('a_bld', 80)}</F>
          <F name="a_soi" label="ตรอก / ซอย" wide={3}>{text('a_soi', 60)}</F>
          <F name="a_road" label="ถนน" wide={3}>{text('a_road', 60)}</F>
          <F name="a_sub" label="แขวง / ตำบล" req wide={3} err={errors.a_sub}>{text('a_sub', 60)}</F>
          <F name="a_dist" label="เขต / อำเภอ" req wide={2} err={errors.a_dist}>{text('a_dist', 60)}</F>
          <F name="a_prov" label="จังหวัด" req wide={2} err={errors.a_prov}>{prov('a_prov')}</F>
          <F name="a_zip" label="รหัสไปรษณีย์" req wide={2} err={errors.a_zip}>
            {text('a_zip', 5, { inputMode: 'numeric', className: 'in mono' })}
          </F>

          <F name="inv_email" label="อีเมลสำหรับรับใบกำกับภาษี / ใบเสร็จ" req wide={3} err={errors.inv_email}>
            {text('inv_email', 120, { type: 'email', inputMode: 'email' })}
          </F>
          {juristic ? (
            <F name="wht" label={`หักภาษี ณ ที่จ่าย ${price.whtRate}% หรือไม่`} req wide={3} err={errors.wht}>
              <div className="su-opts">
                <Opt name="wht" value="yes" title={`หัก ${price.whtRate}%`} checked={wht === 'yes'} onPick={(v) => { setWht(v); clear('wht'); }} />
                <Opt name="wht" value="no" title="ไม่หัก" checked={wht === 'no'} onPick={(v) => { setWht(v); clear('wht'); }} />
              </div>
            </F>
          ) : null}
        </div>
      </section>

      <section className="card su-card">
        <h2><span className="su-num">3</span>ข้อมูลร้าน / อู่ และผู้ติดต่อ</h2>
        <p className="su-sub">ใช้ตั้งค่าระบบและติดต่อกลับเพื่อเปิดใช้งาน</p>
        <div className="su-grid">
          <F name="shop" label="ชื่อร้าน / อู่ (ชื่อที่แสดงในระบบ)" req wide={4} err={errors.shop}>{text('shop', 100)}</F>
          <F name="shop_prov" label="จังหวัดที่ตั้งร้าน" req wide={2} err={errors.shop_prov}>{prov('shop_prov')}</F>
          <F name="c_name" label="ชื่อ-นามสกุล ผู้ติดต่อ" req wide={3} err={errors.c_name}>{text('c_name', 100)}</F>
          <F name="c_pos" label="ตำแหน่ง" wide={3}>{text('c_pos', 60, { placeholder: 'เช่น เจ้าของร้าน / ผู้จัดการ' })}</F>
          <F name="c_tel" label="เบอร์มือถือ" req wide={3} err={errors.c_tel}>
            {text('c_tel', 12, { type: 'tel', inputMode: 'numeric', placeholder: '08x-xxx-xxxx', className: 'in mono' })}
          </F>
          <F name="c_email" label="อีเมลผู้ดูแลระบบ (ใช้เข้าสู่ระบบ)" req wide={3} err={errors.c_email}
             hint="ลิงก์ตั้งรหัสผ่านจะส่งไปที่อีเมลนี้">
            {text('c_email', 120, { type: 'email', inputMode: 'email' })}
          </F>
        </div>
      </section>

      <section className="card su-card">
        <h2><span className="su-num">4</span>ชำระค่าบริการ</h2>
        <p className="su-sub">โอนเงินเข้าบัญชีด้านล่าง แล้วแนบสลิป — ทีมงานตรวจยอดเข้าบัญชีก่อนเปิดใช้งาน</p>
        <div className="su-pay">
          <table className="su-quote">
            <tbody>
              <tr><th>ค่าบริการ DriveGoLight! 1 ปี</th><td>{bahtText(q.base)}</td></tr>
              <tr><th>ภาษีมูลค่าเพิ่ม {price.vatRate}%</th><td>{bahtText(q.vat)}</td></tr>
              {q.wht ? <tr><th>หัก ณ ที่จ่าย {price.whtRate}%</th><td>−{bahtText(q.wht)}</td></tr> : null}
              <tr className="tot"><th>ยอดที่ต้องโอน</th><td>{bahtText(q.total)} บาท</td></tr>
            </tbody>
          </table>
          <div className="su-bank">
            <div className="t">โอนเข้าบัญชี</div>
            <div>{vendor.bank}</div>
            <div className="no mono">{vendor.accountNo}</div>
            <div>{vendor.accountName}</div>
          </div>
        </div>
        {q.wht ? (
          <div className="su-tip">
            หักภาษี ณ ที่จ่ายแล้ว กรุณาส่ง<b>หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</b> ในนาม {vendor.name}
            {' '}— แนบด้านล่างได้เลย หรือส่งทาง LINE {vendor.lineId} ภายหลัง
          </div>
        ) : null}
        <div className="su-grid">
          <F name="paid_amount" label="ยอดที่โอน (บาท)" req wide={2} err={errors.paid_amount}
             hint={errors.paid_amount ? undefined : `ยอดที่ต้องโอน ${bahtText(q.total)}`}>
            {text('paid_amount', 12, { inputMode: 'decimal', className: 'in mono', placeholder: bahtText(q.total) })}
          </F>
          <F name="paid_at" label="วันที่และเวลาที่โอน (ตามสลิป)" req wide={4} err={errors.paid_at}>
            <div className="su-when">
              <ThaiDateInput name="paid_date" defaultIso={todayIso()} ariaLabel="วันที่โอน" />
              <input className="in mono" name="paid_time" inputMode="numeric" maxLength={5} placeholder="ชม:นาที"
                     aria-label="เวลาที่โอน" autoComplete="off" onChange={() => clear('paid_at')} />
            </div>
          </F>
          <Attach id="slip" label="สลิปการโอนเงิน" req err={errors.slip} file={slip}
                  hint="รูปหรือภาพหน้าจอสลิปจากแอปธนาคาร"
                  onFile={(f, err) => { setSlip(f); setErrors((e) => { const { slip: _s, ...rest } = e; return err ? { ...rest, slip: err } : rest; }); }} />
          {q.wht ? (
            <Attach id="wht_cert" label="หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)" err={errors.wht_cert} file={cert}
                    hint="ไม่บังคับ — ส่งภายหลังได้"
                    onFile={(f, err) => { setCert(f); setErrors((e) => { const { wht_cert: _w, ...rest } = e; return err ? { ...rest, wht_cert: err } : rest; }); }} />
          ) : null}
        </div>
      </section>

      <section className="card su-card">
        <h2><span className="su-num">5</span>ยืนยันข้อมูล</h2>
        <div className={errors.ok1 ? 'su-f bad' : 'su-f'} data-k="ok1">
          <label className="su-chk">
            <input type="checkbox" name="ok1" onChange={() => clear('ok1')} />
            <span>ข้าพเจ้ายืนยันว่าชื่อ ที่อยู่ เลขประจำตัวผู้เสียภาษี และสถานประกอบการข้างต้น <b>ถูกต้องตรงตามเอกสารจดทะเบียน</b> และยินยอมให้ใช้ข้อมูลนี้ออกใบกำกับภาษี</span>
          </label>
          {errors.ok1 ? <div className="su-msg" role="alert">{errors.ok1}</div> : null}
        </div>
        <div className={errors.ok2 ? 'su-f bad' : 'su-f'} data-k="ok2">
          <label className="su-chk">
            <input type="checkbox" name="ok2" onChange={() => clear('ok2')} />
            <span>ข้าพเจ้ายินยอมให้ {vendor.name} เก็บ ใช้ และประมวลผลข้อมูลส่วนบุคคลเพื่อการสมัคร ให้บริการ และออกเอกสารทางภาษี ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (<a href="/privacy" target="_blank" rel="noopener">อ่านนโยบาย</a>)</span>
          </label>
          {errors.ok2 ? <div className="su-msg" role="alert">{errors.ok2}</div> : null}
        </div>
      </section>

      {alert ? <div className="err su-alert" role="alert">{alert}</div> : null}
      <div className="su-actions">
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? 'กำลังส่งใบสมัคร…' : 'ส่งใบสมัคร'}
        </button>
      </div>
    </form>
  );
}
