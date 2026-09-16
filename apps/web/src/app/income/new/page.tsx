import Link from 'next/link';
/* วันที่ตั้งต้นของใบใหม่ต้องเป็นวันที่ตามเวลาไทย ไม่ใช่ของเครื่องที่รัน —
   เซิร์ฟเวอร์ตั้งเป็น UTC ใบที่เปิดตอนตีหนึ่งจะได้วันที่ของเมื่อวานบนเอกสารภาษี */
import { today } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import { childTakenMessage } from '@/lib/doc-lock';
import { blankSalesDoc, childOf, docNoOf,
  getDefaultNote, getDefaultWarranty, loadDocForCopy, lotExpiryOf, openDocsFor, pickContactById, resolveSourceForNew,
  WALK_IN_CUSTOMER, type SalesDocInput, type SalesKind, peekDocSeq } from '@/lib/sales';
import { PickSource } from './pick-source';
import { pickSourceTarget } from '@/lib/doc-flow';
import { KIND_LABEL } from '@/lib/format';
import { DocEditor } from '../doc-editor';

export const dynamic = 'force-dynamic';

const KINDS: SalesKind[] = ['QT', 'IVT', 'IV', 'RC'];



export default async function NewDocPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string; from?: string; copy?: string; party?: string;
    blank?: string; q?: string; walkin?: string;
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
   * ขายหน้าร้าน — ลูกค้าเดินเข้ามาซื้อของแล้วจ่ายสด
   *
   * ข้ามหน้าเลือกเอกสารต้นทางไปเลย เพราะงานแบบนี้ไม่มีต้นทางให้เลือกอยู่แล้ว
   * แล้วเติมชื่อลูกค้ากับการรับเงินสดไว้ให้ เหลือแค่ใส่ของกับกดบันทึก
   */
  const walkin = sp.walkin === '1' && kind === 'RC';

  /* กติกาว่าจะเสนอให้เลือกเอกสารต้นทางเมื่อไร อยู่ที่ doc-flow.ts เพื่อให้ทดสอบได้ */
  const pickTarget = pickSourceTarget({
    kind,
    hasFrom: Boolean(sp.from),
    hasParty: Boolean(sp.party),
    blank: sp.blank === '1',
    walkin,
  });

  if (pickTarget) {
    const search = sp.q ?? '';
    const rows = await openDocsFor(pickTarget, search);
    return (
      <Shell doc current="/income" title={`ออก${KIND_LABEL[kind]}`}>
        <PickSource target={pickTarget} kind={kind} rows={rows} search={search} />
      </Shell>
    );
  }

  /* ออกใบเสร็จจากใบเสนอราคาที่มีใบส่งมอบแล้ว ต้องต่อสายจากใบส่งมอบ ดู resolveSourceForNew */
  const resolved = sp.from && !copying
    ? await resolveSourceForNew(sp.from, kind)
    : { sourceId: sp.from ?? '', movedTo: null };

  /* ใบต้นทางออกใบต่อไปแล้ว — บอกตั้งแต่เปิดฟอร์ม ไม่ใช่ให้กรอกทั้งใบแล้วค่อยพังตอนบันทึก (ต้นแบบ: ทำขั้นถัดไปได้เฉพาะใบที่ยังไม่มีใบต่อ) */
  const sourceId = resolved.sourceId || sp.from;
  const taken = sourceId && !copying ? await childOf(sourceId) : null;
  if (taken) {
    const parentNo = (await docNoOf(sourceId!)) ?? '';
    return (
      <Shell doc current="/income" title={`ออก${KIND_LABEL[kind]}`}>
        <div className="err chain-taken" style={{ marginBottom: 16 }}>
          <b>{childTakenMessage(parentNo, taken)}</b>
          <div style={{ marginTop: 6 }}>
            ใบหนึ่งออกใบต่อได้ใบเดียว — ถ้าต้องการออกใหม่ ให้ยกเลิก {taken.docNo} ก่อน
          </div>
        </div>
        <div className="tag-row">
          <Link className="btn primary" href={`/income/${taken.id}`}>เปิด {taken.docNo}</Link>
          <Link className="btn" href={`/income/${sourceId}`}>กลับไป {parentNo}</Link>
        </div>
      </Shell>
    );
  }

  const [shop, warranty, noteDefault, source, party] = await Promise.all([
    getShop(),
    getDefaultWarranty(),
    getDefaultNote(),
    sp.from ? loadDocForCopy(resolved.sourceId || sp.from, copying) : Promise.resolve(null),
    /* เปิดใบจากแถวทะเบียนลูกค้า — ต้องได้ผลเหมือนกดเลือกจากช่องค้นหาทุกช่อง */
    sp.party && !sp.from ? pickContactById(sp.party) : Promise.resolve(null),
  ]);

  let initial = blankSalesDoc(kind, warranty, shop.whtRate);
  /* หมายเหตุมาตรฐานของร้าน — เฉพาะใบใหม่ที่ยังว่าง ใบที่ออกต่อจากใบอื่นเอาหมายเหตุของต้นทางมา */
  initial = { ...initial, note: initial.note || noteDefault };

  if (walkin) initial = { ...initial, partyName: WALK_IN_CUSTOMER };

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
      sub={walkin
        ? 'ขายหน้าร้าน — เติมชื่อลูกค้าและรับเงินสดเต็มจำนวนไว้ให้แล้ว แก้ได้ทุกช่อง'
        : party
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

      {/* key = สิ่งที่ทำให้เป็นใบใหม่คนละใบ — เปลี่ยนแค่ query ในหน้าเดียวกัน (ใบส่งมอบ → ใบเสร็จจากใบต้นทางเดิม)
          React ใช้ฟอร์มตัวเดิมต่อ ค่าตั้งต้นใหม่ไม่ถูกใช้ ฟอร์มค้างเป็นชนิดเดิมจนกว่าจะรีเฟรช */}
      <DocEditor key={`${kind}:${resolved.sourceId}:${copying ? 'copy' : ''}:${sp.party ?? ''}:${walkin ? 'walkin' : ''}`}
                 initial={initial} vatRate={shop.vatRate} shopWhtRate={shop.whtRate} mode="new"
                 docNoPreview={{ seq: await peekDocSeq(kind, initial.docDate), month: initial.docDate.slice(0, 7) }}
                 lotExpiry={lotExpiry} expiryWarnDays={shop.expiryWarnDays} today={today()}
                 cashOnOpen={walkin} banks={shop.bankAccounts} />
    </Shell>
  );
}
