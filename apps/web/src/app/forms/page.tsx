import { FitToPage } from '@/components/fit-to-page';
import { Shell } from '@/components/shell';
import { Icon } from '@/components/icon';
import { SubnavPortal } from '@/components/subnav-portal';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getShop } from '@/lib/queries';
import { PrintButton } from '../income/[id]/print/print-button';
import { BlankForm, formLabel, type FormKind } from './blank-forms';

export const dynamic = 'force-dynamic';

/** ลำดับเมนูย่อย 09.x ตามต้นแบบ 14 ก.ย. 2569 22:37 — หกแบบ ใบรับรถขึ้นก่อน */
const ORDER: FormKind[] = ['intake', 'quote', 'invoice', 'receipt', 'billnote', 'purchase'];

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const kind = (ORDER.includes(sp.kind as FormKind) ? sp.kind : 'intake') as FormKind;
  const shop = await getShop();

  const info = {
    name: shop.name,
    addrText: shop.addrText ?? '',
    tel: shop.tel ?? '',
    tel2: shop.tel2 ?? '',
    taxId: shop.taxId ?? '',
    vatRegistered: shop.vatRegistered,
  };
  const label = (k: FormKind) => formLabel(k, shop.vatRegistered);

  return (
    <Shell current="/forms" title="พิมพ์ฟอร์มเปล่า" sub={label(kind)} tools={<PrintButton label="🖨 พิมพ์" />}>
      <div className="subwrap">
        <SubnavPortal>
          <nav className="subnav" aria-label="ฟอร์มเปล่า">
            {ORDER.map((k, i) => (
              <Link key={k} href={{ pathname: '/forms', query: { kind: k } }} aria-current={k === kind ? 'true' : undefined}>
                <span className="si"><Icon name="listp" size={28} color="#1D8A5F" /></span><span className="sw"><span>{label(k).replace(/ \(.*\)$/, '')}</span></span><u>09.{i + 1}</u>
              </Link>
            ))}
          </nav>
        </SubnavPortal>
        {/* จอแคบ (<1280px) ปุ่มเครื่องมือของหัวหน้าถูกย้ายเข้าลิ้นชัก — ฟอร์มเปล่ามีไว้พิมพ์อย่างเดียว
            จึงวางปุ่มไว้เหนือกระดาษให้กดได้เลย (เดสก์ท็อปใช้ปุ่มที่หัวหน้า) */}
        <div className="printbar forms-printbar">
          <PrintButton label="🖨 พิมพ์ฟอร์มนี้" />
          <span className="subtle">{label(kind)} · กระดาษ A4</span>
        </div>
        <div className="printview blank-forms">
          {/* ตอนพิมพ์ย่อให้พอดี A4 แผ่นเดียว (วัดความสูงจริงของกระดาษ) */}
          <FitToPage />
          <BlankForm kind={kind} shop={info} />
        </div>
      </div>
    </Shell>
  );
}
