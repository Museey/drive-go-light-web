import { redirect } from 'next/navigation';
import { listTenantsForDev, setTenant } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function choose(formData: FormData) {
  'use server';
  const id = String(formData.get('tenantId') ?? '').trim();
  if (id) {
    await setTenant(id);
    redirect('/');
  }
}

export default async function LoginPage() {
  const tenants = await listTenantsForDev();

  return (
    <div className="wrap" style={{ maxWidth: 620, margin: '48px auto' }}>
      <div className="card">
        <header><h2>เลือกอู่ที่จะเข้าใช้งาน</h2></header>
        <div className="body">
          <div className="note">
            <b>ยังไม่มีระบบเข้าสู่ระบบจริง</b><br />
            หน้านี้มีไว้ให้เดินหน้าพัฒนาต่อได้เท่านั้น ยังไม่มีการยืนยันตัวตน
            และเปิดเฉพาะตอนพัฒนา ของจริงต้องเป็นอีเมล + รหัสผ่าน แล้วออก session
            ที่ผูกทั้งผู้ใช้และอู่
          </div>

          {tenants.length === 0 ? (
            <p style={{ color: 'var(--ink-3)' }}>
              ยังไม่มีอู่ในฐานข้อมูล หรือยังไม่ได้ตั้ง <span className="mono">DEV_ADMIN_DATABASE_URL</span>
              <br />
              นำเข้าข้อมูลก่อนด้วย <span className="mono">packages/importer</span>
            </p>
          ) : (
            <form action={choose}>
              <select className="in" name="tenantId" style={{ width: '100%', marginBottom: 12 }}>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} — {t.id.slice(0, 8)}</option>
                ))}
              </select>
              <button className="btn primary" type="submit">เข้าใช้งาน</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
