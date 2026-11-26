'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ThaiDateInput } from '@/components/thai-date-input';
import type { FormResult } from '@/lib/mutate';
import { EMP_TYPES } from '@/lib/payroll-calc';
import type { Employee } from '@/lib/payroll-core';
import { saveEmployeeAction } from '../../actions';

/** ฟอร์มพนักงาน — บันทึกไม่ผ่านแล้วค่าที่กรอกยังอยู่ครบ (state.values) */
export function EmployeeForm({ employee, code, mayEdit }: {
  employee: Employee | null; code: string; mayEdit: boolean;
}) {
  const [state, action, pending] = useActionState<FormResult, FormData>(saveEmployeeAction, {});
  const v = state.values ?? {};
  const bad = (f: string) => (state.field === f ? 'field bad' : 'field');
  /* หลังบันทึกไม่ผ่าน ช่องติ๊กต้องตามที่ผู้ใช้เลือกไว้ ไม่ใช่กลับไปค่าเดิมของทะเบียน */
  const sso = state.values ? v.ssoEnabled === 'on' : (employee?.ssoEnabled ?? true);

  return (
    <form autoComplete="off" className="form card" action={action} style={{ padding: 16 }}>
      <input type="hidden" name="id" value={employee?.id ?? ''} />
      {state.error ? <div className="err" role="alert">{state.error}</div> : null}

      <div className="row-fields f4">
        <div className={bad('code')}>
          <label htmlFor="code">รหัสพนักงาน *</label>
          <input className="in mono" id="code" name="code" defaultValue={v.code ?? code} required readOnly={!mayEdit} />
        </div>
        <div className={bad('name')} style={{ gridColumn: 'span 2' }}>
          <label htmlFor="name">ชื่อ-นามสกุล *</label>
          <input className="in" id="name" name="name" defaultValue={v.name ?? employee?.name ?? ''} required readOnly={!mayEdit} />
        </div>
        <div className="field">
          <label htmlFor="position">ตำแหน่ง</label>
          <input className="in" id="position" name="position" defaultValue={v.position ?? employee?.position ?? ''}
                 placeholder="เช่น ช่างยนต์" readOnly={!mayEdit} />
        </div>
      </div>

      <div className="row-fields f4">
        <div className="field">
          <label htmlFor="empType">ประเภทการจ้าง</label>
          <select className="in" id="empType" name="empType" defaultValue={v.empType ?? employee?.empType ?? 'full'} disabled={!mayEdit}>
            {EMP_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="startedOn">วันเริ่มงาน</label>
          <ThaiDateInput id="startedOn" name="startedOn" defaultIso={v.startedOn ?? employee?.startedOn ?? ''} disabled={!mayEdit} full />
        </div>
        <div className={bad('taxId')}>
          <label htmlFor="taxId">เลขประจำตัวผู้เสียภาษี</label>
          <input className="in mono" id="taxId" name="taxId" inputMode="numeric" maxLength={17}
                 defaultValue={v.taxId ?? employee?.taxId ?? ''} placeholder="13 หลัก" readOnly={!mayEdit} />
        </div>
        <div className="field">
          <label htmlFor="tel">เบอร์โทร</label>
          <input className="in mono" id="tel" name="tel" inputMode="tel" defaultValue={v.tel ?? employee?.tel ?? ''} readOnly={!mayEdit} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="addrText">ที่อยู่ (ขึ้นบนหนังสือรับรอง 50 ทวิ)</label>
        <input className="in" id="addrText" name="addrText" defaultValue={v.addrText ?? employee?.addrText ?? ''} readOnly={!mayEdit} />
      </div>

      <div className="row-fields f4">
        <div className={bad('baseSalary')}>
          <label htmlFor="baseSalary">เงินเดือน (บาท/เดือน) *</label>
          <input className="in mono amber" id="baseSalary" name="baseSalary" inputMode="decimal" style={{ textAlign: 'right' }}
                 defaultValue={v.baseSalary ?? employee?.baseSalary ?? 0} readOnly={!mayEdit} />
        </div>
        <div className={bad('whtRate')}>
          <label htmlFor="whtRate">หักภาษี ณ ที่จ่าย (%)</label>
          <input className="in mono" id="whtRate" name="whtRate" inputMode="decimal" style={{ textAlign: 'right' }}
                 defaultValue={v.whtRate ?? employee?.whtRate ?? 0} readOnly={!mayEdit} />
        </div>
        <div className="field">
          <label htmlFor="bankName">ธนาคาร</label>
          <input className="in" id="bankName" name="bankName" defaultValue={v.bankName ?? employee?.bankName ?? ''} readOnly={!mayEdit} />
        </div>
        <div className="field">
          <label htmlFor="bankAccountNo">เลขที่บัญชี</label>
          <input className="in mono" id="bankAccountNo" name="bankAccountNo"
                 defaultValue={v.bankAccountNo ?? employee?.bankAccountNo ?? ''} readOnly={!mayEdit} />
        </div>
      </div>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" name="ssoEnabled" defaultChecked={sso} disabled={!mayEdit} />
        หักเงินสมทบประกันสังคม (5% ของเงินเดือน สูงสุด 875 บาท/เดือน)
      </label>
      <span className="hint">
        อัตราหักภาษีเป็นอัตราคงที่ที่ใช้เสนอยอดในงวดเงินเดือน — ภาษีเงินเดือนจริงขึ้นกับค่าลดหย่อนของแต่ละคน
        ใส่ 0 ได้ถ้าเงินได้ไม่ถึงเกณฑ์เสียภาษี หรือให้สำนักงานบัญชีกำหนด
      </span>

      <div className="field">
        <label htmlFor="note">หมายเหตุ</label>
        <input className="in" id="note" name="note" defaultValue={v.note ?? employee?.note ?? ''} readOnly={!mayEdit} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {mayEdit ? (
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? 'กำลังบันทึก…' : 'บันทึกพนักงาน'}
          </button>
        ) : null}
        <Link className="btn" href="/finance/payroll/employees">ยกเลิก</Link>
      </div>
    </form>
  );
}
