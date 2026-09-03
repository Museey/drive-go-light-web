'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { issueSetupLinkAction, promoteAction, saveStaffAction } from '../actions';
import type { FormResult } from '@/lib/mutate';
import { PERM_KEYS, PERM_LABEL, canTab, type PermKey, type StaffUser } from '@/lib/perms';
import { SUB_ITEMS } from '@/components/menu-map';
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
          <span className="hint">ใช้อ้างอิงในเอกสารและประวัติการแก้ไข — <b>เข้าระบบด้วยอีเมล</b></span>
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

      <PermTable user={user} />

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


/**
 * ตารางติ๊กสิทธิ์รายเมนูย่อย — สามคอลัมน์ตามรุ่น 6.4
 *
 * ช่องแก้ไข/ส่งออกกดไม่ได้ถ้ายังไม่ติ๊ก "ดูได้" และทั้งบล็อกปิดถ้าไม่ติ๊กเมนูหลัก
 * กันตั้งค่าที่ขัดกันเองตั้งแต่ตอนกรอก ไม่ใช่ไปเจอตอนใช้งานจริง
 *
 * อ่านผังแท็บจาก menu-map — แท็บใหม่ที่เพิ่มในผังจะมีที่ให้ติ๊กเองอัตโนมัติ
 */
