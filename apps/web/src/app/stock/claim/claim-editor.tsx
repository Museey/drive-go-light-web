'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { saveClaimAction, searchClaimPartiesAction, searchClaimPartsAction } from './actions';
import { VehicleFields } from '../../income/vehicle-fields';
import { CLAIM_KINDS, CLAIM_SIDE, type ClaimSide } from '@/lib/claims';
import type { FormResult } from '@/lib/mutate';
import { baht } from '@/lib/format';

/**
 * ฟอร์มออกใบเคลม — ทั้งฝั่งลูกค้าและฝั่งผู้ขายใช้ตัวเดียวกัน ต่างกันแค่ side
 * ตามรุ่น 6.4 ที่ใช้ renderClaimForm() ตัวเดียวสำหรับทั้งสองแท็บ
 *
 * ออกใบใหม่อย่างเดียว ไม่มีโหมดแก้ — 6.4 ปิดปุ่มบันทึกทันทีที่ใบอยู่ในฐานแล้ว
 * ถ้าผิดให้ยกเลิกแล้วเปิดใบใหม่ ซึ่งทำให้บัญชีสต๊อกมีการตัดครั้งเดียวต่อใบ
 */

interface Line {
  productId: string | null;
  code: string;
  oem: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  /** ยอดคงเหลือตอนที่ดึงมา ไว้เตือนเมื่อเคลมเกินที่มี */
  onHand: number | null;
}

interface Party {
  id: string;
  name: string;
  tel: string;
  vehicles?: { id: string; label: string; data: Record<string, string> }[];
}

const emptyLine = (): Line => ({
  productId: null, code: '', oem: '', name: '', unit: '', qty: 1, unitCost: 0, onHand: null,
});

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึกและตัดสต๊อก…' : 'บันทึกใบเคลม'}
    </button>
  );
}

