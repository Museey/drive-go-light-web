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
  const kind = (KINDS.includes(sp.kind as FormKind) ? sp.kind : 'jobcard') as FormKind;

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

  return (
    <>
      <div className="printbar">
        <Link className="btn" href="/">← กลับหน้าแรก</Link>
        <div className="tag-row">
          {KINDS.map((k) => (
            <Link key={k} className="chip"
                  href={{ pathname: '/forms', query: { ...opts, kind: k } }}
                  style={k === kind ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
              {FORM_LABEL[k]}
            </Link>
          ))}
        </div>
        <div className="spacer" />

        <div className="tag-row">
          <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>บรรทัด</span>
          {FORM_ROWS.map((r) => (
            <Link key={r} className="chip"
                  href={{ pathname: '/forms', query: { kind, ...(copies > 1 ? { copies } : {}), ...(r === DEFAULT_FORM_ROWS ? {} : { rows: r }) } }}
                  style={r === rows ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
              {r}
            </Link>
          ))}
        </div>

        <div className="tag-row">
          <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>ชุด</span>
          {FORM_COPIES.map((n) => (
            <Link key={n} className="chip"
                  href={{ pathname: '/forms', query: { kind, ...(rows === DEFAULT_FORM_ROWS ? {} : { rows }), ...(n === 1 ? {} : { copies: n }) } }}
                  style={n === copies ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
              {n}
            </Link>
          ))}
        </div>

        <PrintButton />
      </div>

      <div className="printview">
        {Array.from({ length: copies }).map((_, i) => (
          <BlankForm key={i} kind={kind} shop={info} rows={rows} />
        ))}
      </div>
    </>
  );
}
