import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentOperator, opsSignIn } from '@/lib/ops-auth';

export const dynamic = 'force-dynamic';

export default async function OpsLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentOperator()) redirect('/ops');
  const sp = await searchParams;

  async function submit(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    if (!email || !password) {
      redirect('/ops/login?error=' + encodeURIComponent('กรุณากรอกอีเมลและรหัสผ่าน'));
    }
    const ua = (await headers()).get('user-agent') ?? undefined;
    const result = await opsSignIn(email, password, ua);
    if (!result.ok) redirect('/ops/login?error=' + encodeURIComponent(result.message));
    redirect('/ops');
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>คอนโซลผู้ให้บริการ</div>
        <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
          DriveGoLight! — สำหรับผู้ดูแลระบบเท่านั้น
        </div>
      </div>

      <div className="card">
        <header><h2>เข้าสู่ระบบ</h2></header>
        <div className="body">
          {sp.error ? (
            <div className="note"
                 style={{ background: '#FCF1F1', borderColor: '#EEC4C4', color: '#7A2020' }}>
              {sp.error}
            </div>
          ) : null}

          <form action={submit}>
            <label htmlFor="email"
                   style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              อีเมล
            </label>
            <input className="in" id="email" name="email" type="email" autoComplete="username"
                   required autoFocus style={{ width: '100%', marginBottom: 12 }} />

            <label htmlFor="password"
                   style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              รหัสผ่าน
            </label>
            <input className="in" id="password" name="password" type="password"
                   autoComplete="current-password" required
                   style={{ width: '100%', marginBottom: 16 }} />

            <button className="btn primary" type="submit" style={{ width: '100%' }}>เข้าสู่ระบบ</button>
          </form>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 18, color: 'var(--ink-3)' }}>
        นี่ไม่ใช่หน้าเข้าใช้งานของอู่ — <a href="/login" style={{ textDecoration: 'underline' }}>ไปหน้าของอู่</a>
      </p>
    </div>
  );
}
