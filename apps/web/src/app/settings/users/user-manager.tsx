'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { issueSetupLinkAction, promoteAction, saveStaffAction } from '../actions';
import type { FormResult } from '@/lib/mutate';
import { PERM_KEYS, PERM_LABEL, type StaffUser } from '@/lib/perms';
import { thDate } from '@/lib/format';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>{pending ? 'กำลังบันทึก…' : label}</button>;
}

function StaffForm({ user, nextCode, onDone }: {
  user: StaffUser | null;
  nextCode: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveStaffAction, {});
  if (state.ok) { onDone(); }

  const bad = (f: string) => (state.field === f ? 'field bad' : 'field');

  return (
    <form className="form" action={action}>
      {user ? <input type="hidden" name="id" value={user.id} /> : null}
      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="row-fields f3">
        <div className="field">
          <label>รหัสพนักงาน</label>
          <input className="in mono" name="code" defaultValue={user?.code ?? nextCode} />
        </div>
        <div className={bad('name')}>
          <label>ชื่อ *</label>
          <input className="in" name="name" required defaultValue={user?.name ?? ''} />
        </div>
        <div className={bad('email')}>
          <label>อีเมลสำหรับเข้าสู่ระบบ</label>
          <input className="in" name="email" type="email" defaultValue={user?.email ?? ''} />
          <span className="hint">ต้องมีถ้าจะให้เข้าระบบเองได้</span>
        </div>
      </div>

      <div className="field">
        <label>สิทธิ์การใช้งาน</label>
        <div className="tag-row">
          {PERM_KEYS.map((k) => (
            <label key={k} className="tag-row" style={{ fontSize: 13.5 }}>
              <input type="checkbox" name={`perm_${k}`}
                     defaultChecked={user ? user.perms.includes(k) : k !== 'settings'} />
              {PERM_LABEL[k]}
            </label>
          ))}
        </div>
      </div>

      <label className="tag-row" style={{ fontSize: 14 }}>
        <input type="checkbox" name="active" defaultChecked={user?.active ?? true} />
        เปิดใช้งาน
      </label>

      <div className="tag-row">
        <Submit label={user ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน'} />
        <button className="btn" type="button" onClick={onDone}>ยกเลิก</button>
      </div>
    </form>
  );
}

export function UserManager({ users, nextCode, currentUserId }: {
  users: StaffUser[];
  nextCode: string;
  currentUserId: string;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [link, setLink] = useState<{ userId: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const makeLink = async (u: StaffUser) => {
    setError(null);
    const purpose = u.hasPassword ? 'reset' : 'initial';
    const r = await issueSetupLinkAction(u.id, purpose);
    if (r.error) { setError(r.error); return; }
    setLink({ userId: u.id, url: `${window.location.origin}/setup/${r.values!.token}` });
  };

  return (
    <>
      {error ? <div className="err" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="tablewrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>รหัส</th><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th>
              <th>สถานะ</th><th>เข้าระบบล่าสุด</th><th style={{ width: 260 }} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                <td className="mono">{u.code}</td>
                <td className="wrap">
                  {u.name}
                  {u.id === currentUserId ? <span className="chip" style={{ marginLeft: 6 }}>คุณ</span> : null}
                </td>
                <td className="mono">{u.email || <span className="subtle">ยังไม่มี</span>}</td>
                <td className="wrap subtle" style={{ fontSize: 12.5 }}>
                  {u.role === 'owner'
                    ? 'เจ้าของกิจการ · ทุกเมนู'
                    : u.perms.length
                      ? u.perms.map((p) => PERM_LABEL[p]).join(' · ')
                      : 'ยังไม่ได้ให้สิทธิ์'}
                </td>
                <td>
                  {!u.active ? <span className="chip">ปิดใช้งาน</span>
                    : u.lockedUntil && new Date(u.lockedUntil) > new Date()
                      ? <span className="chip due">ถูกล็อกชั่วคราว</span>
                      : u.hasPassword ? <span className="chip ok">พร้อมใช้งาน</span>
                        : <span className="chip warn">ยังไม่ตั้งรหัสผ่าน</span>}
                </td>
                <td className="subtle">{u.lastLoginAt ? thDate(String(u.lastLoginAt).slice(0, 10)) : '-'}</td>
                <td>
                  <div className="tag-row">
                    <button className="btn" type="button" onClick={() => setEditing(u.id)}>แก้ไข</button>
                    {u.email ? (
                      <button className="btn" type="button" onClick={() => makeLink(u)}>
                        {u.hasPassword ? 'ออกลิงก์ตั้งรหัสใหม่' : 'ออกลิงก์ตั้งรหัสผ่าน'}
                      </button>
                    ) : null}
                    {u.role !== 'owner' && u.active ? (
                      <form action={async () => { await promoteAction(u.id); }}>
                        <button className="btn" type="submit">ตั้งเป็นเจ้าของ</button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {link ? (
              <tr>
                <td colSpan={7} className="ok-msg" style={{ margin: 0 }}>
                  <div style={{ marginBottom: 6 }}>
                    ลิงก์ตั้งรหัสผ่านของ <b>{users.find((u) => u.id === link.userId)?.name}</b> —
                    ใช้ได้ครั้งเดียว หมดอายุใน 7 วัน ส่งให้เจ้าตัวทางช่องทางที่ปลอดภัย
                  </div>
                  <code style={{ wordBreak: 'break-all' }}>{link.url}</code>
                </td>
              </tr>
            ) : null}

            {editing && editing !== 'new' ? (
              <tr>
                <td colSpan={7} style={{ background: 'var(--bg)' }}>
                  <StaffForm user={users.find((u) => u.id === editing) ?? null}
                             nextCode={nextCode} onDone={() => setEditing(null)} />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="body">
        {editing === 'new' ? (
          <StaffForm user={null} nextCode={nextCode} onDone={() => setEditing(null)} />
        ) : (
          <button className="btn primary" type="button" onClick={() => setEditing('new')}>
            + เพิ่มพนักงาน
          </button>
        )}
      </div>
    </>
  );
}
