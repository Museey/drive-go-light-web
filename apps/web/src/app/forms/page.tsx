import { FitToPage } from '@/components/fit-to-page';
import { Shell } from '@/components/shell';
import { Icon } from '@/components/icon';
import { SubnavPortal } from '@/components/subnav-portal';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { getShop } from '@/lib/queries';
import { PrintButton } from '../income/[id]/print/print-button';
import {
  BlankForm, DEFAULT_FORM_ROWS, FORM_COPIES, FORM_LABEL, FORM_ROWS, type FormKind,
} from './blank-forms';

export const dynamic = 'force-dynamic';

const KINDS = Object.keys(FORM_LABEL) as FormKind[];

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; rows?: string; copies?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const kind = (KINDS.includes(sp.kind as FormKind) ? sp.kind : 'intake') as FormKind;

  /* ค่านอกรายการถูกปัดกลับเป็นค่าตั้งต้น กันคนใส่ ?copies=9999 แล้วเครื่องพิมพ์พ่นกระดาษทั้งลัง */
  const rows = (FORM_ROWS as readonly number[]).includes(Number(sp.rows))
    ? Number(sp.rows) : DEFAULT_FORM_ROWS;
  const copies = (FORM_COPIES as readonly number[]).includes(Number(sp.copies))
    ? Number(sp.copies) : 1;

  const shop = await getShop();

  /* ค่าที่ต้องติดไปกับการเปลี่ยนชนิดเอกสาร ไม่งั้นเลือกบรรทัดไว้แล้วกดสลับชนิดจะหลุด */
  const opts = {
    ...(rows === DEFAULT_FORM_ROWS ? {} : { rows }),
    ...(copies === 1 ? {} : { copies }),
  };

  const info = {
    name: shop.name,
    addrText: shop.addrText ?? '',
    tel: shop.tel ?? '',
    tel2: shop.tel2 ?? '',
    taxId: shop.taxId ?? '',
  };

  /* ลำดับเมนูย่อย 09.x ตามต้นแบบ — ใบรับรถขึ้นก่อน · แบบสั่งงานเดิมย้ายท้าย */
  const ORDER: FormKind[] = ['intake', 'quote', 'invoice', 'receipt', 'billnote', 'purchase', 'expense', 'jobcard'];

  return (
    <Shell current="/forms" title="พิมพ์ฟอร์มเปล่า" sub={FORM_LABEL[kind]} actions={<PrintButton />}>
      <div className="subwrap">
        <SubnavPortal>
          <nav className="subnav" aria-label="ฟอร์มเปล่า">
            {ORDER.map((k, i) => (
              <Link key={k} href={{ pathname: '/forms', query: { ...opts, kind: k } }} aria-current={k === kind ? 'true' : undefined}>
                <span className="si"><Icon name="listp" size={28} color="#1D8A5F" /></span><span className="sw"><span>{FORM_LABEL[k].replace(/ \(.*\)$/, '')}</span></span><u>09.{i + 1}</u>
              </Link>
            ))}
          </nav>
        </SubnavPortal>
        <div>
          {/* จำนวนชุดที่จะพิมพ์ — จำนวนบรรทัดปรับให้พอดี A4 อัตโนมัติแล้ว จึงไม่ต้องเลือก */}
          <div className="card"><div className="toolbar"><span className="subtle">พิมพ์กี่ชุด</span>
            {FORM_COPIES.map((n) => (
              <Link key={n} className="btn sm" href={{ pathname: '/forms', query: { kind, ...(n === 1 ? {} : { copies: n }) } }}
                    style={n === copies ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>{n}</Link>
            ))}
          </div></div>
          <div className="printview blank-forms">
            <FitToPage />
            {Array.from({ length: copies }).map((_, i) => (
              <BlankForm key={i} kind={kind} shop={info} rows={rows} />
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
