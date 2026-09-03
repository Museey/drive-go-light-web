import Link from 'next/link';
import { can, requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { CsvImport } from './csv-import';
import { RestoreForm } from './restore-form';

export const dynamic = 'force-dynamic';

export default async function BackupPage() {
  const session = await requireTab('settings', 'import');
  const seesStock = can(session, 'stock');

  return (
    <Shell
      current="/settings"
      title="สำรองข้อมูลและไฟล์"
      actions={<Link className="btn" href="/settings">← กลับตั้งค่าร้าน</Link>}
    >
      <SubNav menu="settings" current="import">
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

      {seesStock ? (
        <>
          <div className="card">
            <header><h2>ส่งออกทะเบียนสินค้าเป็น CSV</h2></header>
            <div className="body">
              <p style={{ marginBottom: 14 }}>
                เปิดใน Excel ได้เลย ใช้แก้ราคาทีละมาก ๆ แล้วนำกลับเข้ามา
              </p>
              <div className="tag-row">
                <a className="btn" href="/stock/csv" download>ส่งออกสินค้าทั้งหมด</a>
                <a className="btn" href="/stock/csv?template=1" download>ดาวน์โหลดไฟล์ต้นแบบ</a>
              </div>
            </div>
          </div>

          <div className="card">
            <header><h2>นำเข้าสินค้าจาก CSV</h2></header>
            <div className="body">
              <p style={{ marginBottom: 14 }}>
                รหัสสินค้าที่มีอยู่แล้วจะถูก<b>แก้</b> ไม่ใช่สร้างซ้ำ
                ส่วนคอลัมน์คงเหลือมีผลเฉพาะสินค้าที่สร้างใหม่ —
                ของเดิมไม่แตะ เพราะการเขียนทับสต๊อกจากไฟล์จะลบประวัติการเคลื่อนไหวที่สะสมมา
                ถ้าต้องการแก้ยอดคงเหลือ ใช้ช่องปรับยอดที่หน้าสินค้าแทน
              </p>
              <CsvImport />
            </div>
          </div>
        </>
      ) : null}
      </SubNav>
    </Shell>
  );
}
