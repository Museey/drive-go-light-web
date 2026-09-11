'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { bahttext, expiredLines, recTotals, type VatMode } from '@drivegolight/core';
import { saveDocAction, searchCustomersAction, searchProductsAction } from './actions';
import type { FormResult } from '@/lib/mutate';
import type { DocItemInput, PickedContact, PickedProduct, SalesDocInput, SalesKind } from '@/lib/sales';
import { baht, KIND_LABEL } from '@/lib/format';
import { VehicleFields } from './vehicle-fields';
import { ExpiryChip } from '@/components/expiry-chip';

const EPS = 0.004;
const money = (n: number) => (Math.round(n * 100) / 100);

const KIND_HELP: Record<SalesKind, string> = {
  QT: 'เสนอราคาให้ลูกค้าอนุมัติก่อนลงมือซ่อม ยังไม่เป็นหนี้และยังไม่ตัดสต๊อก',
  IV: 'ส่งมอบงานและแจ้งหนี้ โดยไม่มีภาษีมูลค่าเพิ่ม',
  IVT: 'ส่งมอบงานพร้อมใบกำกับภาษี — ลูกค้าต้องมีเลขประจำตัวผู้เสียภาษี',
  RC: 'รับเงินและปิดงาน — ตัดสต๊อกอะไหล่ตอนบันทึกใบนี้',
};

const emptyItem = (): DocItemInput => ({
  productId: null, code: '', oem: '', name: '', unit: '',
  qty: 1, unitPrice: 0, isService: false,
});

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending}>
      {pending ? 'กำลังบันทึก…' : label}
    </button>
  );
}

