import 'server-only';
import { withoutTenant } from './db';
import type { PicMime } from './pics-core';
import type { SignupValue } from './signup-core';

export interface Attached {
  mime: PicMime;
  bytes: Buffer;
}

/**
 * ส่งใบสมัครเข้าฐานข้อมูล — ผ่าน ops.submit_signup เท่านั้น แอปไม่มีสิทธิ์แตะตารางตรง
 * ยอดที่ต้องโอน (amountDue) มาจาก checkSignup() ฝั่งเซิร์ฟเวอร์ ไม่ใช่จากหน้าเว็บ
 */
export async function submitSignup(
  v: SignupValue, slip: Attached, whtCert: Attached | null, ip: string | null,
): Promise<string> {
  const payload = {
    ctype: v.ctype,
    vat_registered: v.vatRegistered,
    bill_name: v.billName,
    tax_id: v.taxId ?? '',
    branch_no: v.branchNo ?? '',
    bill_addr: v.billAddr,
    bill_addr_text: v.billAddrText,
    bill_email: v.billEmail,
    wht: v.wht,
    shop_name: v.shopName,
    shop_province: v.shopProvince,
    contact_name: v.contactName,
    contact_pos: v.contactPos,
    contact_tel: v.contactTel,
    owner_email: v.ownerEmail,
    amount_paid: v.amountPaid.toFixed(2),
    paid_at: v.paidAt,
  };
  return withoutTenant(async (c) => {
    const { rows } = await c.query(
      `select ops.submit_signup($1, $2, $3, $4, $5, $6, $7) as id`,
      [JSON.stringify(payload), v.amountDue.toFixed(2), slip.mime, slip.bytes,
       whtCert?.mime ?? null, whtCert?.bytes ?? null, ip],
    );
    return rows[0].id as string;
  });
}
