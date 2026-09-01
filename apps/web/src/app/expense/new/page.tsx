import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import type { BuyDocInput, BuyKind } from '@/lib/purchases';
import { BuyEditor } from '../buy-editor';

export const dynamic = 'force-dynamic';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default async function NewBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requirePerm('expense');
  const sp = await searchParams;
  const kind: BuyKind = sp.kind === 'EX' ? 'EX' : 'PO';
  const shop = await getShop();

  const initial: BuyDocInput = {
    kind,
    docDate: today(),
    partyId: null, partyName: '', partyTaxId: '', partyTel: '', partyAddrText: '',
    refDocNo: '',
    discount: 0,
    vatMode: kind === 'PO' ? 'ex' : 'none',
    /* ค่าใช้จ่ายเริ่มที่หมวดอื่น ๆ ซึ่งแนะนำหัก 3% ตามที่โปรแกรมเดิมตั้งไว้ */
    whtRate: kind === 'PO' ? 0 : 3,
    creditDays: 0,
    goodsReceived: kind === 'PO',
    expenseCat: kind === 'EX' ? 'other' : null,
    assetLifeYears: null,
    note: '',
    items: [],
    payments: [],
  };

  return (
    <Shell doc
      current="/expense"
      title={kind === 'PO' ? 'บันทึกใบซื้อสินค้า' : 'บันทึกค่าใช้จ่าย'}
    >
      <BuyEditor initial={initial} vatRate={shop.vatRate} mode="new" />
    </Shell>
  );
}
