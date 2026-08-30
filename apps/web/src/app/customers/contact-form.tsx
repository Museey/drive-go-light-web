'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveContactAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { Contact, Vehicle } from '@/lib/contacts';

const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี',
  'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง',
  'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์',
  'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
  'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก',
  'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร',
  'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย',
  'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว',
  'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย',
  'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
];

const BRANDS = [
  'Toyota', 'Honda', 'Isuzu', 'Nissan', 'Mitsubishi', 'Mazda', 'Ford', 'Chevrolet', 'Suzuki',
  'Subaru', 'Hyundai', 'Kia', 'MG', 'Great Wall (GWM)', 'Haval', 'BYD', 'Neta', 'Changan',
  'Chery', 'Wuling', 'Benz', 'BMW', 'Volvo', 'Hino', 'Fuso', 'Scania',
];

const emptyVehicle = (): Vehicle => ({
  brand: '', model: '', year: '', color: '',
  plateA: '', plateB: '', plateProvince: '',
  engineNo: '', chassisNo: '', mileage: '',
});

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : label}
    </button>
  );
}

export function ContactForm({
  contact, defaultCode, defaultKind,
}: {
  contact: Contact | null;
  defaultCode: string;
  defaultKind: 'customer' | 'vendor';
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveContactAction, {});
  const [type, setType] = useState<'person' | 'company'>(contact?.type ?? 'person');
  const [kind, setKind] = useState<'customer' | 'vendor'>(contact?.kind ?? defaultKind);
  const [vehicles, setVehicles] = useState<Vehicle[]>(
    contact?.vehicles?.length ? contact.vehicles : [],
  );

  const isNew = !contact;
  const bad = (f: string) => (state.field === f ? 'field bad' : 'field');

  /**
   * ค่าที่ผู้ใช้เพิ่งกรอกมาชนะเสมอ — ฟอร์มนี้ยาว พิมพ์ใหม่ทั้งหมดไม่ไหว
   * ต้องใช้กับช่องของรถด้วย เพราะค่าที่พิมพ์อยู่ใน DOM เท่านั้น
   * พอ React วาดใหม่หลัง action ค่าจะกลับไปเป็นของใน state ซึ่งเป็นแถวเปล่า
   */
  const val = (name: string, fallback: string | number | undefined) =>
    state.values?.[name] ?? (fallback === undefined ? '' : String(fallback));

  return (
    <form className="form" action={action}>
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="kind" value={kind} />

      {state.error ? <div className="err">{state.error}</div> : null}

      {/* ---------- ชนิดผู้ติดต่อ ---------- */}
      <div className="row-fields f2">
        <div className="field">
          <label>บันทึกเป็น</label>
          <div className="tag-row">
            {(['customer', 'vendor'] as const).map((k) => (
              <button key={k} type="button" className="btn"
                      onClick={() => setKind(k)}
                      style={kind === k ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
                {k === 'customer' ? 'ลูกค้า' : 'ผู้ขาย'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>ประเภท</label>
          <div className="tag-row">
            {(['person', 'company'] as const).map((t) => (
              <button key={t} type="button" className="btn"
                      onClick={() => setType(t)}
                      style={type === t ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
                {t === 'person' ? 'บุคคลธรรมดา' : 'นิติบุคคล'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- ชื่อ ---------- */}
      {type === 'company' ? (
        <div className={bad('orgName')}>
          <label htmlFor="orgName">ชื่อบริษัท / ห้างหุ้นส่วน *</label>
          <input className="in" id="orgName" name="orgName" defaultValue={val('orgName', contact?.orgName)} />
        </div>
      ) : (
        <div className="row-fields f3">
          <div className="field">
            <label htmlFor="prefix">คำนำหน้า</label>
            <input className="in" id="prefix" name="prefix" defaultValue={val('prefix', contact?.prefix ?? 'นาย')}
                   list="prefixes" />
            <datalist id="prefixes">
              <option value="นาย" /><option value="นาง" /><option value="นางสาว" />
              <option value="ว่าที่ ร.ต." /><option value="ดร." />
            </datalist>
          </div>
          <div className={bad('firstName')}>
            <label htmlFor="firstName">ชื่อ *</label>
            <input className="in" id="firstName" name="firstName" defaultValue={val('firstName', contact?.firstName)} />
          </div>
          <div className="field">
            <label htmlFor="lastName">นามสกุล</label>
            <input className="in" id="lastName" name="lastName" defaultValue={val('lastName', contact?.lastName)} />
          </div>
        </div>
      )}

      {type === 'company' ? null : <input type="hidden" name="orgName" value="" />}

      <div className="row-fields f3">
        <div className={bad('code')}>
          <label htmlFor="code">รหัสผู้ติดต่อ *</label>
          <input className="in mono" id="code" name="code" required
                 defaultValue={val('code', contact?.code ?? defaultCode)} />
        </div>
        <div className={bad('taxId')}>
          <label htmlFor="taxId">เลขประจำตัวผู้เสียภาษี</label>
          <input className="in mono" id="taxId" name="taxId" inputMode="numeric" maxLength={20}
                 defaultValue={val('taxId', contact?.taxId)} placeholder="13 หลัก" />
          <span className="hint">ต้องมีถ้าจะออกใบกำกับภาษีให้รายนี้</span>
        </div>
        <div className="field">
          <label htmlFor="creditDays">เครดิต (วัน)</label>
          <input className="in mono" id="creditDays" name="creditDays" inputMode="numeric"
                 defaultValue={val('creditDays', contact?.creditDays ?? 0)} />
        </div>
      </div>

      <div className="row-fields f3">
        <div className="field">
          <label htmlFor="tel">โทรศัพท์</label>
          <input className="in mono" id="tel" name="tel" defaultValue={val('tel', contact?.tel)} />
        </div>
        <div className="field">
          <label htmlFor="tel2">โทรศัพท์สำรอง</label>
          <input className="in mono" id="tel2" name="tel2" defaultValue={val('tel2', contact?.tel2)} />
        </div>
        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input className="in" id="email" name="email" type="email" defaultValue={val('email', contact?.email)} />
        </div>
      </div>

      {/* ---------- ที่อยู่ ---------- */}
      <div className="field">
        <label style={{ fontWeight: 600, color: 'var(--ink)' }}>ที่อยู่</label>
      </div>
      <div className="row-fields f4">
        <div className="field">
          <label htmlFor="addr_no">บ้านเลขที่</label>
          <input className="in" id="addr_no" name="addr_no" defaultValue={val('addr_no', contact?.addr.no)} />
        </div>
        <div className="field">
          <label htmlFor="addr_village">หมู่บ้าน / อาคาร</label>
          <input className="in" id="addr_village" name="addr_village" defaultValue={val('addr_village', contact?.addr.village)} />
        </div>
        <div className="field">
          <label htmlFor="addr_moo">หมู่ที่</label>
          <input className="in" id="addr_moo" name="addr_moo" defaultValue={val('addr_moo', contact?.addr.moo)} />
        </div>
        <div className="field">
          <label htmlFor="addr_soi">ซอย</label>
          <input className="in" id="addr_soi" name="addr_soi" defaultValue={val('addr_soi', contact?.addr.soi)} />
        </div>
      </div>
      <div className="row-fields f4">
        <div className="field">
          <label htmlFor="addr_road">ถนน</label>
          <input className="in" id="addr_road" name="addr_road" defaultValue={val('addr_road', contact?.addr.road)} />
        </div>
        <div className="field">
          <label htmlFor="addr_subdistrict">แขวง / ตำบล</label>
          <input className="in" id="addr_subdistrict" name="addr_subdistrict" defaultValue={val('addr_subdistrict', contact?.addr.subdistrict)} />
        </div>
        <div className="field">
          <label htmlFor="addr_district">เขต / อำเภอ</label>
          <input className="in" id="addr_district" name="addr_district" defaultValue={val('addr_district', contact?.addr.district)} />
        </div>
        <div className="field">
          <label htmlFor="addr_province">จังหวัด</label>
          <input className="in" id="addr_province" name="addr_province" list="provinces"
                 defaultValue={val('addr_province', contact?.addr.province)} />
          <datalist id="provinces">
            {PROVINCES.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
      </div>
      <div className="row-fields f4">
        <div className="field">
          <label htmlFor="addr_zip">รหัสไปรษณีย์</label>
          <input className="in mono" id="addr_zip" name="addr_zip" inputMode="numeric" maxLength={5}
                 defaultValue={val('addr_zip', contact?.addr.zip)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="addrText">ที่อยู่แบบพิมพ์เอง</label>
        <textarea className="in" id="addrText" name="addrText" defaultValue={val('addrText', contact?.addrText)}
                  placeholder="ใช้เมื่ออยากพิมพ์ที่อยู่เต็มเองแทนการกรอกแยกช่อง" />
        <span className="hint">ถ้ากรอกช่องนี้ ระบบจะใช้ข้อความนี้บนเอกสารแทนที่อยู่ที่กรอกแยกช่อง</span>
      </div>

      {/* ---------- รถ ---------- */}
      <div className="field" style={{ marginTop: 8 }}>
        <label style={{ fontWeight: 600, color: 'var(--ink)' }}>
          รถที่ดูแล {vehicles.length > 0 ? `(${vehicles.length} คัน)` : ''}
        </label>
      </div>

      {vehicles.map((v, i) => (
        <div className="veh" key={v.id ?? `new-${i}`}>
          <header>
            <b>คันที่ {i + 1}</b>
            <div className="spacer" />
            <button type="button" className="btn danger"
                    onClick={() => setVehicles(vehicles.filter((_, j) => j !== i))}>
              เอาออก
            </button>
          </header>

          {v.id ? <input type="hidden" name={`veh[${i}][id]`} value={v.id} /> : null}

          <div className="row-fields f4">
            <div className="field">
              <label>ยี่ห้อ</label>
              <input className="in" name={`veh[${i}][brand]`} defaultValue={val(`veh[${i}][brand]`, v.brand)} list="brands" />
            </div>
            <div className="field">
              <label>รุ่น</label>
              <input className="in" name={`veh[${i}][model]`} defaultValue={val(`veh[${i}][model]`, v.model)} />
            </div>
            <div className="field">
              <label>ปี</label>
              <input className="in mono" name={`veh[${i}][year]`} defaultValue={val(`veh[${i}][year]`, v.year)} placeholder="พ.ศ." />
            </div>
            <div className="field">
              <label>สี</label>
              <input className="in" name={`veh[${i}][color]`} defaultValue={val(`veh[${i}][color]`, v.color)} />
            </div>
          </div>

          <div className="row-fields f4">
            <div className="field">
              <label>ทะเบียน (หมวด)</label>
              <input className="in mono" name={`veh[${i}][plateA]`} defaultValue={val(`veh[${i}][plateA]`, v.plateA)} placeholder="กข" />
            </div>
            <div className="field">
              <label>ทะเบียน (เลข)</label>
              <input className="in mono" name={`veh[${i}][plateB]`} defaultValue={val(`veh[${i}][plateB]`, v.plateB)} placeholder="1234" />
            </div>
            <div className="field">
              <label>จังหวัด</label>
              <input className="in" name={`veh[${i}][plateProvince]`} defaultValue={val(`veh[${i}][plateProvince]`, v.plateProvince)} list="provinces" />
            </div>
            <div className="field">
              <label>เลขไมล์</label>
              <input className="in mono" name={`veh[${i}][mileage]`} defaultValue={val(`veh[${i}][mileage]`, v.mileage)} inputMode="numeric" />
            </div>
          </div>

          <div className="row-fields f2">
            <div className="field">
              <label>เลขเครื่องยนต์</label>
              <input className="in mono" name={`veh[${i}][engineNo]`} defaultValue={val(`veh[${i}][engineNo]`, v.engineNo)} />
            </div>
            <div className="field">
              <label>เลขตัวถัง</label>
              <input className="in mono" name={`veh[${i}][chassisNo]`} defaultValue={val(`veh[${i}][chassisNo]`, v.chassisNo)} />
            </div>
          </div>
        </div>
      ))}

      <datalist id="brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>

      <div>
        <button type="button" className="btn" onClick={() => setVehicles([...vehicles, emptyVehicle()])}>
          + เพิ่มรถ
        </button>
      </div>

      <div className="field">
        <label htmlFor="note">หมายเหตุ</label>
        <textarea className="in" id="note" name="note" defaultValue={val('note', contact?.note)}
                  placeholder="เช่น ลูกค้าประจำ ใช้ราคาระดับ B · หัก ณ ที่จ่าย 3%" />
      </div>

      <div className="formbar">
        <Submit label={isNew ? 'เพิ่มผู้ติดต่อ' : 'บันทึกการแก้ไข'} />
        <Link className="btn" href="/customers">ยกเลิก</Link>
      </div>
    </form>
  );
}
