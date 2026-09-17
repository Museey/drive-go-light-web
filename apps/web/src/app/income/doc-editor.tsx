'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { bahttext, expiredLines, lineAmount, recTotals, WHT_MIN_BASE, type VatMode } from '@drivegolight/core';
import { loadSourceAction, saveDocAction, scanPartAction, searchCustomersAction, searchOpenSourcesAction, searchProductsAction } from './actions';
import { useLiveSearch } from '@/components/use-live-search';
import { ConfirmSave } from '@/components/confirm-save';
import { DocSteps } from '@/components/doc-steps';
import type { FormResult } from '@/lib/mutate';
import type { DiscountMode, DocItemInput, PickedContact, PickedProduct, SalesDocInput, SalesKind } from '@/lib/sales';
import { baht, KIND_LABEL, thDate } from '@/lib/format';
import { ThaiDateField } from '@/components/thai-date-input';
import { formatDocNo } from '@/lib/doc-no';
import { BLANK_QTY, patchLine } from '@/lib/line-qty';
import { VehicleFields } from './vehicle-fields';
import { ExpiryChip } from '@/components/expiry-chip';
import { ScanBox } from '@/components/scan-box';
import { Icon } from '@/components/icon';

/**
 * ฟอร์มเอกสารขาย — ออกแบบใหม่ 13 ก.ย. 69 ให้เหมือนกรอกบนเอกสารจริง
 *
 *   [ข้อมูลลูกค้า | ข้อมูลเอกสาร]     ← สองคอลัมน์
 *   [อาการที่แจ้ง | อาการที่พบ]       ← เฉพาะใบเสนอราคา (ของเดิม คงไว้)
 *   [รายการสินค้า]                  ← 5 บรรทัดว่างตั้งแต่เปิด ค้นหาสินค้าในบรรทัด ผลหล่นใต้บรรทัด 5 แถว
 *   [หมายเหตุเอกสาร | สรุปยอด]       ← ส่วนลดท้ายบิลสลับ %/บาท · รับเงิน (ใบเสร็จ) · ปุ่มบันทึก
 *
 * ยิงบาร์โค้ดได้ทุกชนิดเอกสารตั้งแต่ใบเสนอราคา (ScanBox บนตาราง)
 * กดบันทึก → แผงยืนยัน "ตรวจสอบถูกต้องแล้ว:" ด้านขวา ก่อนส่งจริง
 *
 * สูตรยอดใช้ชุดเดียวกับเซิร์ฟเวอร์ (recTotals) ตัวเลขบนจอจึงเท่ากับที่บันทึกเสมอ
 */

const EPS = 0.004;
const money = (n: number) => (Math.round(n * 100) / 100);
const MIN_ROWS = 5;

const KIND_HELP: Record<SalesKind, string> = {
  QT: 'เสนอราคาให้ลูกค้าอนุมัติก่อนลงมือซ่อม ยังไม่เป็นหนี้และยังไม่ตัดสต๊อก',
  IV: 'ส่งมอบงานและแจ้งหนี้ โดยไม่มีภาษีมูลค่าเพิ่ม',
  IVT: 'ส่งมอบงานพร้อมใบกำกับภาษี — ลูกค้าต้องมีเลขประจำตัวผู้เสียภาษี',
  RC: 'รับเงินและปิดงาน — ตัดสต๊อกอะไหล่ตอนบันทึกใบนี้',
};

const emptyItem = (): DocItemInput => ({
  productId: null, kitId: null, code: '', oem: '', name: '', unit: '',
  qty: BLANK_QTY, unitPrice: 0, isService: false, discPct: 0,
});

/** บรรทัดที่มีของจริง — บรรทัดว่างที่เตรียมไว้ไม่ถูกส่งไปบันทึก */
const isRealItem = (it: DocItemInput) => Boolean(it.productId) || it.name.trim() !== '' || it.code.trim() !== '';

/** เติมบรรทัดว่างให้ครบขั้นต่ำ เหมือนกระดาษที่มีช่องรอไว้ */
const padRows = (items: DocItemInput[]) =>
  items.length >= MIN_ROWS ? items : [...items, ...Array.from({ length: MIN_ROWS - items.length }, emptyItem)];

/** ข้อความอ้างอิงบัญชีที่บันทึกลงรายการรับเงิน */
const bankRef = (b: { bank: string; no: string; name: string }) => `${b.bank} เลขที่ ${b.no}${b.name ? ` (${b.name})` : ''}`;

/** ทะเบียนรถเก็บจังหวัดเป็น plateProvince ส่วนเอกสารใช้ plateProv — ให้ทั้งสองคีย์เพื่อไม่หล่น */
const normVeh = (d: Record<string, string>) => ({ ...d, plateProv: d.plateProv ?? d.plateProvince ?? '' });

const daysBetweenIso = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);

