import Link from 'next/link';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShopSettings } from '@/lib/settings';
import { ShopForm } from './shop-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requirePerm('settings');
  const shop = await getShopSettings();

  return (
    <Shell
      current="/settings"
      title="ตั้งค่าร้าน"
      actions={
        <div className="tag-row">
          <Link className="btn" href="/settings/users">ผู้ใช้งานและสิทธิ์</Link>
          <Link className="btn" href="/settings/backup">สำรองข้อมูล</Link>
        </div>
      }
    >
      <div className="card">
        <header><h2>ข้อมูลร้าน</h2></header>
        <div className="body">
          <ShopForm shop={shop} />
        </div>
      </div>
    </Shell>
  );
}
