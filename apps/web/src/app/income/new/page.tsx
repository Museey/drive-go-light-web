import Link from 'next/link';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import {
  getDefaultWarranty, loadDocForCopy, resolveSourceForNew,
  type SalesDocInput, type SalesKind,
} from '@/lib/sales';
import { KIND_LABEL } from '@/lib/format';
import { DocEditor } from '../doc-editor';

export const dynamic = 'force-dynamic';

const KINDS: SalesKind[] = ['QT', 'IVT', 'IV', 'RC'];

/** เอกสารที่ออกต่อได้จากเอกสารต้นทาง — ใบเสนอราคาออกใบส่งมอบหรือใบเสร็จได้ */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
  searchParams: Promise<{ kind?: string; from?: string; copy?: string }>;
}) {
  await requireTab('income', 'receipt');
  const sp = await searchParams;
  const kind = (KINDS.includes(sp.kind as SalesKind) ? sp.kind : 'QT') as SalesKind;

  /*
   * `copy=1` คือ "คัดลอกใบใหม่" — ตั้งต้นจากใบเดิมแต่**ไม่ผูกเป็นลูก**
   * ใช้กับใบที่ถูกยกเลิกไปแล้ว ซึ่งเป็นทางออกเดียวที่เหลือของมัน
   */
  const copying = sp.copy === '1';

  /* ออกใบเสร็จจากใบเสนอราคาที่มีใบส่งมอบแล้ว ต้องต่อสายจากใบส่งมอบ ดู resolveSourceForNew */
  const resolved = sp.from && !copying
    ? await resolveSourceForNew(sp.from, kind)
    : { sourceId: sp.from ?? '', movedTo: null };

  const [shop, warranty, source] = await Promise.all([
    getShop(),
    getDefaultWarranty(),
    sp.from ? loadDocForCopy(resolved.sourceId || sp.from, copying) : Promise.resolve(null),
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

  return (
    <Shell doc
      current="/income"
      title={`ออก${KIND_LABEL[kind]}`}
      sub={source
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

      <DocEditor initial={initial} vatRate={shop.vatRate} shopWhtRate={shop.whtRate} mode="new" />
    </Shell>
  );
}
