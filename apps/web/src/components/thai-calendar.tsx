'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ปฏิทินเลือกวัน (พ.ศ.) แบบ dropdown — ผู้ใช้ขอ "เลือกจากปฏิทิน ไม่ใช่พิมพ์เอง"
 * ไม่ใช้ <input type="date"> ของเบราว์เซอร์เพราะโชว์ ค.ศ. และหน้าตาต่างกันทุกเครื่อง
 * แผงลอยแบบ fixed คำนวณจากปุ่ม จึงไม่ถูกตัดด้วย overflow ของการ์ด
 */
const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_D = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function ThaiCalendar({ value, onPick, onClose, anchor }: {
  value?: string | null;
  onPick: (iso: string) => void;
  onClose: () => void;
  anchor: DOMRect | null;
}) {
  const base = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date();
  const [y, setY] = useState(base.getFullYear());
  const [m, setM] = useState(base.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const todayIso = isoOf(today.getFullYear(), today.getMonth(), today.getDate());
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const style: React.CSSProperties = anchor
    ? { position: 'fixed', top: Math.min(anchor.bottom + 6, window.innerHeight - 330), left: Math.min(anchor.left, window.innerWidth - 300) }
    : { position: 'absolute', top: '100%', left: 0 };
  const prev = () => { if (m === 0) { setM(11); setY(y - 1); } else setM(m - 1); };
  const next = () => { if (m === 11) { setM(0); setY(y + 1); } else setM(m + 1); };

  return (
    <div ref={ref} className="thcal" role="dialog" aria-label="เลือกวันที่" style={style}>
      <div className="thcal-h">
        <button type="button" onClick={prev} aria-label="เดือนก่อน">‹</button>
        <b>{TH_M[m]} {y + 543}</b>
        <button type="button" onClick={next} aria-label="เดือนถัดไป">›</button>
      </div>
      <div className="thcal-g">
        {TH_D.map((d) => <span key={d} className="dn">{d}</span>)}
        {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
          <button type="button" key={d}
                  className={`dd${isoOf(y, m, d) === value ? ' on' : ''}${isoOf(y, m, d) === todayIso ? ' today' : ''}`}
                  onClick={() => { onPick(isoOf(y, m, d)); onClose(); }}>{d}</button>
        ))}
      </div>
      <div className="thcal-f">
        <button type="button" className="btn sm" onClick={() => { onPick(todayIso); onClose(); }}>วันนี้</button>
        <button type="button" className="btn sm" onClick={() => { onPick(''); onClose(); }}>ล้าง</button>
      </div>
    </div>
  );
}

/** ปุ่มเปิดปฏิทิน — ใช้คู่กับช่องพิมพ์ วว/ดด/ปป */
export function CalendarButton({ value, onPick }: { value?: string | null; onPick: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="btn calbtn" aria-label="เลือกจากปฏิทิน" title="เลือกจากปฏิทิน"
              onClick={() => { setRect(btn.current?.getBoundingClientRect() ?? null); setOpen((o) => !o); }}>📅</button>
      {open ? <ThaiCalendar value={value} onPick={onPick} onClose={() => setOpen(false)} anchor={rect} /> : null}
    </>
  );
}
