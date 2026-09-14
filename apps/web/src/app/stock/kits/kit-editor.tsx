'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useLiveSearch } from '@/components/use-live-search';
import { baht } from '@/lib/format';
import { kitCost, kitLineName, type KitItemInput } from '@/lib/kit-calc';
import type { FormResult } from '@/lib/mutate';
import type { KitPart } from '@/lib/kits';
import { saveKitAction, searchKitPartsAction } from './actions';

type Line = KitItemInput & { code: string };

const emptyLine = (): Line => ({ productId: null, code: '', name: '', unit: '', qty: 1, unitCost: 0 });

/** ตารางมีบรรทัดว่างท้ายเสมอ พิมพ์เองต่อได้ทันทีโดยไม่ต้องกดเพิ่ม (แบบเดียวกับฟอร์มเอกสาร) */
const withBlank = (ls: Line[]) => (ls.some((l) => !l.productId && !l.name.trim()) ? ls : [...ls, emptyLine()]);

export function KitEditor({ initial, code, showCost, mayEdit }: {
  initial: { id: string; code: string; name: string; price: number; priceB: number; priceC: number; note: string; items: KitItemInput[] } | null;
  code: string;
  /** ผู้ไม่มีสิทธิ์เห็นต้นทุน: ไม่เห็นช่องทุน/กำไร — ค่าทุนเดิมส่งกลับไปแบบซ่อนเพื่อไม่ให้ถูกล้างเป็นศูนย์ */
  showCost: boolean;
  mayEdit: boolean;
}) {
  const [state, action, pending] = useActionState<FormResult, FormData>(saveKitAction, {});
  const v = state.values ?? {};
  const [name, setName] = useState(v.name ?? initial?.name ?? '');
  const [price, setPrice] = useState(Number(v.price ?? initial?.price ?? 0));
  const [lines, setLines] = useState<Line[]>(() =>
    withBlank((initial?.items ?? []).map((it) => ({ ...it, code: '' }))));
  const [query, setQuery] = useState('');
  const { results: hits, busy, clear } = useLiveSearch(query, (q) => searchKitPartsAction(q) as Promise<KitPart[]>);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => withBlank(ls.map((l, j) => (j === i ? { ...l, ...patch } : l))));
  const removeLine = (i: number) => setLines((ls) => withBlank(ls.filter((_, j) => j !== i)));

  const addPart = (p: KitPart) => {
    setQuery(''); clear();
    setLines((ls) => {
      /* สินค้าเดิมอยู่ในชุดแล้ว — เพิ่มจำนวน ไม่ใช่เพิ่มบรรทัดซ้ำ */
      const same = ls.findIndex((l) => l.productId === p.id);
      if (same >= 0) return ls.map((l, j) => (j === same ? { ...l, qty: l.qty + 1 } : l));
      const line: Line = { productId: p.id, code: p.code, name: p.name, unit: p.unit, qty: 1, unitCost: p.lastCost ?? 0 };
      const at = ls.findIndex((l) => !l.productId && !l.name.trim());
      const next = [...ls];
      if (at >= 0) next[at] = line; else next.push(line);
      return withBlank(next);
    });
  };

  const filled = lines.filter((l) => l.name.trim());
  const cost = kitCost(filled);
  const profit = Math.round((price - cost) * 100) / 100;
  const bad = (f: string) => (state.field === f ? 'field bad' : 'field');

  return (
    <form className="form card" action={action} style={{ padding: 16 }}>
      <input type="hidden" name="id" value={initial?.id ?? ''} />
      {state.error ? <div className="err" role="alert">{state.error}</div> : null}

      <div className="row-fields f4">
        <div className={bad('code')}>
          <label htmlFor="code">รหัสชุด *</label>
          <input className="in mono" id="code" name="code" defaultValue={v.code ?? code} required readOnly={!mayEdit} />
        </div>
        <div className={bad('name')} style={{ gridColumn: 'span 3' }}>
          <label htmlFor="name">ชื่อชุด *</label>
          <input className="in" id="name" name="name" value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="เช่น ถ่ายน้ำมันเครื่อง + กรอง (รถเก๋ง)" required readOnly={!mayEdit} />
        </div>
      </div>

      <div className="row-fields f4">
        <div className={bad('price')}>
          <label htmlFor="price">ราคาขาย A *</label>
          <input className="in mono amber" id="price" name="price" inputMode="decimal" style={{ textAlign: 'right' }}
                 value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} readOnly={!mayEdit} />
        </div>
        <div className={bad('priceB')}>
          <label htmlFor="priceB">ราคา B</label>
          <input className="in mono" id="priceB" name="priceB" inputMode="decimal" style={{ textAlign: 'right' }}
                 defaultValue={v.priceB ?? initial?.priceB ?? 0} readOnly={!mayEdit} />
        </div>
        <div className={bad('priceC')}>
          <label htmlFor="priceC">ราคา C</label>
          <input className="in mono" id="priceC" name="priceC" inputMode="decimal" style={{ textAlign: 'right' }}
                 defaultValue={v.priceC ?? initial?.priceC ?? 0} readOnly={!mayEdit} />
        </div>
        <div className="field">
          <label htmlFor="note">หมายเหตุ</label>
          <input className="in" id="note" name="note" defaultValue={v.note ?? initial?.note ?? ''} readOnly={!mayEdit} />
        </div>
      </div>
      <span className="hint">ระดับราคาที่เลือกในเอกสาร (A/B/C) ใช้ราคาชุดตามช่องนั้น</span>

      {mayEdit ? (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="partq">เพิ่มวัสดุจากทะเบียนสินค้า</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="in search" id="partq" value={query} data-enter="own"
                   onChange={(e) => setQuery(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key !== 'Enter') return;
                     e.preventDefault();
                     if (hits?.[0]) addPart(hits[0]);
                   }}
                   placeholder="กรอกคำค้นหา — รหัส ชื่อ บาร์โค้ด หรือรหัส OEM" />
            {busy ? <span className="subtle">กำลังค้น…</span> : null}
          </div>
          {hits ? (
            <div className="tablewrap hits5" style={{ marginTop: 8 }}>
              <table className="tbl">
                <tbody>
                  {hits.length === 0 ? (
                    <tr><td className="subtle">ไม่พบสินค้า — พิมพ์ชื่อวัสดุในบรรทัดว่างของตารางได้เลย (ไม่ตัดสต๊อก)</td></tr>
                  ) : hits.map((p) => (
                    <tr key={p.id} className="pick" role="button" tabIndex={0} onClick={() => addPart(p)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addPart(p); } }}>
                      <td className="mono">{p.code}</td>
                      <td className="wrap">{p.name}</td>
                      <td className="num">คงเหลือ {p.qtyOnHand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="tablewrap"
           style={{ border: `1px solid ${state.field === 'items' ? 'var(--due)' : 'var(--line)'}`, borderRadius: 6, marginTop: 10 }}>
        <table className="tbl lines">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>รายการในชุด</th>
              <th style={{ width: 90 }}>หน่วย</th>
              <th className="num" style={{ width: 90 }}>จำนวน</th>
              {showCost ? <><th className="num" style={{ width: 110 }}>ทุน/หน่วย</th><th className="num" style={{ width: 110 }}>รวม</th></> : null}
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>
                  <input type="hidden" name={`it${i}_pid`} value={l.productId ?? ''} />
                  <input className="in" name={`it${i}_name`} value={l.name} readOnly={!mayEdit || !!l.productId}
                         onChange={(e) => setLine(i, { name: e.target.value })}
                         placeholder="พิมพ์ชื่อวัสดุ หรือค้นจากทะเบียนด้านบน" />
                  {l.productId ? <span className="chip ok" title="ผูกทะเบียนสินค้า ใบเสร็จตัดสต๊อก">{l.code || 'ทะเบียน'}</span>
                    : l.name.trim() ? <span className="chip warn" title="ไม่ได้ผูกกับทะเบียนสินค้า จะไม่ตัดสต๊อก">ไม่ตัดสต๊อก</span> : null}
                </td>
                <td>
                  <input className="in" name={`it${i}_unit`} value={l.unit} readOnly={!mayEdit || !!l.productId}
                         onChange={(e) => setLine(i, { unit: e.target.value })} />
                </td>
                <td className="num">
                  <input className="in mono" name={`it${i}_qty`} inputMode="decimal" value={l.qty} readOnly={!mayEdit}
                         style={{ textAlign: 'right', ...(state.field === `it${i}_qty` ? { borderColor: 'var(--due)' } : {}) }}
                         onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} />
                </td>
                {showCost ? (
                  <>
                    <td className="num">
                      <input className="in mono" name={`it${i}_cost`} inputMode="decimal" value={l.unitCost} readOnly={!mayEdit}
                             style={{ textAlign: 'right', ...(state.field === `it${i}_cost` ? { borderColor: 'var(--due)' } : {}) }}
                             onChange={(e) => setLine(i, { unitCost: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="num mono">{l.name.trim() ? baht(l.qty * l.unitCost) : ''}</td>
                  </>
                ) : <input type="hidden" name={`it${i}_cost`} value={l.unitCost} />}
                <td>
                  {mayEdit && (l.productId || l.name.trim()) ? (
                    <button className="del" type="button" title="เอาออก" aria-label={`เอาบรรทัดที่ ${i + 1} ออก`}
                            onClick={() => removeLine(i)}>×</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-fields f2" style={{ marginTop: 12, alignItems: 'start' }}>
        <div className="field">
          <label>ตัวอย่างบนเอกสาร</label>
          <div className="note">{name.trim() ? kitLineName(name.trim(), filled) : '—'}</div>
        </div>
        {showCost ? (
          <div className="field">
            <label>Σ ต้นทุน / กำไร (ราคา A)</label>
            <div className="note mono" aria-live="polite">
              ต้นทุนรวม <b>{baht(cost)}</b> · กำไร <b style={profit < 0 ? { color: 'var(--due)' } : undefined}>{baht(profit)}</b>
              {price > 0 ? ` (${Math.round((profit / price) * 1000) / 10}%)` : ''}
            </div>
          </div>
        ) : null}
      </div>

      <div className="acts" style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        {mayEdit ? <button className="btn ok" type="submit" disabled={pending}>{pending ? 'กำลังบันทึก…' : 'บันทึกชุด'}</button> : null}
        <Link className="btn" href="/stock/kits">กลับรายการชุด</Link>
      </div>
    </form>
  );
}
