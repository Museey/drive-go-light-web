import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentSession, signIn } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await currentSession()) redirect('/');
  const sp = await searchParams;

  async function submit(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      redirect('/login?error=' + encodeURIComponent('กรุณากรอกอีเมลและรหัสผ่าน'));
    }

    const ua = (await headers()).get('user-agent') ?? undefined;
    const result = await signIn(email, password, ua);

    if (!result.ok) redirect('/login?error=' + encodeURIComponent(result.message));
    redirect('/');
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>
          DriveGo<span style={{ color: 'var(--accent)' }}>Light!</span>
        </div>
        <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>ระบบบริหารงานอู่ซ่อมรถยนต์</div>
      </div>

      <div className="card">
        <header><h2>เข้าสู่ระบบ</h2></header>
        <div className="body">
          {sp.error ? (
            <div className="note" style={{ background: '#FCF1F1', borderColor: '#EEC4C4', color: '#7A2020' }}>
              {sp.error}
            </div>
          ) : null}

          <form action={submit}>
            <label className="in-label" htmlFor="email" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              อีเมล
            </label>
            <input className="in" id="email" name="email" type="email" autoComplete="username"
                   required autoFocus style={{ width: '100%', marginBottom: 12 }} />

            <label htmlFor="password" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              รหัสผ่าน
            </label>
            <input className="in" id="password" name="password" type="password"
                   autoComplete="current-password" required style={{ width: '100%', marginBottom: 16 }} />

            <button className="btn primary" type="submit" style={{ width: '100%' }}>เข้าสู่ระบบ</button>
          </form>

          <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 16, marginBottom: 0 }}>
            ยังไม่ได้ตั้งรหัสผ่าน? ใช้ลิงก์ตั้งรหัสผ่านที่ได้รับจากเจ้าของกิจการ
          </p>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
        <a href="/privacy" style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>
          นโยบายข้อมูลส่วนบุคคล
        </a>
      </p>
    </div>
  );
}
