import { redirect } from 'next/navigation';
import { consumeSetupToken, peekSetupToken } from '@/lib/auth';
import { checkPasswordStrength, hashPassword } from '@/lib/password';

export const dynamic = 'force-dynamic';

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const info = await peekSetupToken(token);

  if (!info) {
    return (
      <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 20px' }}>
        <div className="card">
          <header><h2>ลิงก์ใช้ไม่ได้แล้ว</h2></header>
          <div className="body">
            <p>ลิงก์ตั้งรหัสผ่านนี้หมดอายุ ถูกใช้ไปแล้ว หรือถูกยกเลิก</p>
            <p style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
              ขอลิงก์ใหม่จากเจ้าของกิจการได้เลย ลิงก์เดิมจะใช้ไม่ได้ทันทีที่ออกลิงก์ใหม่
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function submit(formData: FormData) {
    'use server';
    const { token: t } = await params;
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');

    const fail = (msg: string) => redirect(`/setup/${t}?error=${encodeURIComponent(msg)}`);

    if (password !== confirm) fail('รหัสผ่านทั้งสองช่องไม่ตรงกัน');

    const weak = checkPasswordStrength(password);
    if (weak) fail(weak);

    // ตรวจ token อีกรอบตอนจะใช้จริง — ระหว่างที่เปิดหน้าค้างไว้ ลิงก์อาจถูกยกเลิกไปแล้ว
    const ok = await consumeSetupToken(t, await hashPassword(password));
    if (!ok) fail('ลิงก์นี้ใช้ไม่ได้แล้ว กรุณาขอลิงก์ใหม่');

    redirect('/login');
  }

  return (
    <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 20px' }}>
      <div className="card">
        <header>
          <h2>{info.purpose === 'initial' ? 'ตั้งรหัสผ่านครั้งแรก' : 'ตั้งรหัสผ่านใหม่'}</h2>
        </header>
        <div className="body">
          <dl className="kv" style={{ marginBottom: 16 }}>
            <dt>อู่</dt><dd>{info.tenantName}</dd>
            <dt>ผู้ใช้</dt><dd>{info.name || '-'}</dd>
            <dt>อีเมล</dt><dd className="mono">{info.email}</dd>
          </dl>

          {sp.error ? (
            <div className="note" style={{ background: '#FCF1F1', borderColor: '#EEC4C4', color: '#7A2020' }}>
              {sp.error}
            </div>
          ) : null}

          <form action={submit}>
            <label htmlFor="password" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)
            </label>
            <input className="in" id="password" name="password" type="password"
                   autoComplete="new-password" required minLength={10}
                   style={{ width: '100%', marginBottom: 12 }} />

            <label htmlFor="confirm" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
              พิมพ์รหัสผ่านอีกครั้ง
            </label>
            <input className="in" id="confirm" name="confirm" type="password"
                   autoComplete="new-password" required minLength={10}
                   style={{ width: '100%', marginBottom: 16 }} />

            <button className="btn primary" type="submit" style={{ width: '100%' }}>
              ตั้งรหัสผ่านและเข้าสู่ระบบ
            </button>
          </form>

          <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 14, marginBottom: 0 }}>
            ตั้งรหัสผ่านแล้วระบบจะออกจากระบบทุกเครื่องที่เคยเข้าไว้
          </p>
        </div>
      </div>
    </div>
  );
}
