import Link from 'next/link';
import { requireOperator } from '@/lib/ops-auth';
import { OpsShell } from '../ops-shell';
import { NewShopForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewShopPage() {
  const session = await requireOperator();

  return (
    <OpsShell
      current="/ops"
      email={session.email}
      title="เปิดอู่ใหม่"
      actions={<Link className="btn" href="/ops">← กลับรายชื่ออู่</Link>}
    >
      <div className="card">
        <header><h2>ข้อมูลอู่และเจ้าของ</h2></header>
        <div className="body">
          <NewShopForm />
        </div>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <b>สิ่งที่เกิดขึ้นเมื่อกดเปิด</b> — สร้างอู่ใหม่ · สร้างบัญชีเจ้าของกิจการที่ได้สิทธิ์
        ครบทุกเมนู · ออกลิงก์ตั้งรหัสผ่านให้หนึ่งลิงก์ ทั้งหมดอยู่ในทรานแซกชันเดียว
        ล้มที่ไหนก็ไม่มีอะไรค้าง
        <br /><br />
        ลิขสิทธิ์เริ่มนับช่วงทดลองใช้เองอัตโนมัติ ไม่ต้องบันทึกอะไรเพิ่ม
        <br /><br />
        อู่ที่ย้ายมาจากโปรแกรมรุ่นเดิมและมีไฟล์สำรองอยู่แล้ว ให้เปิดอู่ที่นี่ก่อน
        แล้วให้เจ้าของอู่กู้คืนไฟล์เองที่เมนู 07.3 — ผู้ให้บริการจะได้ไม่ต้องถือไฟล์
        ข้อมูลลูกค้าของเขาไว้ในมือ
      </div>
    </OpsShell>
  );
}
