import Link from 'next/link';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { listUsers, nextUserCode } from '@/lib/settings';
import { UserManager } from './user-manager';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requirePerm('settings');
  const [users, nextCode] = await Promise.all([listUsers(), nextUserCode()]);

  return (
    <Shell
      current="/settings"
      title="ผู้ใช้งานและสิทธิ์"
      sub={`${users.length} คน`}
      actions={<Link className="btn" href="/settings">← กลับตั้งค่าร้าน</Link>}
    >
      <div className="note">
        ระบบยังไม่ส่งอีเมลเอง — กด &quot;ออกลิงก์ตั้งรหัสผ่าน&quot; แล้วส่งลิงก์ให้พนักงานเอง
        ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 7 วัน ออกลิงก์ใหม่แล้วลิงก์เก่าใช้ไม่ได้ทันที
      </div>

      <SubNav menu="settings" current="staff">
      <div className="card">
        <header><h2>รายชื่อผู้ใช้งาน</h2></header>
        <UserManager users={users} nextCode={nextCode} currentUserId={session.userId} />
      </div>

      <div className="card">
        <header><h2>เรื่องที่ควรรู้</h2></header>
        <div className="body">
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-2)', lineHeight: 1.9 }}>
            <li>การซ่อนเมนูไม่ใช่การป้องกัน — ทุกหน้าตรวจสิทธิ์ที่เซิร์ฟเวอร์อีกชั้น พิมพ์ URL ตรงเข้าไปก็ไม่ผ่าน</li>
            <li>ปิดการใช้งานพนักงานแล้ว session ที่ค้างอยู่จะใช้ไม่ได้ทันที ไม่ต้องรอหมดอายุ</li>
            <li>ตั้งรหัสผ่านใหม่ทีไร ระบบจะไล่ออกจากทุกเครื่องที่เคยเข้าไว้</li>
            <li>คุณถอดสิทธิ์ตั้งค่าร้านหรือปิดบัญชีของตัวเองไม่ได้ กันล็อกตัวเองออกจากระบบ</li>
          </ul>
        </div>
      </div>
      </SubNav>
    </Shell>
  );
}
