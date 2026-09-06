import Link from 'next/link';
import { can, requireTab } from '@/lib/auth';
import { canEdit, canExport } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { ContactsImport } from './contacts-import';
import { CsvImport } from './csv-import';
import { RestoreForm } from './restore-form';

export const dynamic = 'force-dynamic';

/**
 * 07.3 นำข้อมูลเข้าระบบ
 *
 * เรียงตามรุ่น 6.4 — สามช่องนำเข้าอยู่บนสุด แล้วสำรอง/กู้คืนอยู่ใต้ลงมา
 * ไม่ใช่กลับกัน เพราะการนำเข้าคือสิ่งที่คนเปิดหน้านี้มาทำ
 * ส่วนสำรองข้อมูลเป็นของที่ทำปีละครั้ง
 */
export default async function ImportPage() {
  const session = await requireTab('settings', 'import');

  const seesStock = can(session, 'stock');
  const seesContacts = can(session, 'customer');

  return (
    <Shell
      current="/settings"
      title="นำข้อมูลเข้าระบบ"
      actions={<Link className="btn" href="/settings">← กลับตั้งค่าร้าน</Link>}
    >
      <SubNav menu="settings" current="import">

        {seesStock ? (
          <div className="card">
            <header>
              <h2>สินค้าและอะไหล่</h2>
              <div className="spacer" />
              <span className="hint">นำเข้าได้ครั้งละไม่เกิน 3,000 รายการต่อไฟล์</span>
            </header>
            <div className="body">
              <div className="tag-row" style={{ marginBottom: 14 }}>
                {canExport(session, 'stock', 'list') ? (
                  <a className="btn" href="/stock/csv" download>ดาวน์โหลดข้อมูลสินค้า</a>
                ) : null}
                <a className="btn" href="/stock/csv?template=1" download>
                  ดาวน์โหลดแบบฟอร์มมาตรฐาน
                </a>
              </div>
              <p style={{ marginBottom: 14 }}>
                รหัสสินค้าที่มีอยู่แล้วจะถูก<b>แก้</b> ไม่ใช่สร้างซ้ำ
                ส่วนคอลัมน์คงเหลือมีผลเฉพาะสินค้าที่สร้างใหม่ — ของเดิมไม่แตะ
                เพราะการเขียนทับสต๊อกจากไฟล์จะลบประวัติการเคลื่อนไหวที่สะสมมา
                ถ้าต้องการแก้ยอดคงเหลือ ใช้ช่องปรับยอดที่หน้าสินค้าแทน
              </p>
              {canEdit(session, 'stock', 'list')
                ? <CsvImport />
                : <div className="hint">บัญชีของคุณไม่มีสิทธิ์แก้ทะเบียนสินค้า</div>}
            </div>
          </div>
        ) : null}

        {seesContacts ? (
          <>
            <div className="card">
              <header>
                <h2>ทะเบียนลูกค้า</h2>
                <div className="spacer" />
                <span className="hint">หนึ่งแถวต่อหนึ่งคัน · ลูกค้าหลายคันพิมพ์ชื่อซ้ำได้</span>
              </header>
              <div className="body">
                <div className="tag-row" style={{ marginBottom: 14 }}>
                  {canExport(session, 'customer', 'customer') ? (
                    <a className="btn" href="/contacts/csv?kind=customer" download>
                      ดาวน์โหลดข้อมูลลูกค้า
                    </a>
                  ) : null}
                  <a className="btn" href="/contacts/csv?kind=customer&template=1" download>
                    ดาวน์โหลดแบบฟอร์มมาตรฐาน
                  </a>
                </div>
                <p style={{ marginBottom: 14 }}>
                  จับคู่ลูกค้าเดิมจาก<b>รหัส</b> แล้ว<b>เลขผู้เสียภาษี</b> แล้ว<b>ชื่อ</b> ตามลำดับ
                  ลูกค้าที่มีหลายคันให้พิมพ์ชื่อซ้ำหลายแถว ระบบรวมให้เอง
                  และจับคู่รถคันเดิมจากเลขตัวถังหรือทะเบียน
                </p>
                {canEdit(session, 'customer', 'customer')
                  ? <ContactsImport kind="customer" />
                  : <div className="hint">บัญชีของคุณไม่มีสิทธิ์แก้ทะเบียนลูกค้า</div>}
              </div>
            </div>

            <div className="card">
              <header>
                <h2>ทะเบียนผู้ขาย</h2>
                <div className="spacer" />
                <span className="hint">เพิ่มและปรับปรุงตามรหัสหรือเลขผู้เสียภาษี</span>
              </header>
              <div className="body">
                <div className="tag-row" style={{ marginBottom: 14 }}>
                  {canExport(session, 'customer', 'vendor') ? (
                    <a className="btn" href="/contacts/csv?kind=vendor" download>
                      ดาวน์โหลดข้อมูลผู้ขาย
                    </a>
                  ) : null}
                  <a className="btn" href="/contacts/csv?kind=vendor&template=1" download>
                    ดาวน์โหลดแบบฟอร์มมาตรฐาน
                  </a>
                </div>
                {canEdit(session, 'customer', 'vendor')
                  ? <ContactsImport kind="vendor" />
                  : <div className="hint">บัญชีของคุณไม่มีสิทธิ์แก้ทะเบียนผู้ขาย</div>}
              </div>
            </div>
          </>
        ) : null}

        <div className="card">
          <header><h2>วิธีเตรียมไฟล์</h2></header>
          <div className="body">
            <div className="note" style={{ margin: 0 }}>
              <b>ขั้นตอนที่แนะนำ</b>
              <ol style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
                <li>กดดาวน์โหลดแบบฟอร์มมาตรฐานของข้อมูลที่ต้องการ</li>
                <li>เปิดด้วย Excel แล้วกรอกตามหัวคอลัมน์ — ลบหัวคอลัมน์ไม่ได้ แต่สลับลำดับได้</li>
                <li>บันทึกเป็น <b>CSV UTF-8 (Comma delimited)</b> ที่เมนู บันทึกเป็น ของ Excel</li>
                <li>กลับมากดตรวจไฟล์ ดูสรุป แล้วค่อยกดยืนยัน</li>
              </ol>
              <div style={{ marginTop: 8, color: 'var(--ink-3)' }}>
                ถ้าบันทึกเป็น CSV ธรรมดาที่ไม่ใช่ UTF-8 ภาษาไทยจะกลายเป็นตัวอักษรแปลก ๆ
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <header><h2>สำรองข้อมูลทั้งหมด</h2></header>
          <div className="body">
            <p style={{ marginBottom: 14 }}>
              ดาวน์โหลดข้อมูลทั้งหมดของอู่เป็นไฟล์เดียว — ข้อมูลร้าน สินค้า ลูกค้า รถ
              และเอกสารทุกใบพร้อมรายการและการชำระเงิน
            </p>

            <a className="btn primary" href="/settings/export" download>
              ดาวน์โหลดไฟล์สำรอง (JSON)
            </a>

            <div className="note" style={{ marginTop: 16, marginBottom: 0 }}>
              <b>ไฟล์นี้เป็นรูปแบบเดียวกับโปรแกรมรุ่นไฟล์ HTML</b> ตั้งใจให้เป็นแบบนั้น
              เพราะข้อมูลเป็นของอู่ ไม่ใช่ของเรา — ถ้าวันหนึ่งอยากเลิกใช้เว็บ
              เปิดไฟล์นี้ด้วยโปรแกรมรุ่นเดิมได้ทันที และนำกลับเข้าระบบก็ได้เหมือนกัน
              <br /><br />
              ไฟล์ไม่มีรหัสผ่านของผู้ใช้อยู่ในนั้น แม้แต่แบบที่แฮชแล้ว
              เพราะไฟล์สำรองมักถูกส่งต่อกันทางแชท
            </div>
          </div>
        </div>

        <div className="card">
          <header><h2>กู้คืนข้อมูลจากไฟล์สำรอง</h2></header>
          <div className="body">
            <p style={{ marginBottom: 14 }}>
              นำไฟล์ที่เคยดาวน์โหลดไว้กลับเข้าระบบ ใช้ได้ทั้งไฟล์จากเว็บนี้และไฟล์จากโปรแกรมรุ่น HTML
              ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด
            </p>
            <RestoreForm />
          </div>
        </div>

      </SubNav>
    </Shell>
  );
}
