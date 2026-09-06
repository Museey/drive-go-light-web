import { redirect } from 'next/navigation';
import { consumeOpsSetupToken, OPS_MIN_PASSWORD, peekOpsSetupToken } from '@/lib/ops-auth';

export const dynamic = 'force-dynamic';

/** ตั้งรหัสผ่านของบัญชีผู้ให้บริการ — คนละเส้นทางกับของอู่ (/setup/[token]) */
export default async function OpsSetupPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const info = await peekOpsSetupToken(token);

  async function submit(formData: FormData) {
    'use server';
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');
    const back = (msg: string) =>
      redirect(`/ops/setup/${token}?error=${encodeURIComponent(msg)}`);

    if (password !== confirm) back('รหัสผ่านสองช่องไม่ตรงกัน');

    const result = await consumeOpsSetupToken(token, password);
    if (!result.ok) back(result.message);
    redirect('/ops/login');
  }

  if (!info) {
    return (
      <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 20px' }}>
        <div className="card">
          <header><h2>ลิงก์ใช้ไม่ได้</h2></header>
          <div className="body">
            <p>ลิงก์นี้ถูกใช้ไปแล้ว หมดอายุแล้ว หรือบัญชีถูกปิดการใช้งาน</p>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 0 }}>
              ออกลิงก์ใหม่ได้จากคอนโซล หรือด้วยคำสั่ง <code>tools/ops-admin.mjs</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>คอนโซลผู้ให้บริการ</div>
      </div>

      <div className="card">
        <header><h2>ตั้งรหัสผ่าน</h2></header>
        <div className="body">
          {sp.error ? (
            <div className="note"
                 style={{ background: '#FCF1F1', borderColor: '#EEC4C4', color: '#7A2020' }}>
              {sp.error}
            </div>
          ) : null}

          <p style={{ marginBottom: 14 }}>
            บัญชี <b>{info.email}</b>
          </p>

          <form action={submit}>
            <label htmlFor="password"
                   style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              รหัสผ่านใหม่ (อย่างน้อย {OPS_MIN_PASSWORD} ตัวอักษร)
            </label>
            <input className="in" id="password" name="password" type="password"
                   minLength={OPS_MIN_PASSWORD} autoComplete="new-password" required autoFocus
                   style={{ width: '100%', marginBottom: 12 }} />

            <label htmlFor="confirm"
                   style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              พิมพ์อีกครั้ง
            </label>
            <input className="in" id="confirm" name="confirm" type="password"
                   minLength={OPS_MIN_PASSWORD} autoComplete="new-password" required
                   style={{ width: '100%', marginBottom: 16 }} />

            <button className="btn primary" type="submit" style={{ width: '100%' }}>
              ตั้งรหัสผ่านแล้วเข้าสู่ระบบ
            </button>
          </form>

          <div className="note" style={{ marginTop: 16, marginBottom: 0 }}>
            บัญชีนี้เปิดอู่ใหม่ได้และออกลิงก์ตั้งรหัสผ่านของคนอื่นได้ —
            ใช้รหัสผ่านที่ไม่ซ้ำกับที่ไหนเลย และเก็บไว้ในโปรแกรมจัดการรหัสผ่าน
          </div>
        </div>
      </div>
    </div>
  );
}