export function DocEditor({
  initial, vatRate, shopWhtRate, mode, lotExpiry, expiryWarnDays, today, cashOnOpen,
}: {
  initial: SalesDocInput;
  vatRate: number;
  shopWhtRate: number;
  mode: 'new' | 'edit';
  /** วันหมดอายุของล็อตที่จะถูกตัดก่อน ของอะไหล่ที่อยู่บนใบตั้งแต่เปิดหน้ามา */
  lotExpiry: Record<string, string>;
  expiryWarnDays: number;
  today: string;
  /** เปิดมาแบบขายหน้าร้าน — ตั้งรับเงินสดเต็มจำนวนไว้ให้ */
  cashOnOpen?: boolean;
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveDocAction, {});
  const [doc, setDoc] = useState<SalesDocInput>(initial);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<PickedContact[] | null>(null);
  const [partQuery, setPartQuery] = useState('');
  const [partResults, setPartResults] = useState<PickedProduct[] | null>(null);
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * ขายหน้าร้าน — เงินสดที่รับวิ่งตามยอดไปเรื่อย ๆ จนกว่าจะมีคนแตะช่องรับเงินเอง
   *
   * ถ้าตั้งค่าไว้ครั้งเดียวตอนเปิดหน้า ยอดจะเป็นศูนย์เสมอเพราะยังไม่มีรายการสักบรรทัด
   * แล้วพอใส่ของเสร็จกดบันทึก ใบจะกลายเป็นขายเชื่อทั้งที่รับเงินสดมาแล้ว
   */
  const [cashAuto, setCashAuto] = useState(Boolean(cashOnOpen));

  /*
   * วันหมดอายุของล็อตที่จะถูกตัด — ตั้งต้นจากอะไหล่ที่อยู่บนใบแล้ว
   * แล้วเติมเพิ่มทุกครั้งที่ค้นหาเจอของใหม่ ของที่หยิบเข้ามาทีหลังจึงเตือนได้เหมือนกัน
   */
  const [expiry, setExpiry] = useState<Record<string, string>>(lotExpiry);
  const learn = (found: PickedProduct[]) => setExpiry((e) => {
    const next = { ...e };
    for (const p of found) if (p.nearestExpiry) next[p.id] = p.nearestExpiry;
    return next;
  });

  const set = <K extends keyof SalesDocInput>(k: K, v: SalesDocInput[K]) =>
    setDoc((d) => ({ ...d, [k]: v }));

  const setItem = (i: number, patch: Partial<DocItemInput>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  /* ยอดคำนวณสด ๆ ด้วยสูตรชุดเดียวกับที่เซิร์ฟเวอร์ใช้ตอนบันทึก ตัวเลขจึงตรงกันเสมอ */
  const t = recTotals(
    {
      items: doc.items.map((i) => ({ qty: i.qty, price: i.unitPrice, svc: i.isService })),
      discount: doc.discount,
      vatMode: doc.vatMode,
      whtRate: doc.kind === 'QT' ? 0 : doc.whtRate,
      date: doc.docDate,
    },
    { vatRate },
  );

  useEffect(() => {
    if (!cashAuto) return;
    setDoc((d) => {
      const want = money(t.payable);
      const now = d.payments.length === 1 && d.payments[0]!.method === 'เงินสด'
        ? d.payments[0]!.amount : null;
      if (now === want || (now === null && want <= EPS)) return d;
      return { ...d, payments: want > EPS ? [{ method: 'เงินสด', amount: want, ref: '' }] : [] };
    });
  }, [cashAuto, t.payable]);

  const paidNow = money(doc.payments.reduce((s, p) => s + p.amount, 0));
  const remain = money(t.payable - paidNow);

  const searchCust = () => startTransition(async () => {
    setCustResults(await searchCustomersAction(custQuery));
  });
  const searchPart = () => startTransition(async () => {
    const found = await searchProductsAction(partQuery);
    setPartResults(found);
    learn(found);
  });

  const applyCustomer = (c: PickedContact) => {
    setPicked(c);
    setCustResults(null);
    setDoc((d) => ({
      ...d,
      partyId: c.id, partyType: c.type, partyName: c.name, partyTaxId: c.taxId,
      partyTel: c.tel, partyEmail: c.email, partyAddr: c.addr, partyAddrText: c.addrText,
      creditDays: d.creditDays || c.creditDays,
      vehicleId: c.vehicles[0]?.id ?? null,
      vehicle: c.vehicles[0]?.data ?? null,
    }));
  };

  const priceOf = (p: PickedProduct) =>
    doc.priceTier === 'C' ? p.priceC : doc.priceTier === 'B' ? p.priceB : p.priceA;

  /**
   * เปลี่ยนระดับราคา — ถามก่อนว่าจะปรับราคาบรรทัดที่ใส่ไปแล้วด้วยหรือไม่
   * ของเดิมปรับให้เงียบ ๆ ซึ่งอันตรายถ้าช่างแก้ราคาบางบรรทัดเองไว้
   */
  const changeTier = (tier: 'A' | 'B' | 'C') => {
    const linked = doc.items.filter((i) => i.productId);
    if (linked.length === 0) { set('priceTier', tier); return; }

    const yes = window.confirm(
      `เปลี่ยนเป็นราคาระดับ ${tier} แล้ว\n` +
      `ต้องการปรับราคาอะไหล่ ${linked.length} บรรทัดที่ใส่ไว้แล้วตามระดับใหม่ด้วยหรือไม่?\n\n` +
      'กดตกลง = ปรับราคาให้ · กดยกเลิก = เปลี่ยนเฉพาะรายการที่จะเพิ่มใหม่',
    );
    if (!yes) { set('priceTier', tier); return; }

    startTransition(async () => {
      const codes = linked.map((i) => i.code).filter(Boolean);
      const found = await searchProductsAction(codes.join(' '));
      learn(found);
      setDoc((d) => ({
        ...d,
        priceTier: tier,
        items: d.items.map((it) => {
          if (!it.productId) return it;
          const p = found.find((x) => x.id === it.productId);
          if (!p) return it;
          return { ...it, unitPrice: tier === 'C' ? p.priceC : tier === 'B' ? p.priceB : p.priceA };
        }),
      }));
    });
  };

  const addProduct = (p: PickedProduct) => {
    setDoc((d) => {
      const at = d.items.findIndex((i) => i.productId === p.id);
      if (at >= 0) {
        return { ...d, items: d.items.map((i, j) => (j === at ? { ...i, qty: i.qty + 1 } : i)) };
      }
      return {
        ...d,
        items: [...d.items, {
          productId: p.id, code: p.code, oem: p.oem, name: p.name, unit: p.unit,
          qty: 1, unitPrice: priceOf(p), isService: false,
        }],
      };
    });
  };

  /*
   * บรรทัดที่จะไปตัดของที่หมดอายุแล้ว — **เตือน ไม่ห้าม**
   *
   * อู่ที่กำลังประกอบรถอยู่แล้วระบบไม่ให้บันทึกใบเสร็จ เพราะน้ำมันเกินวันหมดอายุไปสองวัน
   * คือการทำให้งานหยุดโดยที่ของยังใช้ได้ การขวางกลางงานแย่กว่าการเตือน
   */
  const expired = expiredLines(doc.items, expiry, today);

  const isQuote = doc.kind === 'QT';
  const isReceipt = doc.kind === 'RC';
  const vatLocked = doc.kind === 'IV' || doc.kind === 'IVT';

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={JSON.stringify(doc)} />

      {state.error ? <div className="err" style={{ marginBottom: 16 }}>{state.error}</div> : null}

      <div className="card">
        <header>
          <h2>{KIND_LABEL[doc.kind]}</h2>
          <div className="spacer" />
          <span className="subtle">{KIND_HELP[doc.kind]}</span>
        </header>
        <div className="body">
          <div className="row-fields f4">
            <div className="field">
              <label htmlFor="docDate">วันที่เอกสาร</label>
              <input className="in mono" id="docDate" type="date" value={doc.docDate}
                     onChange={(e) => set('docDate', e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="tier">ระดับราคา</label>
              <select className="in" id="tier" value={doc.priceTier ?? 'A'}
                      onChange={(e) => changeTier(e.target.value as 'A' | 'B' | 'C')}>
                <option value="A">A — ราคาปกติ</option>
                <option value="B">B — ลูกค้าประจำ</option>
                <option value="C">C — ราคาพิเศษ</option>
              </select>
              <span className="hint">ใช้ตอนดึงราคาอะไหล่เข้ามา</span>
            </div>

            <div className="field">
              <label htmlFor="vatMode">ภาษีมูลค่าเพิ่ม</label>
              <select className="in" id="vatMode" value={doc.vatMode} disabled={vatLocked}
                      onChange={(e) => set('vatMode', e.target.value as VatMode)}>
                <option value="none">ไม่คิดภาษี</option>
                <option value="ex">ราคายังไม่รวมภาษี</option>
                <option value="in">ราคารวมภาษีแล้ว</option>
              </select>
              {vatLocked ? (
                <span className="hint">
                  {doc.kind === 'IVT' ? 'ใบกำกับภาษีต้องมี VAT เสมอ' : 'ใบส่งมอบแบบนี้ไม่มี VAT เสมอ'}
                </span>
              ) : null}
            </div>

            {!isQuote ? (
              <div className="field">
                <label htmlFor="whtRate">หัก ณ ที่จ่าย (%)</label>
                <input className="in mono" id="whtRate" inputMode="decimal" value={doc.whtRate}
                       onChange={(e) => set('whtRate', Number(e.target.value) || 0)} />
                <span className="hint">คิดจากค่าแรงเท่านั้น (ร้านตั้งไว้ {shopWhtRate}%)</span>
              </div>
            ) : null}

            {!isQuote ? (
              <div className="field">
                <label htmlFor="creditDays">เครดิต (วัน)</label>
                <input className="in mono" id="creditDays" inputMode="numeric" value={doc.creditDays}
                       onChange={(e) => set('creditDays', Math.max(0, Number(e.target.value) || 0))} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- ลูกค้า ---------- */}
      <div className={`card${state.field === 'party' ? ' bad' : ''}`}>
        <header><h2>ลูกค้า</h2>{doc.partyId ? <span className="chip ok">เลือกจากทะเบียนแล้ว</span> : null}</header>
        <div className="body">
          <div className="tag-row" style={{ marginBottom: 12 }}>
            <input className="in" value={custQuery} placeholder="ค้นชื่อ รหัส เบอร์โทร หรือทะเบียนรถ"
                   style={{ width: 300 }}
                   onChange={(e) => setCustQuery(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchCust(); } }} />
            <button className="btn" type="button" onClick={searchCust} disabled={pending}>ค้นหาลูกค้า</button>
            {doc.partyId ? (
              <button className="btn" type="button"
                      onClick={() => { setPicked(null); setDoc((d) => ({ ...d, partyId: null, vehicleId: null })); }}>
                ล้างการเลือก
              </button>
            ) : null}
          </div>

          {custResults ? (
            <div className="tablewrap" style={{ marginBottom: 12, maxHeight: 220, overflowY: 'auto' }}>
              <table className="tbl">
                <tbody>
                  {custResults.length === 0 ? (
                    <tr><td className="subtle">ไม่พบลูกค้า — พิมพ์ชื่อในช่องด้านล่างเพื่อออกเอกสารให้ลูกค้าขาจร</td></tr>
                  ) : custResults.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.code}</td>
                      <td className="wrap">{c.name}</td>
                      <td className="mono">{c.tel || '-'}</td>
                      <td className="subtle">{c.vehicles.length ? `${c.vehicles.length} คัน` : 'ไม่มีรถ'}</td>
                      <td><button className="btn" type="button" onClick={() => applyCustomer(c)}>เลือก</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="row-fields f3">
            <div className="field">
              <label>ชื่อลูกค้า *</label>
              <input className="in" value={doc.partyName}
                     onChange={(e) => set('partyName', e.target.value)} />
            </div>
            <div className="field">
              <label>เลขประจำตัวผู้เสียภาษี</label>
              <input className="in mono" value={doc.partyTaxId} inputMode="numeric"
                     onChange={(e) => set('partyTaxId', e.target.value)} />
            </div>
            <div className="field">
              <label>โทรศัพท์</label>
              <input className="in mono" value={doc.partyTel}
                     onChange={(e) => set('partyTel', e.target.value)} />
            </div>
          </div>

          {/* หน้าพิมพ์พิมพ์อีเมลออกมาอยู่แล้ว แต่ไม่เคยมีช่องให้กรอก จึงว่างเสมอ
              เว้นแต่คัดลอกมาจากทะเบียนลูกค้า */}
          <div className="field" style={{ marginTop: 12 }}>
            <label>อีเมล</label>
            <input className="in" type="email" value={doc.partyEmail}
                   onChange={(e) => set('partyEmail', e.target.value)} />
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>ที่อยู่บนเอกสาร</label>
            <textarea className="in" value={doc.partyAddrText}
                      onChange={(e) => set('partyAddrText', e.target.value)} />
          </div>

          {/* ---------- รถที่เข้ารับบริการ ---------- */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
            {picked && picked.vehicles.length > 0 ? (
              <div className="field" style={{ marginBottom: 12 }}>
                <label>เลือกจากทะเบียนรถของลูกค้า</label>
                <select className="in" value={doc.vehicleId ?? ''}
                        onChange={(e) => {
                          const v = picked.vehicles.find((x) => x.id === e.target.value);
                          setDoc((d) => ({
                            ...d,
                            vehicleId: v?.id ?? null,
                            vehicle: v ? { ...v.data } : (d.vehicle ?? {}),
                          }));
                        }}>
                  <option value="">— ไม่ใช่รถในทะเบียน กรอกเอง —</option>
                  {picked.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
                  เลือกแล้วเติมช่องข้างล่างให้ · แก้ช่องไหนก็ได้ ค่าที่แก้จะอยู่บนเอกสารใบนี้เท่านั้น
                </div>
              </div>
            ) : null}

            <VehicleFields veh={doc.vehicle ?? {}} onChange={(veh) => set('vehicle', veh)} />
          </div>
        </div>
      </div>

      {/* ---------- อาการที่แจ้ง (ใบเสนอราคา) ---------- */}
      {isQuote ? (
        <div className="card">
          <header><h2>อาการและสิ่งที่ตรวจพบ</h2></header>
          <div className="body row-fields f2">
            <div className="field">
              <label>ปัญหาที่ลูกค้าแจ้ง</label>
              {[0, 1, 2].map((i) => (
                <input key={i} className="in" style={{ marginBottom: 6 }}
                       value={doc.complaints[i] ?? ''}
                       onChange={(e) => {
                         const next = [...doc.complaints];
                         next[i] = e.target.value;
                         set('complaints', next);
                       }} />
              ))}
            </div>
            <div className="field">
              <label>ปัญหาที่อู่ตรวจพบ</label>
              {[0, 1, 2].map((i) => (
                <input key={i} className="in" style={{ marginBottom: 6 }}
                       value={doc.findings[i] ?? ''}
                       onChange={(e) => {
                         const next = [...doc.findings];
                         next[i] = e.target.value;
                         set('findings', next);
                       }} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- รายการ ---------- */}
      <div className={`card${state.field === 'items' ? ' bad' : ''}`}>
        <header>
          <h2>รายการอะไหล่และค่าแรง</h2>
          <div className="spacer" />
          <span className="subtle">{doc.items.length} บรรทัด</span>
        </header>

        {expired.length > 0 ? (
          <div className="body" style={{ paddingBottom: 0 }}>
            <div className="note" style={{ background: '#FCF1F1', borderColor: '#EEC4C4', color: '#7A2020' }}>
              <b>ของที่จะถูกตัดหมดอายุแล้ว {expired.length} บรรทัด</b> —{' '}
              {expired.map((x) => `บรรทัด ${x.index + 1} ${x.item.code || x.item.name}`).join(' · ')}
              <br />
              {doc.kind === 'RC'
                ? 'ใบนี้ตัดสต๊อกตอนบันทึก ระบบจะตัดล็อตที่หมดอายุก่อนตามลำดับหมดอายุก่อนออกก่อน'
                : 'ใบนี้ยังไม่ตัดสต๊อก แต่ของที่จะถูกตัดตอนออกใบเสร็จคือล็อตที่หมดอายุแล้ว'}
              {' '}บันทึกได้ตามปกติ — ตรวจของจริงบนชั้นวางก่อนส่งมอบ
            </div>
          </div>
        ) : null}

        <div className="toolbar">
          <input className="in" value={partQuery} placeholder="ค้นอะไหล่จากรหัส ชื่อ หรือ OEM"
                 style={{ width: 280 }}
                 onChange={(e) => setPartQuery(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPart(); } }} />
          <button className="btn" type="button" onClick={searchPart} disabled={pending}>ค้นหาอะไหล่</button>
          <button className="btn" type="button"
                  onClick={() => setDoc((d) => ({ ...d, items: [...d.items, emptyItem()] }))}>
            + บรรทัดเปล่า
          </button>
          <button className="btn" type="button"
                  onClick={() => setDoc((d) => ({
                    ...d,
                    items: [...d.items, { ...emptyItem(), code: 'LAB', name: 'ค่าแรง', unit: 'รายการ', isService: true }],
                  }))}>
            + ค่าแรง
          </button>
        </div>

        {partResults ? (
          <div className="tablewrap" style={{ maxHeight: 240, overflowY: 'auto', borderBottom: '1px solid var(--line)' }}>
            <table className="tbl">
              <tbody>
                {partResults.length === 0 ? (
                  <tr><td className="subtle">ไม่พบอะไหล่ — ใช้ปุ่ม “บรรทัดเปล่า” พิมพ์ชื่อเองได้</td></tr>
                ) : partResults.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.code}</td>
                    <td className="wrap">{p.name}</td>
                    <td className="num">{baht(priceOf(p))}</td>
                    <td className="num subtle">
                      คงเหลือ {p.qtyOnHand.toLocaleString('en-US')}
                      {p.nearestExpiry ? (
                        <>
                          {' '}
                          <ExpiryChip expiresOn={p.nearestExpiry} today={today} warnDays={expiryWarnDays} />
                        </>
                      ) : null}
                    </td>
                    <td><button className="btn" type="button" onClick={() => addProduct(p)}>เพิ่ม</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {doc.items.length === 0 ? (
          <div className="empty">ยังไม่มีรายการ — ค้นหาอะไหล่หรือกดเพิ่มบรรทัดเปล่า</div>
        ) : (
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th style={{ width: 100 }}>รหัส</th>
                  <th style={{ width: 110 }}>OEM</th>
                  <th>รายการ</th>
                  <th style={{ width: 80 }} className="num">จำนวน</th>
                  <th style={{ width: 70 }}>หน่วย</th>
                  <th style={{ width: 110 }} className="num">ราคา/หน่วย</th>
                  <th style={{ width: 110 }} className="num">จำนวนเงิน</th>
                  <th style={{ width: 60 }}>ค่าแรง</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {doc.items.map((it, i) => (
                  <tr key={i}>
                    <td className="subtle">{i + 1}</td>
                    <td>
                      <input className="in mono" style={{ padding: '4px 6px' }} value={it.code}
                             onChange={(e) => setItem(i, { code: e.target.value })} />
                    </td>
                    <td>
                      <input className="in mono" style={{ padding: '4px 6px' }} value={it.oem}
                             onChange={(e) => setItem(i, { oem: e.target.value })} />
                    </td>
                    <td>
                      <input className="in" style={{ padding: '4px 6px' }} value={it.name}
                             onChange={(e) => setItem(i, { name: e.target.value })} />
                      {it.productId && expiry[it.productId] ? (
                        <div style={{ marginTop: 3 }}>
                          <ExpiryChip expiresOn={expiry[it.productId]!} today={today}
                                      warnDays={expiryWarnDays} />
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <input className="in mono" style={{ padding: '4px 6px', textAlign: 'right' }}
                             inputMode="decimal" value={it.qty}
                             onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className="in" style={{ padding: '4px 6px' }} value={it.unit}
                             onChange={(e) => setItem(i, { unit: e.target.value })} />
                    </td>
                    <td>
                      <input className="in mono" style={{ padding: '4px 6px', textAlign: 'right' }}
                             inputMode="decimal" value={it.unitPrice}
                             onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="num">{baht(money(it.qty * it.unitPrice))}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={it.isService}
                             onChange={(e) => setItem(i, { isService: e.target.checked })} />
                    </td>
                    <td>
                      <button className="btn danger" type="button" style={{ padding: '2px 8px' }}
                              onClick={() => setDoc((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 200 }}>
            <label>ส่วนลด (บาท)</label>
            <input className="in mono" inputMode="decimal" value={doc.discount}
                   onChange={(e) => set('discount', Number(e.target.value) || 0)} />
          </div>

          <div className="totals">
            <div className="row"><span className="lbl">รวมเป็นเงิน</span><span>{baht(t.sub)}</span></div>
            {doc.discount > 0 ? (
              <div className="row"><span className="lbl">ส่วนลด</span><span>−{baht(t.disc)}</span></div>
            ) : null}
            {doc.vatMode !== 'none' ? (
              <>
                <div className="row"><span className="lbl">มูลค่าก่อนภาษี</span><span>{baht(t.net)}</span></div>
                <div className="row"><span className="lbl">ภาษีมูลค่าเพิ่ม {vatRate}%</span><span>{baht(t.vat)}</span></div>
              </>
            ) : null}
            <div className="row grand"><span>รวมทั้งสิ้น</span><span>{baht(t.grand)}</span></div>
            {t.wht > 0 ? (
              <>
                <div className="row">
                  <span className="lbl">หัก ณ ที่จ่าย {doc.whtRate}% (ค่าแรง {baht(t.whtBase)})</span>
                  <span>−{baht(t.wht)}</span>
                </div>
                <div className="row grand"><span>ยอดสุทธิ</span><span>{baht(t.payable)}</span></div>
              </>
            ) : null}
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-3)' }}>
              ({bahttext(t.payable)})
            </div>
          </div>
        </div>
      </div>

      {/* ---------- รับชำระเงิน ---------- */}
      {isReceipt ? (
        <div className="card">
          <header>
            <h2>รับชำระเงิน</h2>
            <div className="spacer" />
            <span className="subtle">
              รับแล้ว {baht(paidNow)} · {remain > EPS ? `คงเหลือเป็นเครดิต ${baht(remain)}` : 'ครบแล้ว'}
            </span>
          </header>
          <div className="body">
            <div className="row-fields f3">
              {['เงินสด', 'เงินโอน', 'บัตรเครดิต'].map((method) => {
                const at = doc.payments.findIndex((p) => p.method === method);
                const amount = at >= 0 ? doc.payments[at]!.amount : 0;
                return (
                  <div className="field" key={method}>
                    <label>{method}</label>
                    <input className="in mono" inputMode="decimal" value={amount || ''}
                           placeholder="0.00"
                           onChange={(e) => {
                             const v = Number(e.target.value) || 0;
                             setCashAuto(false);
                             setDoc((d) => {
                               const rest = d.payments.filter((p) => p.method !== method);
                               const ref = d.payments.find((p) => p.method === method)?.ref ?? '';
                               return {
                                 ...d,
                                 payments: v > 0 ? [...rest, { method, amount: v, ref }] : rest,
                               };
                             });
                           }} />
                    {method !== 'เงินสด' && amount > 0 ? (
                      <input className="in" style={{ marginTop: 6 }}
                             placeholder={method === 'เงินโอน' ? 'ธนาคาร / เลขที่อ้างอิง' : 'เลขที่อนุมัติบัตร'}
                             value={doc.payments[at]?.ref ?? ''}
                             onChange={(e) => setDoc((d) => ({
                               ...d,
                               payments: d.payments.map((p) =>
                                 p.method === method ? { ...p, ref: e.target.value } : p),
                             }))} />
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="tag-row" style={{ marginTop: 12 }}>
              {/* กดเองแล้วยอดหยุดวิ่งตาม — คนที่กดปุ่มนี้ตั้งใจล็อกตัวเลข ณ ตอนนั้น */}
              <button className="btn" type="button"
                      onClick={() => { setCashAuto(false); setDoc((d) => ({
                        ...d,
                        payments: [{ method: 'เงินสด', amount: t.payable, ref: '' }],
                      })); }}>
                รับเงินสดเต็มจำนวน
              </button>
              <button className="btn" type="button"
                      onClick={() => { setCashAuto(false); setDoc((d) => ({
                        ...d,
                        payments: [{ method: 'เงินโอน', amount: t.payable, ref: '' }],
                      })); }}>
                รับโอนเต็มจำนวน
              </button>
              <button className="btn" type="button"
                      onClick={() => { setCashAuto(false); setDoc((d) => ({ ...d, payments: [] })); }}>
                ยังไม่รับเงิน (เครดิต)
              </button>
            </div>

          </div>
        </div>
      ) : null}

      {/* การรับประกันและผู้ลงนามพิมพ์อยู่บนใบส่งมอบด้วย ไม่ใช่เฉพาะใบเสร็จ */}
      {!isQuote ? (
        <div className="card">
          <header><h2>การรับประกันและผู้ลงนาม</h2></header>
          <div className="body row-fields f2">
            <div className="field">
              <label>{isReceipt ? 'ผู้รับเงิน' : 'ผู้ส่งมอบงาน'}</label>
              <input className="in" value={doc.receivedBy}
                     onChange={(e) => set('receivedBy', e.target.value)} />
            </div>
            <div className="field">
              <label>เงื่อนไขการรับประกัน</label>
              <textarea className="in" value={doc.warrantyText}
                        onChange={(e) => set('warrantyText', e.target.value)} />
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <header><h2>ผู้ลงนาม</h2></header>
          <div className="body row-fields f2">
            <div className="field">
              <label>ผู้เสนอซ่อม</label>
              <input className="in" value={doc.proposer}
                     onChange={(e) => set('proposer', e.target.value)} />
            </div>
            <div className="field">
              <label>ผู้อนุมัติซ่อม</label>
              <input className="in" value={doc.approver}
                     onChange={(e) => set('approver', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="body">
          <div className="field">
            <label>หมายเหตุ</label>
            <textarea className="in" value={doc.note} onChange={(e) => set('note', e.target.value)} />
          </div>

          <div className="formbar">
            <Submit label={mode === 'new' ? `บันทึก${KIND_LABEL[doc.kind]}` : 'บันทึกการแก้ไข'} />
            <Link className="btn" href="/income">ยกเลิก</Link>
            {doc.parentDocId ? (
              <span className="subtle">ออกต่อจากเอกสารที่เลือกไว้</span>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
