import Link from 'next/link';
import { notFound } from 'next/navigation';
import { barcodeSVG } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { getProduct } from '@/lib/products';
import { PrintButton } from '../../../income/[id]/print/print-button';
import { baht } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * ฉลากบาร์โค้ดสำหรับติดสินค้า
 *
 * พิมพ์ลงกระดาษสติกเกอร์ A4 กริดสี่คอลัมน์ตามรุ่น 6.4
 * ตัวบาร์โค้ดสร้างด้วย Code 39 ชุดเดียวกับต้นฉบับ มีเทสต์เทียบทีละแถบ
 */
export default async function BarcodePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  await requireTab('stock', 'list');
  const { id } = await params;
  const sp = await searchParams;

  const product = await getProduct(id);
  if (!product) notFound();

  const count = Math.min(120, Math.max(1, Number(sp.n) || 12));

  if (!product.barcode) {
    return (
      <div className="printview">
        <div className="paper">
          <div className="err">
            สินค้า <b>{product.code} {product.name}</b> ยังไม่มีบาร์โค้ด —
            เข้าไปแก้ไขสินค้าแล้วกดปุ่มสร้างบาร์โค้ดก่อน
          </div>
          <Link className="btn" href={`/stock/${id}`}>← กลับหน้าสินค้า</Link>
        </div>
      </div>
    );
  }

  const svg = barcodeSVG(product.barcode, 180, 44);

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={`/stock/${id}`}>← กลับหน้าสินค้า</Link>
        <form action={`/stock/${id}/barcode`} method="get"
              style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label className="subtle" htmlFor="n">จำนวนดวง</label>
          <input className="in mono" id="n" name="n" type="number" min={1} max={120}
                 defaultValue={count} style={{ width: 90 }} />
          <button className="btn" type="submit">เปลี่ยน</button>
        </form>
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          พิมพ์ลงกระดาษสติกเกอร์ A4 แล้วตัดติดสินค้า
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        <div className="paper" style={{ padding: '10mm' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5mm 4mm',
          }}>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} style={{
                border: '1px dashed #bbb', padding: '8px 6px', textAlign: 'center',
                breakInside: 'avoid',
              }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 600, overflow: 'hidden',
                  whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>{product.name.slice(0, 30)}</div>
                <div style={{ margin: '4px 2px 1px' }}
                     dangerouslySetInnerHTML={{ __html: svg }} />
                <div style={{ fontSize: 9.5, letterSpacing: '.12em' }}>{product.barcode}</div>
                {product.priceA > 0 ? (
                  <div style={{ fontSize: 10.5 }}>{baht(product.priceA)} ฿</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