function PermTable({ user }: { user: StaffUser | null }) {
  const on = (k: PermKey) => (user ? user.perms.menus?.[k] === true : k !== 'settings');
  const [menus, setMenus] = useState<Record<string, boolean>>(
    () => Object.fromEntries(PERM_KEYS.map((k) => [k, on(k)])),
  );

  /* ผู้ใช้ใหม่เปิดทุกแท็บของเมนูที่ให้สิทธิ์ · ผู้ใช้เดิมอ่านจากที่บันทึกไว้ */
  const seen = (k: PermKey, sub: string) =>
    user ? canTab({ role: 'staff', perms: user.perms }, k, sub) : true;
  const editable = (k: PermKey, sub: string) =>
    user ? user.perms.edit?.[`${k}.${sub}`] !== false : true;
  const exportable = (k: PermKey, sub: string) =>
    user ? user.perms.export?.[`${k}.${sub}`] !== false : true;

  return (
    <>
      <div className="field">
        <label>สิทธิ์การเห็นข้อมูลสำคัญ</label>
        <div className="note" style={{ marginBottom: 8 }}>
          <label className="tag-row" style={{ fontSize: 13.5 }}>
            <input type="checkbox" name="perm_cost"
                   defaultChecked={user ? user.perms.cost !== false : true} />
            <b>เห็นต้นทุนสินค้า / ราคาซื้อ</b>
          </label>
          <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>
            ไม่ติ๊ก = ซ่อนต้นทุนจากพนักงานคนนี้<b>ทุกหน้าที่แสดงต้นทุน</b> ทั้งทะเบียนสินค้า
            มูลค่าสต๊อก ใบเคลม ใบตรวจนับ เอกสารที่พิมพ์ และไฟล์ที่ส่งออก
            รวมถึง<b>ปิดเมนู 06.4 กำไรขาดทุน</b>ให้อัตโนมัติ เพราะเป็นรายงานต้นทุนโดยตรง
            <br />
            <span className="subtle">
              เมนู 04 ซื้อสินค้า ยังต้องกรอกราคาซื้อในการทำงาน
              หากไม่ต้องการให้เห็นราคาซื้อเลย ให้เอาติ๊กเมนู 04 ออกด้วย
            </span>
          </div>
        </div>

        <div className="note">
          <label className="tag-row" style={{ fontSize: 13.5 }}>
            <input type="checkbox" name="perm_homeReport"
                   defaultChecked={user ? user.perms.homeReport !== false : true} />
            <b>เห็นรายงานสรุปในหน้าแรก</b>
          </label>
          <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>
            ไม่ติ๊ก = หน้าแรกของพนักงานคนนี้จะเหลือแค่<b>การ์ดเมนูใช้งาน</b>
            ไม่เห็นยอดขาย ลูกหนี้ เจ้าหนี้ และภาษี
          </div>
        </div>
      </div>

      <div className="field">
        <label>เมนูที่ให้ใช้งานได้</label>
        <span className="hint" style={{ marginBottom: 8, lineHeight: 1.7 }}>
          <b>ดูได้</b> เข้าหน้านั้นได้ · <b>แก้ไขได้</b> เพิ่ม แก้ ลบ และบันทึกได้ ·
          <b>ส่งออกได้</b> พิมพ์ทะเบียนทั้งชุดหรือดาวน์โหลดเป็นไฟล์ได้
          <br />
          การดึงสินค้าเข้าเอกสารขายแล้วสต๊อกลดตามปกติ ไม่นับเป็นการแก้ทะเบียนสินค้า —
          พนักงานที่ดูสต๊อกได้อย่างเดียวจึงยังออกใบเสร็จได้ ·
          การพิมพ์เอกสารรายใบ เช่น ใบเสร็จของลูกค้า ทำได้เสมอตามสิทธิ์เมนู
        </span>

        {PERM_KEYS.map((k) => {
          const subs = SUB_ITEMS[k] ?? [];
          const menuOn = menus[k];
          return (
            <div key={k} className="card" style={{ marginBottom: 10, opacity: menuOn ? 1 : 0.55 }}>
              <div className="toolbar">
                <label className="tag-row" style={{ fontSize: 13.5 }}>
                  <input type="checkbox" name={`perm_${k}`} defaultChecked={menuOn}
                         onChange={(e) => setMenus((m) => ({ ...m, [k]: e.target.checked }))} />
                  <b>{PERM_LABEL[k]}</b>
                </label>
                <span className="spacer" />
                <span className="subtle">{subs.length} เมนูย่อย</span>
              </div>

              {subs.length > 0 ? (
                <div className="tablewrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>เมนูย่อย</th>
                        <th style={{ width: 80, textAlign: 'center' }}>ดูได้</th>
                        <th style={{ width: 92, textAlign: 'center' }}>แก้ไขได้</th>
                        <th style={{ width: 104, textAlign: 'center' }}>ส่งออกได้</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((sub) => (
                        <SubRow key={sub.key} menu={k} sub={sub.key} no={sub.no}
                                label={sub.label} disabled={!menuOn}
                                seen={seen(k, sub.key)} edit={editable(k, sub.key)}
                                exp={exportable(k, sub.key)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
        <span className="hint">
          หน้าแรกเปิดให้ทุกคนเห็นเสมอ · สิทธิ์ตั้งค่าร้านครอบคลุมถึงการแก้ข้อมูลผู้ใช้
          และลิขสิทธิ์ จึงควรให้เฉพาะผู้ที่ไว้ใจได้
        </span>
      </div>
    </>
  );
}

/** หนึ่งแถวของตารางสิทธิ์ — ช่องแก้ไข/ส่งออกผูกกับช่องดูได้ */
function SubRow({
  menu, sub, no, label, disabled, seen, edit, exp,
}: {
  menu: string; sub: string; no: string; label: string;
  disabled: boolean; seen: boolean; edit: boolean; exp: boolean;
}) {
  const [open, setOpen] = useState(seen);
  const key = `${menu}.${sub}`;
  const off = disabled || !open;

  return (
    <tr>
      <td>
        <span className="mono subtle" style={{ fontSize: 11 }}>{no}</span> {label}
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" name={`tab_${key}`} defaultChecked={seen} disabled={disabled}
               onChange={(e) => setOpen(e.target.checked)} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" name={`edit_${key}`} defaultChecked={edit} disabled={off}
               title="ให้เพิ่ม แก้ ลบ และบันทึกข้อมูลในเมนูนี้ได้" />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" name={`export_${key}`} defaultChecked={exp} disabled={off}
               title="ให้พิมพ์ทะเบียนทั้งชุดหรือดาวน์โหลดข้อมูลเป็นไฟล์ได้" />
      </td>
    </tr>
  );
}


/**
 * สรุปสิทธิ์เป็นชิปในตาราง — เมนูไหนให้ไม่ครบทุกแท็บบอกเป็นเศษส่วน
 * ตรงกับ permSummary() ของรุ่น 6.4
 */
function PermSummary({ user }: { user: StaffUser }) {
  const on = PERM_KEYS.filter((k) => user.perms.menus?.[k] === true);
  if (on.length === 0) return <>ยังไม่ได้ให้สิทธิ์</>;

  const marks: string[] = [];
  if (user.perms.cost === false) marks.push('ซ่อนต้นทุน');
  if (user.perms.homeReport === false) marks.push('ไม่เห็นสรุปหน้าแรก');

  return (
    <>
      {on.map((k) => {
        const subs = SUB_ITEMS[k] ?? [];
        const seen = subs.filter((sub) =>
          canTab({ role: 'staff', perms: user.perms }, k, sub.key)).length;
        const partial = subs.length > 0 && seen < subs.length;
        return (
          <span key={k} className="chip" style={{ margin: '1px 3px 1px 0' }}>
            {PERM_LABEL[k]}{partial ? ` ${seen}/${subs.length}` : ''}
          </span>
        );
      })}
      {marks.map((m) => (
        <span key={m} className="chip warn" style={{ margin: '1px 3px 1px 0' }}>{m}</span>
      ))}
    </>
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
                  {u.role === 'owner' ? 'เจ้าของกิจการ · ทุกเมนู' : <PermSummary user={u} />}
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
