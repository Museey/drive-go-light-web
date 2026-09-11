import Link from 'next/link';
/* วันที่ตั้งต้นของใบใหม่ต้องเป็นวันที่ตามเวลาไทย ไม่ใช่ของเครื่องที่รัน —
   เซิร์ฟเวอร์ตั้งเป็น UTC ใบที่เปิดตอนตีหนึ่งจะได้วันที่ของเมื่อวานบนเอกสารภาษี */
import { today } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import {
  getDefaultWarranty, loadDocForCopy, lotExpiryOf, openDocsFor, pickContactById, resolveSourceForNew,
  type SalesDocInput, type SalesKind,
} from '@/lib/sales';
import { PickSource } from './pick-source';
import { KIND_LABEL } from '@/lib/format';
import { DocEditor } from '../doc-editor';

export const dynamic = 'force-dynamic';

const KINDS: SalesKind[] = ['QT', 'IVT', 'IV', 'RC'];


function blank(kind: SalesKind, warranty: string, whtRate: number): SalesDocInput {
  return {
    kind,
    docDate: today(),
    parentDocId: null,
    partyId: null, partyType: 'person', partyName: '', partyTaxId: '',
    partyTel: '', partyEmail: '', partyAddr: {}, partyAddrText: '',
    vehicleId: null, vehicle: null,
    priceTier: 'A',
    discount: 0,
    vatMode: kind === 'IVT' ? 'ex' : kind === 'IV' ? 'none' : 'ex',
    whtRate: kind === 'QT' ? 0 : whtRate,
    creditDays: 0,
    complaints: ['', '', ''], findings: ['', '', ''],
    approver: '', proposer: '',
    warrantyText: kind === 'RC' ? warranty : '',
    receivedBy: '', note: '',
    items: [], payments: [],
  };
}

