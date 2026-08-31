import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getShop } from '@/lib/queries';
import { PrintButton } from '../income/[id]/print/print-button';
import { BlankForm, FORM_LABEL, type FormKind } from './blank-forms';

export const dynamic = 'force-dynamic';

const KINDS = Object.keys(FORM_LABEL) as FormKind[];

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const kind = (KINDS.includes(sp.kind as FormKind) ? sp.kind : 'jobcard') as FormKind;
  const shop = await getShop();

  const info = {
    name: shop.name,
    addrText: shop.addrText ?? '',
    tel: shop.tel ?? '',
    tel2: shop.tel2 ?? '',
    taxId: shop.taxId ?? '',
  };

  return (
    <>
      <div className="printbar">
        <Link className="btn" href="/">← กลับหน้าแรก</Link>
        <div className="tag-row">
          {KINDS.map((k) => (
            <Link key={k} className="chip" href={`/forms?kind=${k}`}
                  style={k === kind ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
              {FORM_LABEL[k]}
            </Link>
          ))}
        </div>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          พิมพ์เก็บไว้เป็นปึกที่เคาน์เตอร์ สำหรับเขียนมือก่อนคีย์เข้าระบบ
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        <BlankForm kind={kind} shop={info} />
      </div>
    </>
  );
}
