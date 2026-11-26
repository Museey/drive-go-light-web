import type { Metadata } from 'next';
import Link from 'next/link';
import { quote } from '@/lib/billing';
import { PROVINCES } from '@/lib/provinces';
import { PRICE, VENDOR } from '@/lib/vendor';
import { SignupForm } from './signup-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'สมัครใช้บริการ — DriveGoLight!',
  description: 'สมัครใช้ระบบบริหารหน้าร้าน DriveGoLight! สำหรับอู่และร้านซ่อมรถ',
};

/**
 * สมัครใช้บริการ — เปิดได้โดยไม่ต้องเข้าสู่ระบบ
 *
 * ย้ายมาจากฟอร์มที่ทีมทำ (`drivego-light-signup-form.html`) ซึ่งให้ลูกค้าคัดลอกข้อความไปส่งเองทาง LINE
 * ตอนนี้ส่งเข้าระบบตรง พร้อมสลิปการโอน แล้วทีมอนุมัติจากคอนโซล (/ops/requests)
 * ดู PLAN-signup-line-2569-11-25.md
 */
export default function SignupPage() {
  return (
    <div className="su">
      <header className="su-head">
        <div className="su-wrap">
          <Link href="/" className="su-logo">DriveGo<em>Light!</em></Link>
          <h1>สมัครใช้บริการระบบบริหารหน้าร้าน</h1>
          <p>
            กรอกข้อมูลให้ตรงกับเอกสารจดทะเบียน เพื่อใช้ออกใบกำกับภาษีเต็มรูปแบบได้ถูกต้อง
            · ช่องที่มี <span className="su-req" /> จำเป็นต้องกรอก
          </p>
        </div>
      </header>

      <main className="su-wrap su-main">
        <SignupForm
          provinces={PROVINCES}
          price={{ perYear: PRICE.perYear, vatRate: PRICE.vatRate, whtRate: PRICE.whtRate }}
          quotes={{ plain: quote(), wht: quote({ wht: true }) }}
          vendor={{
            name: VENDOR.name, bank: VENDOR.bank, accountName: VENDOR.bankAccountName,
            accountNo: VENDOR.bankAccountNo, lineId: VENDOR.lineId, line: VENDOR.line,
          }}
        />
      </main>

      <footer className="su-foot">
        <div className="su-wrap">
          <b>{VENDOR.name}</b><br />
          {VENDOR.addr}<br />
          LINE Official: <a href={VENDOR.line} target="_blank" rel="noopener noreferrer">{VENDOR.lineId}</a>
          {' · '}อีเมล: <a href={`mailto:${VENDOR.email}`}>{VENDOR.email}</a>
          {' · '}<Link href="/privacy">นโยบายข้อมูลส่วนบุคคล</Link>
        </div>
      </footer>
    </div>
  );
}
