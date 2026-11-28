import 'server-only';
import { query } from './auth';
import { assertPlusWith } from './plan-core';
import {
  payTaxWith, vatInWith, vatOutWith, whtCertForDocWith, whtCertForEmployeeWith, whtPaidWith,
  type PayTaxReport, type TaxDocKey, type VatReport, type WhtCert, type WhtReport,
} from './tax-core';

export * from './tax-core';

/**
 * เอกสารภาษี (06.7) — ผูกกับ session · หน้าที่เรียกต้อง requireTab('finance', 'tax') เองก่อน
 * ทุกตัวตรวจแพ็กเกจ Plus ในทรานแซกชันเดียวกับการอ่าน
 */

export type TaxReport =
  | { key: 'vat-out' | 'vat-in'; vat: VatReport }
  | { key: 'pnd3' | 'pnd53'; wht: WhtReport }
  | { key: 'pnd1' | 'sso'; pay: PayTaxReport };

export async function getTaxReport(key: TaxDocKey, month: string): Promise<TaxReport> {
  return query(async (c) => {
    await assertPlusWith(c);
    switch (key) {
      case 'vat-out': return { key, vat: await vatOutWith(c, month) };
      case 'vat-in': return { key, vat: await vatInWith(c, month) };
      case 'pnd3': case 'pnd53': return { key, wht: await whtPaidWith(c, month, key) };
      case 'pnd1': return { key, pay: await payTaxWith(c, month, 'payDate') };
      default: return { key, pay: await payTaxWith(c, month, 'period') };
    }
  });
}

export async function getWhtCertForDoc(docId: string): Promise<WhtCert | null> {
  return query(async (c) => { await assertPlusWith(c); return whtCertForDocWith(c, docId); });
}

export async function getWhtCertForEmployee(employeeId: string, year: number): Promise<WhtCert | null> {
  return query(async (c) => { await assertPlusWith(c); return whtCertForEmployeeWith(c, employeeId, year); });
}
