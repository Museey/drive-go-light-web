import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getShop } from '@/lib/queries';
import type { BuyDocInput, BuyKind } from '@/lib/purchases';
import { pickVendorById } from '@/lib/purchases';
import { BuyEditor } from '../buy-editor';

export const dynamic = 'force-dynamic';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default async function NewBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; party?: string }>;
}) {
  await requireTab('expense', 'purchase');
  const sp = await searchParams;
  const kind: BuyKind = sp.kind === 'EX' ? 'EX' : 'PO';
  /* เปิดใบซื้อจากแถวทะเบียนผู้ขาย — เติมผู้ขายมาให้เหมือนกดเลือกจากช่องค้นหา */
  const [shop, vendor] = await Promise.all([
    getShop(),
    sp.party ? pickVendorById(sp.party) : Promise.resolve(null),
  ]);

  const initial: BuyDocInput = {
    kind,
    docDate: today(),
    partyId: vendor?.id ?? null,
    partyName: vendor?.name ?? '',
    partyTaxId: vendor?.taxId ?? '',
    partyTel: vendor?.tel ?? '',
    partyAddrText: vendor?.addrText ?? '',
    refDocNo: '',
    discount: 0,
    vatMode: kind === 'PO' ? 'ex' : 'none',
    /* ค่าใช้จ่ายเริ่มที่หมวดอื่น ๆ ซึ่งแนะนำหัก 3% ตามที่โปรแกรมเดิมตั้งไว้ */
    whtRate: kind === 'PO' ? 0 : 3,
    creditDays: vendor?.creditDays ?? 0,
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
      sub={vendor ? `เปิดจากทะเบียนผู้ขาย — ${vendor.name}` : undefined}
    >
      <BuyEditor initial={initial} vatRate={shop.vatRate} mode="new" />
    </Shell>
  );
}