export default async function NewDocPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string; from?: string; copy?: string; party?: string;
    blank?: string; q?: string;
  }>;
}) {
  await requireTab('income', 'receipt');
  const sp = await searchParams;
  const kind = (KINDS.includes(sp.kind as SalesKind) ? sp.kind : 'QT') as SalesKind;

  /*
   * `copy=1` คือ "คัดลอกใบใหม่" — ตั้งต้นจากใบเดิมแต่**ไม่ผูกเป็นลูก**
   * ใช้กับใบที่ถูกยกเลิกไปแล้ว ซึ่งเป็นทางออกเดียวที่เหลือของมัน
   */
  const copying = sp.copy === '1';

  /*
   * ออกใบส่งมอบหรือใบเสร็จโดยไม่ได้มาจากเอกสารต้นทาง — เสนอใบที่ยังค้างให้เลือกก่อน
   * ตามที่ invNewModal / rcNewModal ของรุ่น 6.4 ทำ
   *
   * ข้ามได้ด้วย blank=1 ซึ่งจำเป็นจริง — งานที่ไม่ได้เริ่มจากใบเสนอราคามีอยู่
   * เช่นลูกค้าเดินเข้ามาซื้ออะไหล่ชิ้นเดียว
   */
  const pickTarget: 'invoice' | 'receipt' | null =
    sp.from || sp.party || sp.blank === '1' ? null
    : kind === 'IVT' || kind === 'IV' ? 'invoice'
    : kind === 'RC' ? 'receipt'
    : null;

  if (pickTarget) {
    const search = sp.q ?? '';
    const rows = await openDocsFor(pickTarget, search);
    return (
      <Shell doc current="/income" title={`ออก${KIND_LABEL[kind]}`}
             actions={<Link className="btn" href="/income">← กลับรายการ</Link>}>
        <PickSource target={pickTarget} kind={kind} rows={rows} search={search} />
      </Shell>
    );
  }

  /* ออกใบเสร็จจากใบเสนอราคาที่มีใบส่งมอบแล้ว ต้องต่อสายจากใบส่งมอบ ดู resolveSourceForNew */
  const resolved = sp.from && !copying
    ? await resolveSourceForNew(sp.from, kind)
    : { sourceId: sp.from ?? '', movedTo: null };

  const [shop, warranty, source, party] = await Promise.all([
    getShop(),
    getDefaultWarranty(),
    sp.from ? loadDocForCopy(resolved.sourceId || sp.from, copying) : Promise.resolve(null),
    /* เปิดใบจากแถวทะเบียนลูกค้า — ต้องได้ผลเหมือนกดเลือกจากช่องค้นหาทุกช่อง */
    sp.party && !sp.from ? pickContactById(sp.party) : Promise.resolve(null),
  ]);

  let initial = blank(kind, warranty, shop.whtRate);

  if (source) {
    /* คัดลอกลูกค้า รถ และรายการจากเอกสารต้นทาง แล้วเปลี่ยนชนิดเป็นใบใหม่ */
    initial = {
      ...source,
      kind,
      docDate: today(),
      parentDocId: copying ? null : (resolved.sourceId || sp.from!),
      vatMode: kind === 'IVT' ? 'ex' : kind === 'IV' ? 'none' : source.vatMode,
      whtRate: kind === 'QT' ? 0 : (source.whtRate || shop.whtRate),
      warrantyText: kind === 'RC' ? (source.warrantyText || warranty) : source.warrantyText,
      payments: [],
    };
  }

  if (party) {
    /* เติมให้เหมือน applyCustomer() ของฟอร์ม รวมรถคันแรกในทะเบียนของลูกค้ารายนี้ */
    initial = {
      ...initial,
      partyId: party.id,
      partyType: party.type,
      partyName: party.name,
      partyTaxId: party.taxId,
      partyTel: party.tel,
      partyEmail: party.email,
      partyAddr: party.addr,
      partyAddrText: party.addrText,
      creditDays: initial.creditDays || party.creditDays,
      vehicleId: party.vehicles[0]?.id ?? null,
      vehicle: party.vehicles[0]?.data ?? null,
    };
  }

  const lotExpiry = await lotExpiryOf(initial.items.map((i) => i.productId));

  return (
    <Shell doc
      current="/income"
      title={`ออก${KIND_LABEL[kind]}`}
      sub={party
        ? `เปิดจากทะเบียนลูกค้า — ${party.name}${party.vehicles[0] ? ` · ${party.vehicles[0].label}` : ''}`
        : source
        ? copying
          ? 'คัดลอกจากใบเดิมมาให้แล้ว ใบใหม่นี้ไม่ผูกกับใบเดิม — ตรวจสอบก่อนบันทึก'
          : 'คัดลอกข้อมูลจากเอกสารต้นทางมาให้แล้ว ตรวจสอบก่อนบันทึก'
        : undefined}
      actions={
        <div className="tag-row">
          {KINDS.map((k) => (
            <Link key={k} className="chip"
                  href={{ pathname: '/income/new', query: { kind: k, ...(sp.from ? { from: sp.from } : {}) } }}
                  style={k === kind ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
              {KIND_LABEL[k]}
            </Link>
          ))}
        </div>
      }
    >
      {resolved.movedTo ? (
        <div className="note" style={{ marginBottom: 16 }}>
          ใบเสนอราคาใบนี้ออกใบส่งมอบไปแล้ว — ใบเสร็จจึงออก
          <b> อ้างอิง {resolved.movedTo.docNo}</b> ไม่ใช่อ้างอิงใบเสนอราคา
          เพื่อให้ใบส่งมอบถูกปิดยอดเมื่อรับเงินครบ
        </div>
      ) : null}

      <DocEditor initial={initial} vatRate={shop.vatRate} shopWhtRate={shop.whtRate} mode="new"
                 lotExpiry={lotExpiry} expiryWarnDays={shop.expiryWarnDays} today={today()} />
    </Shell>
  );
}
