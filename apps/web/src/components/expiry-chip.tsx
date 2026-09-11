import { daysUntil, STOCK_FLAG_LABEL } from '@drivegolight/core';

/**
 * ป้ายบอกสถานะวันหมดอายุของล็อตหนึ่งล็อต
 *
 * ไม่มี 'use client' และไม่แตะอะไรฝั่งเซิร์ฟเวอร์ จึงใช้ได้ทั้งในหน้าเซิร์ฟเวอร์
 * และในฟอร์มฝั่งผู้ใช้ — ที่เดียวกันทั้งระบบ ป้ายจะได้ไม่เพี้ยนกันคนละหน้า
 *
 * ของที่ยังอยู่ไกลเกินเกณฑ์เตือนไม่ขึ้นป้ายเลย ไม่ใช่ขึ้นป้ายเขียวว่า "ยังดีอยู่" —
 * ป้ายที่ขึ้นทุกแถวคือป้ายที่ไม่มีใครอ่าน
 */
export function ExpiryChip({ expiresOn, today, warnDays }: {
  expiresOn: string;
  today: string;
  warnDays: number;
}) {
  const left = daysUntil(expiresOn, today);
  if (left > warnDays) return null;

  const expired = left < 0;
  return (
    <span className={`chip flag-${expired ? 'expired' : 'expiring'}`}
          title={STOCK_FLAG_LABEL[expired ? 'expired' : 'expiring']}>
      {expired
        ? `หมดอายุแล้ว ${Math.abs(left).toLocaleString('en-US')} วัน`
        : left === 0 ? 'หมดอายุวันนี้' : `อีก ${left.toLocaleString('en-US')} วัน`}
    </span>
  );
}