export function ClaimEditor({ side, today }: { side: ClaimSide; today: string }) {
  const S = CLAIM_SIDE[side];
  const kinds = CLAIM_KINDS[side];

  const [state, action] = useActionState<FormResult, FormData>(saveClaimAction, {});
  const [kind, setKind] = useState(kinds[0]!.key);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [party, setParty] = useState<Party | null>(null);
  /** -1 = ไม่ใช่รถในทะเบียน กรอกเอง */
  const [vehicleIdx, setVehicleIdx] = useState(-1);
  /** ภาพนิ่งของรถบนใบเคลมใบนี้ — แก้ได้ทุกช่อง ไม่กระทบทะเบียนรถ ยกเว้นเลขไมล์ */
  const [vehData, setVehData] = useState<Record<string, string>>({});

  const [partyQuery, setPartyQuery] = useState('');
  const [partyHits, setPartyHits] = useState<Party[] | null>(null);
  const [partQuery, setPartQuery] = useState('');
  const [partHits, setPartHits] = useState<Awaited<ReturnType<typeof searchClaimPartsAction>> | null>(null);
  const [busy, start] = useTransition();

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const unlinked = lines.filter((l) => !l.productId && l.name.trim()).length;
  const veh = vehicleIdx >= 0 ? party?.vehicles?.[vehicleIdx] ?? null : null;

  /* เลือกรถจากทะเบียนแล้วเติมช่องให้ — เลือก "กรอกเอง" แล้วปล่อยค่าที่พิมพ์ไว้ */
  const pickVehicle = (i: number) => {
    setVehicleIdx(i);
    const picked = i >= 0 ? party?.vehicles?.[i] : null;
    if (picked) setVehData({ ...picked.data });
  };

  const addPart = (p: NonNullable<typeof partHits>[number]) => {
    setPartHits(null);
    setPartQuery('');
    setLines((ls) => {
      const next = [...ls];
      const at = next.findIndex((l) => !l.productId && !l.name.trim());
      const line: Line = {
        productId: p.id, code: p.code, oem: p.oem, name: p.name, unit: p.unit,
        qty: 1, unitCost: 0, onHand: p.qtyOnHand,
      };
      if (at >= 0) next[at] = line; else next.push(line);
      return next;
    });
  };

  return (
    <form className="form" action={action}>
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="partyId" value={party?.id ?? ''} />
      <input type="hidden" name="vehicleId" value={side === 'customer' ? veh?.id ?? '' : ''} />
      <input type="hidden" name="vehicle"
             value={side === 'customer' && Object.values(vehData).some(Boolean)
               ? JSON.stringify(vehData) : ''} />

      {state.error ? <div className="err">{state.error}</div> : null}

      <div className="note" style={{ marginBottom: 14 }}>{S.hint}</div>

      {/* 1 · ประเภทการเคลม */}
      <div className="row-fields f3">
        <div className="field">
          <label htmlFor="kind">ประเภทการเคลม *</label>
          <select className="in" id="kind" name="kind" value={kind}
                  onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <span className="hint">{kinds.find((k) => k.key === kind)?.hint}</span>
        </div>
        <div className={state.field === 'claimDate' ? 'field bad' : 'field'}>
          <label htmlFor="claimDate">วันที่</label>
          <input className="in mono" id="claimDate" name="claimDate" type="date"
                 defaultValue={today} required />
        </div>
        <div className="field">
          {/* 6.4 เรียกช่องนี้ต่างกันตามฝั่ง — เคลมผู้ขายคือการส่งของชำรุดคืนร้านอะไหล่
              ซึ่งอ้างถึงใบซื้อ ไม่ใช่เอกสารของลูกค้า */}
          <label htmlFor="refNo">
            {side === 'vendor' ? 'เลขที่ใบซื้ออ้างอิง' : 'เลขที่เอกสารอ้างอิง'}
          </label>
          <input className="in mono" id="refNo" name="refNo"
                 placeholder={side === 'vendor'
                   ? 'เช่น PO-202608-012 หรือเลขเคลมของผู้ขาย'
                   : 'เช่น RC-202608-001'} />
        </div>
      </div>

      {/* 2 · คู่ค้า */}
      <div className="row-fields f4">
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="pq">ดึงจากทะเบียน{S.party}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="in" id="pq" value={partyQuery}
                   onChange={(e) => setPartyQuery(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                   placeholder={`ชื่อ${S.party} หรือรหัส`} />
            <button className="btn" type="button" disabled={busy}
                    onClick={() => start(async () => {
                      setPartyHits(await searchClaimPartiesAction(side, partyQuery) as Party[]);
                    })}>ค้นหา</button>
          </div>
          {partyHits ? (
            <div className="tablewrap" style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
              <table className="tbl">
                <tbody>
                  {partyHits.length === 0 ? (
                    <tr><td className="subtle">
                      ไม่พบ{S.party} — พิมพ์ชื่อในช่องด้านล่างได้เลย
                    </td></tr>
                  ) : partyHits.map((p) => (
                    <tr key={p.id}>
                      <td className="wrap">{p.name}</td>
                      <td className="mono">{p.tel || '-'}</td>
                      <td><button className="btn" type="button"
                                  onClick={() => { setParty(p); setVehicleIdx(0); setPartyHits(null); }}>
                        เลือก
                      </button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="partyName">ชื่อ{S.party}</label>
          <input className="in" id="partyName" name="partyName"
                 value={party?.name ?? ''} onChange={(e) => setParty((p) => ({
                   id: p?.id ?? '', tel: p?.tel ?? '', vehicles: p?.vehicles, name: e.target.value,
                 }))}
                 placeholder={side === 'vendor'
                   ? 'ชื่อร้านหรือโรงงานที่ส่งของคืน'
                   : 'ชื่อลูกค้าที่รับของทดแทน'} />
        </div>
        <div className="field">
          <label htmlFor="partyTel">โทรศัพท์</label>
          <input className="in mono" id="partyTel" name="partyTel"
                 value={party?.tel ?? ''} onChange={(e) => setParty((p) => ({
                   id: p?.id ?? '', name: p?.name ?? '', vehicles: p?.vehicles, tel: e.target.value,
                 }))} />
        </div>
      </div>

      {side === 'customer' ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
          {party?.vehicles?.length ? (
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="vehIdx">เลือกจากทะเบียนรถของลูกค้า</label>
              <select className="in" id="vehIdx" value={vehicleIdx}
                      onChange={(e) => pickVehicle(Number(e.target.value))}>
                <option value={-1}>— ไม่ใช่รถในทะเบียน กรอกเอง —</option>
                {party.vehicles.map((v, i) => <option key={v.id} value={i}>{v.label}</option>)}
              </select>
              <span className="hint">
                เลือกแล้วเติมช่องข้างล่างให้ · แก้ช่องไหนก็ได้ ค่าที่แก้จะอยู่บนใบเคลมใบนี้เท่านั้น
              </span>
            </div>
          ) : null}

          {/*
            ก่อนหน้านี้ช่องรถเป็นตัวเลือกจากทะเบียนอย่างเดียวและไม่มีช่องเลขไมล์เลย
            ซึ่งเป็นอาการเดียวกับฟอร์มเอกสารขายก่อนช่วงที่ 8 — ตอนนั้นแก้ไม่ครบ
            แก้เฉพาะฟอร์มขายแล้วไม่ได้ไล่ดูว่าฟอร์มอื่นเป็นเหมือนกันไหม
          */}
          <VehicleFields veh={vehData} onChange={setVehData} />
        </div>
      ) : null}

      {/* 3 · รายการสินค้า */}
      <div className="row-fields f2" style={{ alignItems: 'end' }}>
        <div className="field">
          <label htmlFor="partq">ดึงสินค้าจากทะเบียน</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="in" id="partq" value={partQuery}
                   onChange={(e) => setPartQuery(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                   placeholder="รหัส ชื่อ หรือรหัส OEM" />
            <button className="btn" type="button" disabled={busy}
                    onClick={() => start(async () => {
                      setPartHits(await searchClaimPartsAction(partQuery));
                    })}>ค้นหา</button>
          </div>
          {partHits ? (
            <div className="tablewrap" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
              <table className="tbl">
                <tbody>
                  {partHits.length === 0 ? (
                    <tr><td className="subtle">ไม่พบสินค้า</td></tr>
                  ) : partHits.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.code}</td>
                      <td className="wrap">{p.name}</td>
                      <td className="num">คงเหลือ {p.qtyOnHand}</td>
                      <td><button className="btn" type="button" onClick={() => addPart(p)}>เลือก</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div className="field">
          <span className="hint">
            รายการที่ไม่ได้ดึงจากทะเบียนจะขึ้นบนใบพิมพ์แต่<b>ไม่ตัดสต๊อก</b>
          </span>
        </div>
      </div>

      <div className="tablewrap" style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ width: 130 }}>รหัสสินค้า</th>
              <th>รายการ</th>
              <th className="num" style={{ width: 90 }}>จำนวน</th>
              <th className="num" style={{ width: 110 }}>ต้นทุน/หน่วย</th>
              <th className="num" style={{ width: 110 }}>มูลค่ารวม</th>
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>
                  <input type="hidden" name={`it${i}_pid`} value={l.productId ?? ''} />
                  <input type="hidden" name={`it${i}_oem`} value={l.oem} />
                  <input type="hidden" name={`it${i}_unit`} value={l.unit} />
                  <input className="in mono" name={`it${i}_code`} value={l.code}
                         onChange={(e) => setLine(i, { code: e.target.value })} />
                </td>
                <td>
                  <input className="in" name={`it${i}_name`} value={l.name}
                         onChange={(e) => setLine(i, { name: e.target.value })}
                         placeholder="ชื่อรายการ" />
                  {!l.productId && l.name.trim() ? (
                    <span className="chip warn" style={{ marginLeft: 6 }}
                          title="ไม่ได้ผูกกับทะเบียนสินค้า จะไม่ตัดสต๊อก">ไม่ตัดสต๊อก</span>
                  ) : null}
                </td>
                <td className="num">
                  <input className="in mono" name={`it${i}_qty`} inputMode="decimal"
                         style={{ textAlign: 'right' }} value={l.qty}
                         onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} />
                  {l.onHand !== null && l.qty > l.onHand ? (
                    <span className="hint" style={{ color: 'var(--due)' }}>
                      คงเหลือ {l.onHand}
                    </span>
                  ) : null}
                </td>
                <td className="num">
                  <input className="in mono" name={`it${i}_cost`} inputMode="decimal"
                         style={{ textAlign: 'right' }} value={l.unitCost}
                         onChange={(e) => setLine(i, { unitCost: Number(e.target.value) || 0 })} />
                </td>
                <td className="num">{baht(l.qty * l.unitCost)}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="lnk" type="button" title="ลบบรรทัดนี้"
                          onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                <button className="btn" type="button"
                        onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                  + เพิ่มรายการอื่น ๆ
                </button>
              </td>
              <td className="num" style={{ fontWeight: 700 }}>{totalQty}</td>
              <td className="num" style={{ fontWeight: 600 }}>รวม</td>
              <td className="num" style={{ fontWeight: 700 }}>{baht(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4 · เหตุผลและผู้อนุมัติ */}
      <div className="row-fields f4">
        <div className="field" style={{ gridColumn: 'span 3' }}>
          <label htmlFor="reason">เหตุผลในการเคลม *</label>
          <input className="in" id="reason" name="reason" required
                 placeholder="เช่น ผ้าเบรกสึกผิดปกติภายในระยะรับประกัน" />
        </div>
        <div className="field">
          <label htmlFor="byWhom">ผู้อนุมัติ</label>
          <input className="in" id="byWhom" name="byWhom" placeholder="ชื่อผู้อนุมัติ" />
        </div>
        <div className="field" style={{ gridColumn: 'span 4' }}>
          <label htmlFor="note">หมายเหตุเพิ่มเติม</label>
          <input className="in" id="note" name="note" />
        </div>
      </div>

      <div className="err" style={{ marginTop: 14 }}>
        <b>ยังไม่ได้ตัดสต๊อก</b> — เมื่อกดบันทึก ระบบจะหักจำนวนออกจากสินค้าคงคลังทันที
        และ<b>แก้ไขใบนี้ไม่ได้อีก</b> ถ้าผิดต้องยกเลิกแล้วเปิดใบใหม่
        {unlinked > 0 ? ` · มี ${unlinked} รายการที่ไม่ผูกทะเบียนสินค้า จึงไม่ตัดสต๊อก` : ''}
      </div>

      <div className="formbar">
        <Submit />
        <span className="subtle">ตัดสต๊อก {lines.filter((l) => l.productId).length} รายการ</span>
      </div>
    </form>
  );
}