const addDaysIso = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/* ---------- บรรทัดสินค้า: ช่องรหัสค้นหาสด ผลหล่นเป็นแถวใต้บรรทัด ---------- */
function LineRow({
  i, item, isLast, stock, today, expiryWarnDays, priceOf, onChange, onPick, onRemove, onEnterLast, onFound,
}: {
  i: number;
  item: DocItemInput;
  isLast: boolean;
  stock: number | null;
  today: string;
  expiryWarnDays: number;
  priceOf: (p: PickedProduct) => number;
  onChange: (patch: Partial<DocItemInput>) => void;
  onPick: (p: PickedProduct) => void;
  onRemove: () => void;
  onEnterLast: () => void;
  onFound: (found: PickedProduct[]) => void;
}) {
  const [query, setQuery] = useState('');
  const { results, busy, clear } = useLiveSearch(query, searchProductsAction, { onFound });
  const amount = lineAmount({ qty: item.qty, price: item.unitPrice, discPct: item.discPct ?? 0 });

  const pick = (p: PickedProduct) => { onPick(p); setQuery(''); clear(); };
  /* Enter ในบรรทัด: มีผลค้นหา = เลือกตัวแรก · บรรทัดสุดท้าย = เพิ่มบรรทัด · นอกนั้นปล่อยให้ตัวกลางย้ายไปช่องถัดไป */
  const enterKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    if (results && results.length > 0) { e.preventDefault(); e.stopPropagation(); pick(results[0]!); return; }
    if (isLast && (e.target as HTMLElement).classList.contains('mono') && !item.name) { e.preventDefault(); e.stopPropagation(); onEnterLast(); }
  };

  return (
    <>
      <tr>
        <td className="idx">{i + 1}</td>
        {/* ความกว้างคอลัมน์อยู่ที่ CSS (table.lines .c-*) — ช่องกรอกเต็มคอลัมน์ ชื่อสินค้าได้ที่เหลือทั้งหมด */}
        <td className="c-code">
          <input className="in mono" placeholder="พิมพ์รหัส / ชื่อ" value={query || item.code}
                 onChange={(e) => { setQuery(e.target.value); onChange({ code: e.target.value, productId: null }); }}
                 onKeyDown={enterKey} />
        </td>
        <td className="c-name">
          <input className="in" placeholder="— เลือกสินค้า หรือพิมพ์ชื่อเอง —" value={item.name}
                 onChange={(e) => onChange({ name: e.target.value })} onKeyDown={enterKey} />
        </td>
        <td className="c-qty">
          <input className="in mono" inputMode="decimal" style={{ textAlign: 'right' }} value={item.qty}
                 onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })} onKeyDown={enterKey} />
        </td>
        <td className="stock">{item.productId && stock !== null ? stock.toLocaleString('en-US') : '-'}</td>
        <td className="c-unit">
          <input className="in" value={item.unit} placeholder="หน่วย"
                 onChange={(e) => onChange({ unit: e.target.value })} onKeyDown={enterKey} />
        </td>
        <td className="c-price">
          <input className="in mono" inputMode="decimal" style={{ textAlign: 'right' }} value={item.unitPrice}
                 onChange={(e) => onChange({ unitPrice: Number(e.target.value) || 0 })} onKeyDown={enterKey} />
        </td>
        <td className="c-disc">
          <input className="in mono" inputMode="decimal" style={{ textAlign: 'right' }} value={item.discPct ?? 0}
                 title="ส่วนลดรายบรรทัด (%)"
                 onChange={(e) => onChange({ discPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                 onKeyDown={enterKey} />
        </td>
        <td className="amt">{baht(amount)}</td>
        <td style={{ width: 54, textAlign: 'center' }}>
          <input type="checkbox" checked={item.isService} title="ค่าแรง (ฐานหัก ณ ที่จ่าย)"
                 onChange={(e) => onChange({ isService: e.target.checked })} />
        </td>
        <td style={{ width: 40 }}>
          <button className="del" type="button" onClick={onRemove} title="ลบบรรทัด" aria-label="ลบบรรทัด">✕</button>
        </td>
      </tr>

      {/* ผลค้นหาของบรรทัดนี้ — ราว 5 แถว เกินเลื่อน กดได้ทั้งแถว (ข้อ 7, 13) */}
      {query.trim() && (results || busy) ? (
        <tr className="hitrow">
          <td colSpan={11}>
            {busy && !results ? <div className="subtle" style={{ padding: '6px 10px' }}>กำลังค้น…</div> : null}
            {results ? (
              <div className="tablewrap hits5">
                <table className="tbl">
                  <tbody>
                    {results.length === 0 ? (
                      <tr><td className="subtle">ไม่พบในทะเบียน — พิมพ์ชื่อในช่องชื่อสินค้าได้เลย (จะเป็นรายการค้างทำ)</td></tr>
                    ) : results.map((p) => (
                      <tr key={p.id} className="pick" role="button" tabIndex={0}
                          onClick={() => pick(p)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p); } }}>
                        <td className="mono">{p.kitId ? <span className="chip ok" style={{ marginRight: 4 }}>ชุด</span> : null}{p.code}</td>
                        <td className="wrap">{p.name}</td>
                        <td className="num">{baht(priceOf(p))}</td>
                        <td className="num subtle">
                          คงเหลือ {p.qtyOnHand.toLocaleString('en-US')}
                          {p.nearestExpiry ? <> <ExpiryChip expiresOn={p.nearestExpiry} today={today} warnDays={expiryWarnDays} /></> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ====================================================================== */

export function DocEditor({
  initial, vatRate, shopWhtRate, mode, lotExpiry, expiryWarnDays, today, cashOnOpen, docNo, banks, returnTo, docNoPreview,
}: {
  initial: SalesDocInput;
  vatRate: number;
  shopWhtRate: number;
  mode: 'new' | 'edit';
  /** วันหมดอายุของล็อตที่จะถูกตัดก่อน ของอะไหล่ที่อยู่บนใบตั้งแต่เปิดหน้ามา */
  lotExpiry: Record<string, string>;
  expiryWarnDays: number;
  today: string;
  /** เปิดหน้าใหม่แบบขายหน้าร้าน — ให้ยอดเงินสดวิ่งตามยอดใบ */
  cashOnOpen?: boolean;
  /** เลขที่ของใบที่กำลังแก้ — ใบใหม่ระบบออกให้ตอนบันทึก */
  docNo?: string;
  /** เลขถัดไปของเดือน (ใบใหม่) — โชว์ทันที ยืนยันตอนบันทึก */
  docNoPreview?: { seq: number; month: string };
  /** บัญชีรับโอนของร้าน — รับโอนแล้วเลือกว่าเข้าบัญชีไหน (ตั้งที่ 07) */
  banks?: { bank: string; no: string; name: string }[];
  /** บันทึกแล้วกลับไปหน้าเดิมพร้อมปุ่มพิมพ์ (ผู้ใช้กำหนด) — ไม่ส่ง = ไปหน้าเอกสาร */
  returnTo?: string;
}) {
  const [state, action] = useActionState<FormResult, FormData>(saveDocAction, {});
  const [doc, setDoc] = useState<SalesDocInput>({
    ...initial,
    discountMode: initial.discountMode ?? 'baht',
    discountPct: initial.discountPct ?? 0,
    items: padRows(initial.items.map((it) => ({ ...it, discPct: it.discPct ?? 0 }))),
  });
  const [custQuery, setCustQuery] = useState('');
  const [plateQuery, setPlateQuery] = useState('');
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const [, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [precheck, setPrecheck] = useState('');
  const [printAfter, setPrintAfter] = useState(false);
  /* โฟกัสช่องยอดเมื่อกด "ชำระบางส่วน" — ใช้ autoFocus ผ่าน state แทนการอ่าน DOM */
  const [focusPartial, setFocusPartial] = useState(false);
  /* อ้างอิงใบเสนอราคา/ใบส่งมอบจากในฟอร์ม: ค้นใบที่เปิดค้าง เลือกแล้วดึงลูกค้า รถ รายการ มาทั้งชุด */
  const [srcQuery, setSrcQuery] = useState('');
  const [srcNo, setSrcNo] = useState('');
  const [srcBusy, setSrcBusy] = useState(false);
  const srcTarget: 'invoice' | 'receipt' = initial.kind === 'RC' ? 'receipt' : 'invoice';
  const { results: srcResults, clear: clearSrc } = useLiveSearch(srcQuery, (q: string) => searchOpenSourcesAction(srcTarget, q));
  const applySource = async (o: { id: string; docNo: string }) => {
    setSrcBusy(true);
    try {
      const src = await loadSourceAction(o.id);
      if (!src) return;
      setDoc((d) => ({
        ...src, kind: d.kind, docDate: d.docDate, parentDocId: o.id,
        vatMode: d.kind === 'IV' ? 'none' : (src.vatMode === 'none' && d.kind === 'IVT' ? 'ex' : src.vatMode),
        whtRate: d.kind === 'QT' ? 0 : d.whtRate,
        warrantyText: d.kind === 'RC' ? (d.warrantyText || src.warrantyText) : src.warrantyText,
        payments: [],
      }));
      setSrcNo(o.docNo); setSrcQuery(''); clearSrc();
    } finally { setSrcBusy(false); }
  };
  /* เซิร์ฟเวอร์ตอบผิดพลาด → ปิดแผงยืนยันให้เห็นข้อความข้างบน ไม่ค้างทับหน้า */
  useEffect(() => { if (state.error) setConfirm(false); }, [state]);
  /* ตรวจก่อนเปิดแผง — เงื่อนไขชุดเดียวกับเซิร์ฟเวอร์ จะได้ไม่ต้องกดสองรอบ */
  const tryConfirm = () => {
    const real = doc.items.filter(isRealItem);
    const bad =
      !doc.partyName.trim() ? 'ต้องระบุชื่อลูกค้า — เลือกจากทะเบียนหรือพิมพ์เอง'
      : real.length === 0 ? 'ต้องมีรายการอย่างน้อยหนึ่งบรรทัด'
      : real.some((i) => !i.name.trim()) ? 'ทุกบรรทัดต้องมีชื่อรายการ (เลือกจากทะเบียนหรือพิมพ์ชื่อ)'
      : real.some((i) => !(i.qty > 0)) ? 'จำนวนทุกบรรทัดต้องมากกว่า 0'
      : real.some((i) => i.unitPrice < 0) ? 'ราคาต้องไม่ติดลบ'
      : !/^\d{4}-\d{2}-\d{2}$/.test(doc.docDate) ? 'วันที่เอกสารไม่ถูกต้อง'
      : '';
    setPrecheck(bad);
    if (!bad) setConfirm(true);
  };
  const [cashAuto, setCashAuto] = useState(Boolean(cashOnOpen));
  const [expiry, setExpiry] = useState<Record<string, string>>(lotExpiry);
  /** คงเหลือของสินค้าที่เคยเห็นในหน้านี้ — ไว้โชว์คอลัมน์ "คงเหลือ" */
  const [stock, setStock] = useState<Record<string, number>>({});
  const [notFound, setNotFound] = useState('');

  const learn = (found: PickedProduct[]) => {
    setExpiry((e) => {
      const next = { ...e };
      for (const p of found) if (p.nearestExpiry) next[p.id] = p.nearestExpiry;
      return next;
    });
    setStock((s) => {
      const next = { ...s };
      for (const p of found) next[p.id] = p.qtyOnHand;
      return next;
    });
  };

  const { results: custResults, busy: custBusy, clear: clearCust } =
    useLiveSearch(custQuery, searchCustomersAction);

  const set = <K extends keyof SalesDocInput>(k: K, v: SalesDocInput[K]) =>
    setDoc((d) => ({ ...d, [k]: v }));
  /* บรรทัดว่างจำนวน 0 · เริ่มมีของขึ้น 1 · ลบจนว่างกลับ 0 — กติกาที่ lib/line-qty.ts ใช้ร่วมทุกฟอร์ม */
  const setItem = (i: number, patch: Partial<DocItemInput>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? patchLine(it, patch, isRealItem) : it)) }));

  const priceOf = (p: PickedProduct) =>
    doc.priceTier === 'C' ? p.priceC : doc.priceTier === 'B' ? p.priceB : p.priceA;

  /* ---------- ยอด (สูตรเดียวกับเซิร์ฟเวอร์) ---------- */
  const realItems = doc.items.filter(isRealItem);
  const coreItems = realItems.map((i) => ({ qty: i.qty, price: i.unitPrice, svc: i.isService, discPct: i.discPct ?? 0 }));
  const subBefore = coreItems.reduce((s, it) => s + lineAmount(it), 0);
  const effDiscount = doc.discountMode === 'pct'
    ? money(subBefore * (doc.discountPct ?? 0) / 100)
    : money(Math.max(0, doc.discount || 0));
  const t = recTotals(
    { items: coreItems, discount: effDiscount, vatMode: doc.vatMode, whtRate: doc.kind === 'QT' ? 0 : doc.whtRate, date: doc.docDate },
    { vatRate },
  );

  useEffect(() => {
    if (!cashAuto) return;
    setDoc((d) => {
      const want = money(t.payable);
      const now = d.payments.length === 1 && d.payments[0]!.method === 'เงินสด' ? d.payments[0]!.amount : null;
      if (now === want || (now === null && want <= EPS)) return d;
      return { ...d, payments: want > EPS ? [{ method: 'เงินสด', amount: want, ref: '' }] : [] };
    });
  }, [cashAuto, t.payable]);

  const paidNow = money(doc.payments.reduce((s, p) => s + p.amount, 0));
  const remain = money(t.payable - paidNow);

  /* ---------- ลูกค้า ---------- */
  const applyCustomer = (c: PickedContact) => {
    setPicked(c);
    setCustQuery('');
    setPlateQuery('');
    clearCust();
    setDoc((d) => ({
      ...d,
      partyId: c.id, partyType: c.type, partyName: c.name, partyTaxId: c.taxId,
      partyTel: c.tel, partyEmail: c.email, partyAddr: c.addr, partyAddrText: c.addrText,
      creditDays: d.creditDays || c.creditDays,
      vehicleId: c.vehicles[0]?.id ?? null,
      vehicle: c.vehicles[0] ? normVeh(c.vehicles[0].data) : null,
    }));
  };

  /* ---------- ระดับราคา ---------- */
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
      const found = await searchProductsAction(linked.map((i) => i.code).filter(Boolean).join(' '));
      learn(found);
      setDoc((d) => ({
        ...d, priceTier: tier,
        items: d.items.map((it) => {
          const p = it.productId ? found.find((x) => x.id === it.productId) : undefined;
          return p ? { ...it, unitPrice: tier === 'C' ? p.priceC : tier === 'B' ? p.priceB : p.priceA } : it;
        }),
      }));
    });
  };

  /* ---------- ใส่สินค้าลงบรรทัด ---------- */
  const fillRow = (i: number, p: PickedProduct, qty = 1) => {
    learn([p]);
    setItem(i, { productId: p.kitId ? null : p.id, kitId: p.kitId ?? null, code: p.code, oem: p.oem, name: p.name, unit: p.unit, qty, unitPrice: priceOf(p) });
  };

  /** ยิงบาร์โค้ด/เพิ่มจากที่อื่น — ตัวเดิมที่มีอยู่แล้วให้เพิ่มจำนวน ไม่มีก็ลงบรรทัดว่างแรก */
  const addProduct = (p: PickedProduct, qty = 1) => {
    learn([p]);
    setDoc((d) => {
      const at = d.items.findIndex((i) => i.productId === p.id);
      if (at >= 0) return { ...d, items: d.items.map((i, j) => (j === at ? { ...i, qty: i.qty + qty } : i)) };
      const line = { ...emptyItem(), productId: p.kitId ? null : p.id, kitId: p.kitId ?? null, code: p.code, oem: p.oem, name: p.name, unit: p.unit, qty, unitPrice: priceOf(p) };
      const blank = d.items.findIndex((i) => !isRealItem(i));
      return blank >= 0
        ? { ...d, items: d.items.map((i, j) => (j === blank ? line : i)) }
        : { ...d, items: [...d.items, line] };
    });
  };

  const addRow = (patch: Partial<DocItemInput> = {}) =>
    setDoc((d) => ({ ...d, items: [...d.items, patchLine(emptyItem(), patch, isRealItem)] }));
  const removeRow = (i: number) =>
    setDoc((d) => ({ ...d, items: padRows(d.items.filter((_, j) => j !== i)) }));

  const onScan = async (raw: string) => {
    const r = await scanPartAction(raw);
    if (r.kind === 'one') {
      addProduct(r.product, r.qty);
      return { ok: true, message: `${r.product.code} ${r.product.name} · ${r.qty} ${r.product.unit}` };
    }
    if (r.kind === 'inactive') return { ok: false, message: `${r.code} ${r.name} ปิดใช้งานอยู่ — เปิดใช้งานที่ทะเบียนสินค้าก่อน` };
    if (r.kind === 'many') {
      /* หลายตัว — วางคำค้นลงบรรทัดว่างแรก ให้ผู้ใช้เลือกจากผลใต้บรรทัดนั้น */
      const blank = doc.items.findIndex((i) => !isRealItem(i));
      setItem(blank >= 0 ? blank : doc.items.length, { code: r.term });
      return { ok: false, message: `ตรงกับสินค้า ${r.count} รายการ — พิมพ์ต่อในบรรทัดที่ขึ้นรหัสให้แล้วเลือก` };
    }
    setNotFound(r.term);
    return { ok: false, message: `ไม่พบ "${r.term}"` };
  };

  const expired = expiredLines(realItems, expiry, today);
  const isQuote = doc.kind === 'QT';
  const isReceipt = doc.kind === 'RC';
  const vatLocked = doc.kind === 'IV' || doc.kind === 'IVT';
  const dueDate = !isQuote && doc.creditDays > 0 ? addDaysIso(doc.docDate, doc.creditDays) : doc.docDate;

  /* ส่งเฉพาะบรรทัดที่มีของ และส่วนลดตามที่ผู้ใช้เลือก (เซิร์ฟเวอร์คำนวณบาทที่มีผลจริงเอง) */
  const payload = useMemo(() => JSON.stringify({ ...doc, items: realItems }), [doc, realItems]);

  const confirmLines = [
    { label: 'ลูกค้า', value: doc.partyName || '(เงินสด / ไม่ระบุ)' },
    { label: 'วันที่', value: thDate(doc.docDate) },
    { label: 'รายการ', value: `${realItems.length} บรรทัด` },
    ...(effDiscount > 0 ? [{ label: 'ส่วนลดท้ายบิล', value: `−${baht(effDiscount)}` }] : []),
    { label: 'รวมทั้งสิ้น', value: baht(t.grand) },
    ...(t.wht > 0 ? [{ label: 'ยอดสุทธิ', value: baht(t.payable) }] : []),
    ...(isReceipt ? [{ label: 'รับชำระ', value: paidNow > EPS ? baht(paidNow) : 'ยังไม่รับ (เครดิต)' }] : []),
  ];

  return (
    <form autoComplete="off" action={action} id="doc-form"
          /* Enter ในช่องกรอกห้ามส่งฟอร์มข้ามแผงยืนยัน — บันทึกจริงผ่านปุ่มในแผงเท่านั้น */
          onKeyDown={(e) => {
            const el = e.target as HTMLElement;
            if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault();
          }}>
      <input type="hidden" name="payload" value={payload} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {printAfter ? <input type="hidden" name="printAfter" value="1" /> : null}

      {state.error ? <div className="err" style={{ marginBottom: 16 }}>{state.error}</div> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <header>
          <h2>{mode === 'new' ? `สร้าง${KIND_LABEL[doc.kind]}` : `แก้ไข${KIND_LABEL[doc.kind]}`}</h2>
          <div className="spacer" />
          <span className="subtle">{KIND_HELP[doc.kind]}</span>
        </header>
      </div>
      {/* ขั้นตอน A→B→C — ขั้นที่กำลังทำเป็นสีเข้ม (เจ๊ก ข้อ 5) */}
      <DocSteps kind={doc.kind} canContinue={false} />

      {/* ================= หัวเอกสาร: ลูกค้า | เอกสาร ================= */}
      <div className="docgrid">
        <div className={`card${state.field === 'party' ? ' bad' : ''}`}>
          <header>
            <span className="ic"><Icon name="people" size={18} color="#5B3FBF" /></span>
            <h2>ข้อมูลลูกค้า</h2>
          </header>
          <div className="body">
            {/* ค้นจากช่องชื่อ/ทะเบียนโดยตรง — พิมพ์แล้วผลขึ้นใต้ช่อง 5 แถว เลือกแล้วเติมทุกช่องให้ */}
            {/* บรรทัด 1: ชื่อ | เลขประจำตัวผู้เสียภาษี · บรรทัด 2: ที่อยู่ | โทร (ผู้ใช้กำหนด) — ทะเบียนรถอยู่ที่การ์ดรถ */}
            <div className="row-fields f2">
              <div className="field">
                <label>ชื่อลูกค้า * <span className="hint">พิมพ์ชื่อ รหัส หรือเบอร์ — ข้อมูลขึ้นให้อัตโนมัติ (ว่าง = ขาจร)</span></label>
                <input className="in" value={doc.partyName} placeholder="พิมพ์ชื่อเพื่อค้นหา"
                       onChange={(e) => { const v = e.target.value; setDoc((d) => ({ ...d, partyName: v, partyId: null })); setCustQuery(v); }} />
              </div>
              <div className="field">
                <label>เลขประจำตัวผู้เสียภาษี</label>
                <input className="in mono" inputMode="numeric" value={doc.partyTaxId} onChange={(e) => set('partyTaxId', e.target.value)} />
              </div>
            </div>
            <div className="tag-row" style={{ marginTop: 6 }}>
              {custBusy ? <span className="subtle">กำลังค้น…</span> : null}
              {doc.partyId ? (
                <>
                  <span className="chip ok">เลือกจากทะเบียนแล้ว</span>
                  <button className="btn sm" type="button"
                          onClick={() => { setPicked(null); setDoc((d) => ({ ...d, partyId: null, vehicleId: null })); }}>
                    ล้างการเลือก
                  </button>
                </>
              ) : null}
            </div>

            {custResults ? (
              <div className="tablewrap hits5" style={{ margin: '8px 0 12px', border: '1px solid var(--line)', borderRadius: 8 }}>
                <table className="tbl">
                  <tbody>
                    {custResults.length === 0 ? (
                      <tr><td className="subtle">ไม่พบในทะเบียน — ใช้ชื่อที่พิมพ์เป็นลูกค้าขาจรได้เลย</td></tr>
                    ) : custResults.map((c) => (
                      <tr key={c.id} className="pick" role="button" tabIndex={0}
                          onClick={() => applyCustomer(c)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyCustomer(c); } }}>
                        <td className="mono">{c.code}</td>
                        <td className="wrap">{c.name}</td>
                        <td className="mono">{c.tel || '-'}</td>
                        <td className="subtle">{c.vehicles.length ? `${c.vehicles.length} คัน` : 'ไม่มีรถ'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="row-fields addr-tel" style={{ marginTop: 10 }}>
              <div className="field">
                <label>ที่อยู่ – รหัสไปรษณีย์</label>
                <textarea className="in" rows={2} value={doc.partyAddrText} placeholder="— แสดงอัตโนมัติเมื่อเลือกจากทะเบียน —"
                          onChange={(e) => set('partyAddrText', e.target.value)} />
              </div>
              <div className="field">
                <label>เบอร์โทร</label>
                <input className="in mono" value={doc.partyTel} onChange={(e) => set('partyTel', e.target.value)} />
              </div>
            </div>

            {/* รถที่เข้ารับบริการ — พิมพ์ทะเบียนแล้วรายละเอียดขึ้นตามทะเบียนลูกค้า */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
              <div className="tag-row" style={{ marginBottom: 8 }}>
                <b>🚗 รถที่เข้ารับบริการ</b>
                <input className="in mono search" value={plateQuery} placeholder="กรอกทะเบียน — ค้นจากรถในทะเบียนลูกค้า" style={{ width: 260 }}
                       onChange={(e) => { setPlateQuery(e.target.value); setCustQuery(e.target.value); }} />
              </div>
              {picked && picked.vehicles.length > 0 ? (
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>เลือกจากทะเบียนรถของลูกค้า</label>
                  <select className="in" value={doc.vehicleId ?? ''}
                          onChange={(e) => {
                            const v = picked.vehicles.find((x) => x.id === e.target.value);
                            setDoc((d) => ({ ...d, vehicleId: v?.id ?? null, vehicle: v ? normVeh(v.data) : (d.vehicle ?? {}) }));
                          }}>
                    <option value="">— ไม่ใช่รถในทะเบียน กรอกเอง —</option>
                    {picked.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
              ) : null}
              <VehicleFields veh={doc.vehicle ?? {}} onChange={(veh) => set('vehicle', veh)} />
            </div>
          </div>
        </div>

        <div className="card">
          <header>
            <span className="ic"><Icon name="doc$" size={18} color="#1D7A5F" /></span>
            <h2>ข้อมูลเอกสาร</h2>
          </header>
          <div className="body">
            <div className="row-fields f2">
              <div className="field">
                <label>เลขที่เอกสาร</label>
                <div className="in mono" style={{ background: 'var(--bg)', fontWeight: 700 }}>
                  {docNo ?? (docNoPreview && doc.docDate.slice(0, 7) === docNoPreview.month
                    ? formatDocNo(doc.kind, doc.docDate, docNoPreview.seq)
                    : 'ออกเลขตามเดือนที่เลือกตอนบันทึก')}
                </div>
                {!docNo ? <span className="hint">เลขถัดไปของเดือน ขึ้นทันที · ยืนยันเป็นเลขจริงตอนบันทึก</span> : null}
              </div>
              <div className="field">
                <label htmlFor="docDate">วันที่ออกเอกสาร</label>
                <ThaiDateField id="docDate" value={doc.docDate} onChange={(iso) => set('docDate', iso)} />
              </div>
            </div>

            <div className="row-fields f2" style={{ marginTop: 10 }}>
              <div className="field">
                <label htmlFor="tier">ระดับราคา</label>
                <select className="in amber" id="tier" value={doc.priceTier ?? 'A'} onChange={(e) => changeTier(e.target.value as 'A' | 'B' | 'C')}>
                  <option value="A">A — ราคาปกติ</option>
                  <option value="B">B — ลูกค้าประจำ</option>
                  <option value="C">C — ราคาพิเศษ</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="vatMode">ภาษีมูลค่าเพิ่ม</label>
                <select className="in amber" id="vatMode" value={doc.vatMode} disabled={vatLocked} onChange={(e) => set('vatMode', e.target.value as VatMode)}>
                  <option value="none">ไม่คิดภาษี</option>
                  <option value="ex">ราคายังไม่รวมภาษี</option>
                  <option value="in">ราคารวมภาษีแล้ว</option>
                </select>
                {vatLocked ? <span className="hint">{doc.kind === 'IVT' ? 'ใบกำกับภาษีต้องมี VAT เสมอ' : 'ใบส่งมอบแบบนี้ไม่มี VAT เสมอ'}</span> : null}
              </div>
            </div>

            {!isQuote ? (
              <>
                <div className="row-fields f3" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label>เงื่อนไขชำระเงิน</label>
                    <select className="in amber" value={doc.creditDays > 0 ? 'credit' : 'cash'}
                            onChange={(e) => set('creditDays', e.target.value === 'credit' ? Math.max(doc.creditDays, 30) : 0)}>
                      <option value="cash">เงินสด</option>
                      <option value="credit">เครดิต</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="creditDays">กำหนดชำระ (วัน)</label>
                    <input className="in mono amber" id="creditDays" inputMode="numeric" value={doc.creditDays}
                           onChange={(e) => set('creditDays', Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                  <div className="field">
                    <label>วันครบกำหนด <span className="hint">พิมพ์ วว/ดด/ปป หรือกดปฏิทิน</span></label>
                    {/* แก้วันครบกำหนดตรง ๆ ได้ — ระบบคำนวณกลับเป็นจำนวนวันเครดิตให้ */}
                    <ThaiDateField value={doc.creditDays > 0 ? dueDate : ''} style={{ background: '#FFF3CC', borderColor: '#F0C24A', fontWeight: 600 }}
                                   onChange={(iso) => set('creditDays', Math.max(0, daysBetweenIso(doc.docDate, iso)))} />
                  </div>
                </div>
                <div className="row-fields f2" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label htmlFor="whtRate">หัก ณ ที่จ่าย (%)</label>
                    <input className="in mono" id="whtRate" inputMode="decimal" value={doc.whtRate}
                           onChange={(e) => set('whtRate', Number(e.target.value) || 0)} />
                    <span className="hint">คิดจากค่าแรงเท่านั้น (ร้านตั้งไว้ {shopWhtRate}%)</span>
                    {/* ขั้นต่ำตามกติกาสรรพากร — เตือนแดงให้เห็นชัด (ผู้ใช้กำหนด) · สูตรอยู่ที่ recTotals (WHT_MIN_BASE) */}
                    <span className="hint" style={{ color: 'var(--due)', fontWeight: 600 }}>(ค่าบริการ {WHT_MIN_BASE.toLocaleString('en-US')} บาทขึ้นไป)</span>
                  </div>
                  <div className="field">
                    <label>อ้างอิงใบเสนอราคา{doc.kind === 'RC' ? ' / ใบส่งมอบ' : ''} <span className="hint">พิมพ์เลขที่ ชื่อ หรือทะเบียน — ค้นจากใบที่เปิดค้างอยู่ เลือกแล้วดึงรายการมาให้</span></label>
                    {doc.parentDocId ? (
                      <div className="tag-row">
                        <span className="chip ok">ออกต่อจาก {srcNo || 'เอกสารที่เลือกไว้'}</span>
                        {mode === 'new' ? <button className="btn sm" type="button" onClick={() => { setSrcNo(''); setDoc((d) => ({ ...d, parentDocId: null })); }}>เปลี่ยน</button> : null}
                      </div>
                    ) : mode === 'new' ? (
                      <>
                        <input className="in search" value={srcQuery} placeholder="ค้นใบเสนอราคาที่เปิดไว้ — ว่างได้ (ขายหน้าร้าน)"
                               onChange={(e) => setSrcQuery(e.target.value)} />
                        {srcResults ? (
                          <div className="tablewrap hits5" style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 8 }}>
                            <table className="tbl"><tbody>
                              {srcResults.length === 0 ? <tr><td className="subtle">ไม่พบใบที่เปิดค้างอยู่ตรงกับคำค้น</td></tr>
                                : srcResults.map((o) => (
                                  <tr key={o.id} className="pick" role="button" tabIndex={0} onClick={() => applySource(o)}
                                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applySource(o); } }}>
                                    <td className="mono"><b>{o.docNo}</b></td><td>{thDate(o.docDate)}</td><td className="wrap">{o.partyName}</td>
                                    <td className="mono subtle">{o.vehiclePlate || ''}</td><td className="num mono">{baht(o.amount)}</td>
                                  </tr>
                                ))}
                            </tbody></table>
                          </div>
                        ) : null}
                        {srcBusy ? <span className="hint">กำลังดึงรายการ…</span> : null}
                      </>
                    ) : (
                      <div className="in" style={{ background: 'var(--bg)' }}><span className="subtle">— ไม่มี —</span></div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ================= อาการ (ใบเสนอราคา) ================= */}
      {isQuote ? (
        <div className="docgrid">
          {(['complaints', 'findings'] as const).map((k) => (
            <div className="card" key={k}>
              <header><h2>{k === 'complaints' ? 'อาการที่แจ้ง' : 'อาการที่พบ'}</h2>
                <div className="spacer" /><span className="subtle">{k === 'complaints' ? 'ปัญหาที่ลูกค้าแจ้ง' : 'ปัญหาที่อู่ตรวจพบ'}</span></header>
              <div className="body">
                {[0, 1, 2].map((i) => (
                  <input key={i} className="in" style={{ marginBottom: 6, width: '100%' }} placeholder={`ข้อ ${i + 1}`}
                         value={doc[k][i] ?? ''}
                         onChange={(e) => { const next = [...doc[k]]; next[i] = e.target.value; set(k, next); }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ================= รายการสินค้า ================= */}
      <div className={`card${state.field === 'items' ? ' bad' : ''}`}>
        <header>
          <h2>รายการสินค้า</h2>
          <div className="spacer" />
          <span className="subtle">ราคา/หน่วย = ราคาระดับ {doc.priceTier ?? 'A'} · {realItems.length} บรรทัด</span>
        </header>

        {/* ยิงบาร์โค้ดได้ทุกเอกสาร — เครื่องยิงพิมพ์รหัสแล้วกด Enter ให้เอง */}
        <ScanBox onScan={onScan} />

        {expired.length > 0 ? (
          <div className="body" style={{ paddingBottom: 0 }}>
            <div className="note" style={{ background: '#FCF1F1', borderColor: '#EEC4C4', color: '#7A2020' }}>
              <b>ของที่จะถูกตัดหมดอายุแล้ว {expired.length} บรรทัด</b> —{' '}
              {expired.map((x) => `${x.item.code || x.item.name}`).join(' · ')}
              <br />
              {isReceipt ? 'ใบนี้ตัดสต๊อกตอนบันทึก ระบบจะตัดล็อตที่หมดอายุก่อนตามลำดับหมดอายุก่อนออกก่อน'
                         : 'ใบนี้ยังไม่ตัดสต๊อก แต่ของที่จะถูกตัดตอนออกใบเสร็จคือล็อตที่หมดอายุแล้ว'}
              {' '}บันทึกได้ตามปกติ — ตรวจของจริงบนชั้นวางก่อนส่งมอบ
            </div>
          </div>
        ) : null}

        {notFound ? (
          <div className="body" style={{ paddingBottom: 0 }}>
            <div className="note" style={{ background: '#FCF1F1', borderColor: '#EEC4C4' }}>
              ยิงแล้วไม่พบบาร์โค้ด <b className="mono">{notFound}</b> ในทะเบียนสินค้า
              <div className="tag-row" style={{ marginTop: 8 }}>
                <a className="btn" target="_blank" rel="noreferrer" href={`/stock/new?barcode=${encodeURIComponent(notFound)}`}>
                  เพิ่มเป็นสินค้าใหม่ (เปิดแท็บใหม่)
                </a>
                <button className="btn" type="button" onClick={() => setNotFound('')}>ปิด</button>
              </div>
              <span className="hint">เปิดแท็บใหม่เพื่อไม่ให้ใบที่กำลังทำอยู่หาย — สร้างเสร็จแล้วกลับมายิงซ้ำได้เลย</span>
            </div>
          </div>
        ) : null}

        <div className="tablewrap">
          <table className="tbl lines picked">
            <thead>
              <tr>
                <th className="idx">ลำดับ</th>
                <th className="c-code">รหัสสินค้า</th>
                <th className="c-name">ชื่อสินค้า</th>
                <th className="num c-qty">จำนวน</th>
                <th style={{ textAlign: 'center' }}>คงเหลือ</th>
                <th className="c-unit">หน่วย</th>
                <th className="num c-price">ราคา/หน่วย</th>
                <th className="num c-disc">ส่วนลด %</th>
                <th className="num">จำนวนเงิน</th>
                <th style={{ textAlign: 'center' }}>ค่าแรง</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it, i) => (
                <LineRow key={i} i={i} item={it} isLast={i === doc.items.length - 1}
                         stock={it.productId ? (stock[it.productId] ?? null) : null}
                         today={today} expiryWarnDays={expiryWarnDays} priceOf={priceOf}
                         onChange={(patch) => setItem(i, patch)}
                         onPick={(p) => fillRow(i, p, it.qty || 1)}
                         onRemove={() => removeRow(i)}
                         onEnterLast={() => addRow()}
                         onFound={learn} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="toolbar" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
          <button className="btn" type="button" onClick={() => addRow()}>+ เพิ่มบรรทัด</button>
          <button className="btn" type="button"
                  onClick={() => addRow({ code: 'LAB', name: 'ค่าแรง', unit: 'รายการ', isService: true })}>
            + ค่าแรง
          </button>
          <span className="subtle">เคล็ดลับ: กด Enter ที่บรรทัดสุดท้ายเพื่อเพิ่มบรรทัดใหม่ · ในช่องรหัส Enter = เลือกผลค้นหาตัวแรก</span>
        </div>
      </div>

      {/* ================= ท้ายเอกสาร: หมายเหตุ | สรุปยอด ================= */}
      <div className="docgrid">
        <div className="card">
          <header><h2>หมายเหตุเอกสาร</h2></header>
          <div className="body">
            <div className="field">
              <label>หมายเหตุ</label>
              <textarea className="in" value={doc.note} placeholder={isQuote ? 'เช่น ยืนราคา 30 วัน' : 'เช่น เงื่อนไขการส่งมอบ'}
                        onChange={(e) => set('note', e.target.value)} />
            </div>
            {!isQuote ? (
              <div className="row-fields f2" style={{ marginTop: 10 }}>
                <div className="field">
                  <label>{isReceipt ? 'ผู้รับเงิน' : 'ผู้ส่งมอบงาน'}</label>
                  <input className="in" value={doc.receivedBy} onChange={(e) => set('receivedBy', e.target.value)} />
                </div>
                <div className="field">
                  <label>เงื่อนไขการรับประกัน</label>
                  <textarea className="in" value={doc.warrantyText} onChange={(e) => set('warrantyText', e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="row-fields f2" style={{ marginTop: 10 }}>
                <div className="field">
                  <label>ผู้เสนอซ่อม</label>
                  <input className="in" value={doc.proposer} onChange={(e) => set('proposer', e.target.value)} />
                </div>
                <div className="field">
                  <label>ผู้อนุมัติซ่อม</label>
                  <input className="in" value={doc.approver} onChange={(e) => set('approver', e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card sumbox">
          <header>
            <h2>สรุปยอด</h2>
            <div className="spacer" />
            <span className="chip">
              {doc.vatMode === 'none' ? `ไม่มีภาษีมูลค่าเพิ่ม (${doc.kind})` : doc.vatMode === 'in' ? 'ราคารวมภาษีแล้ว' : `ภาษีมูลค่าเพิ่ม ${vatRate}%`}
            </span>
          </header>
          <div className="body">
            <div className="row"><span className="lbl">รวมเป็นเงิน{doc.vatMode !== 'none' ? ' (ก่อนภาษี)' : ''}</span><span>{baht(t.sub)}</span></div>

            {/* ส่วนลดท้ายบิล — สลับ % / บาท (เจ๊ก ข้อ 3) */}
            <div className="row">
              <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                ส่วนลดท้ายบิล
                <input className="in mono" inputMode="decimal" style={{ width: 96, textAlign: 'right' }}
                       value={doc.discountMode === 'pct' ? (doc.discountPct ?? 0) : doc.discount}
                       onChange={(e) => {
                         const v = Number(e.target.value) || 0;
                         if (doc.discountMode === 'pct') set('discountPct', Math.min(100, Math.max(0, v)));
                         else set('discount', Math.max(0, v));
                       }} />
                <span className="pctswitch" role="group" aria-label="หน่วยส่วนลด">
                  {(['pct', 'baht'] as DiscountMode[]).map((m) => (
                    <button key={m} type="button" aria-pressed={doc.discountMode === m}
                            onClick={() => set('discountMode', m)}>
                      {m === 'pct' ? '%' : 'บาท'}
                    </button>
                  ))}
                </span>
              </span>
              <span>{effDiscount > 0 ? `−${baht(effDiscount)}` : baht(0)}</span>
            </div>

            {doc.vatMode !== 'none' ? (
              <>
                <div className="row"><span className="lbl">มูลค่าก่อนภาษี</span><span>{baht(t.net)}</span></div>
                <div className="row"><span className="lbl">ภาษีมูลค่าเพิ่ม {vatRate}%</span><span>{baht(t.vat)}</span></div>
              </>
            ) : (
              <div className="note" style={{ margin: '6px 0' }}>เอกสารรหัส {doc.kind} — ไม่คำนวณภาษีมูลค่าเพิ่ม</div>
            )}
            <div className="row grand"><span>{isQuote ? 'ยอดเสนอราคาทั้งสิ้น' : 'รวมทั้งสิ้น'}</span><span>{baht(t.grand)}</span></div>
            {t.wht > 0 ? (
              <>
                <div className="row"><span className="lbl">หัก ณ ที่จ่าย {doc.whtRate}% (ค่าแรง {baht(t.whtBase)})</span><span>−{baht(t.wht)}</span></div>
                <div className="row grand"><span>ยอดชำระทั้งสิ้น</span><span>{baht(t.payable)}</span></div>
              </>
            ) : !isQuote && doc.whtRate > 0 && t.whtBase > 0 && t.whtBase < WHT_MIN_BASE ? (
              <div className="note" style={{ margin: '6px 0' }}>
                ค่าแรง {baht(t.whtBase)} บาท ไม่ถึง {WHT_MIN_BASE.toLocaleString('en-US')} บาท — ไม่หัก ณ ที่จ่าย
              </div>
            ) : null}
            <div className="subtle" style={{ fontSize: 12.5, marginTop: 4 }}>({bahttext(t.payable)})</div>

            {/* รับชำระ (ใบเสร็จ) */}
            {isReceipt ? (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <div className="tag-row" style={{ marginBottom: 8 }}>
                  <b>รับชำระเงิน</b>
                  <span className="subtle">รับแล้ว {baht(paidNow)} · {remain > EPS ? <b style={{ color: 'var(--warn)' }}>ค้างชำระ {baht(remain)} (ตั้งเป็นลูกหนี้)</b> : 'ครบแล้ว'}</span>
                </div>
                <div className="row-fields f3">
                  {['เงินสด', 'เงินโอน', 'บัตรเครดิต'].map((method) => {
                    const at = doc.payments.findIndex((p) => p.method === method);
                    const amount = at >= 0 ? doc.payments[at]!.amount : 0;
                    return (
                      <div className="field" key={method}>
                        <label>{method}</label>
                        <input className="in mono" id={`pay-${method}`} autoFocus={focusPartial && method === 'เงินสด'} inputMode="decimal" value={amount || ''} placeholder="0.00"
                               onChange={(e) => {
                                 const v = Number(e.target.value) || 0;
                                 setCashAuto(false);
                                 setDoc((d) => {
                                   const rest = d.payments.filter((p) => p.method !== method);
                                   const ref = d.payments.find((p) => p.method === method)?.ref ?? '';
                                   return { ...d, payments: v > 0 ? [...rest, { method, amount: v, ref }] : rest };
                                 });
                               }} />
                        {method === 'เงินโอน' && amount > 0 && banks && banks.length > 0 ? (
                          /* รับโอน → แสดงเลขที่บัญชีที่รับโอน (เลือกได้ถ้ามีหลายธนาคาร) */
                          <div style={{ marginTop: 6 }}>
                            <select className="in amber" value={doc.payments[at]?.ref ?? ''}
                                    onChange={(e) => setDoc((d) => ({ ...d, payments: d.payments.map((p) => (p.method === method ? { ...p, ref: e.target.value } : p)) }))}>
                              {(doc.payments[at]?.ref && !banks.some((b) => bankRef(b) === doc.payments[at]?.ref)) ? <option value={doc.payments[at]?.ref}>{doc.payments[at]?.ref}</option> : null}
                              {banks.map((b) => <option key={b.no} value={bankRef(b)}>{bankRef(b)}</option>)}
                            </select>
                            <div className="hint">เข้าบัญชี <b className="mono">{(doc.payments[at]?.ref || bankRef(banks[0])).replace(/^.*เลขที่ /, '')}</b> · แจ้งลูกค้าโอนเข้าบัญชีนี้</div>
                          </div>
                        ) : method !== 'เงินสด' && amount > 0 ? (
                          <input className="in" style={{ marginTop: 6 }}
                                 placeholder={method === 'เงินโอน' ? 'ธนาคาร / เลขที่อ้างอิง' : 'เลขที่อนุมัติบัตร'}
                                 value={doc.payments[at]?.ref ?? ''}
                                 onChange={(e) => setDoc((d) => ({
                                   ...d, payments: d.payments.map((p) => (p.method === method ? { ...p, ref: e.target.value } : p)),
                                 }))} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="tag-row" style={{ marginTop: 10 }}>
                  <button className="btn sm" type="button" onClick={() => { setCashAuto(false); setDoc((d) => ({ ...d, payments: [{ method: 'เงินสด', amount: t.payable, ref: '' }] })); }}>รับเงินสดเต็มจำนวน</button>
                  <button className="btn sm" type="button" onClick={() => { setCashAuto(false); setDoc((d) => ({ ...d, payments: [{ method: 'เงินโอน', amount: t.payable, ref: banks?.[0] ? bankRef(banks[0]) : '' }] })); }}>รับโอนเต็มจำนวน</button>
                  <button className="btn sm" type="button" onClick={() => { setCashAuto(false); setDoc((d) => ({ ...d, payments: [{ method: 'เงินสด', amount: 0, ref: '' }] })); setFocusPartial(true); }}>ชำระบางส่วน — กรอกยอด</button>
                  <button className="btn sm" type="button" onClick={() => { setCashAuto(false); setDoc((d) => ({ ...d, payments: [] })); }}>ยังไม่รับเงิน (เครดิต)</button>
                </div>
              </div>
            ) : null}

            <div className="formbar" style={{ marginTop: 14 }}>
              {/* type=button — เปิดแผงยืนยัน ไม่ส่งฟอร์มตรง */}
              <button className="btn primary" type="button" onClick={() => { setPrintAfter(false); tryConfirm(); }}>
                {mode === 'new' ? `บันทึก${KIND_LABEL[doc.kind]}` : 'บันทึกการแก้ไข'}
              </button>
              {/* พิมพ์เอกสาร (การ์ดอำพัน — ผู้ใช้กำหนดให้มีทุกเอกสาร): ใบที่บันทึกแล้วเปิดหน้าพิมพ์ทันที ·
                  ใบใหม่ = บันทึกก่อนแล้วไปหน้าพิมพ์ต่อเลย (ผ่านแผงยืนยันเหมือนเดิม) */}
              {initial.id ? (
                <Link className="btn amber" href={`/income/${initial.id}/print`} target="_blank" rel="noreferrer">🖨 พิมพ์เอกสาร</Link>
              ) : (
                <button className="btn amber" type="button" onClick={() => { setPrintAfter(true); tryConfirm(); }}>🖨 พิมพ์เอกสาร</button>
              )}
              {precheck ? <span className="chip due" role="alert">{precheck}</span> : null}
              <Link className="btn" href="/income">ยกเลิก</Link>
            </div>
          </div>
        </div>
      </div>

      <ConfirmSave open={confirm} title={KIND_LABEL[doc.kind]} lines={confirmLines}
                   submitLabel={mode === 'new' ? 'บันทึก' : 'บันทึกการแก้ไข'}
                   onEdit={() => setConfirm(false)} />
    </form>
  );
}
