import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePerm } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { getProduct, listCategories, listStockMoves } from '@/lib/products';
import { baht, thDate } from '@/lib/format';
import { ProductForm } from '../product-form';
import { AdjustForm } from '../adjust-form';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  opening: 'ยอดยกมา',
  purchase: 'รับเข้าจากใบซื้อ',
  sale: 'ตัดออกตามใบเสร็จ',
  adjust: 'ปรับยอด',
  return: 'รับคืน',
};

export default async function ProductPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePerm('stock');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';

  const [product, categories] = await Promise.all([
    isNew ? Promise.resolve(null) : getProduct(id),
    listCategories(),
  ]);
  if (!isNew && !product) notFound();

  const moves = product ? await listStockMoves(product.id) : [];

  return (
    <Shell
      current="/stock"
      title={isNew ? 'เพิ่มสินค้าใหม่' : product!.name}
      sub={isNew ? undefined : `รหัส ${product!.code}`}
      actions={<Link className="btn" href="/stock">← กลับทะเบียนสินค้า</Link>}
    >
      {sp.saved ? <div className="ok-msg" style={{ marginBottom: 16 }}>บันทึกเรียบร้อย</div> : null}

      <div className="card">
        <header><h2>{isNew ? 'ข้อมูลสินค้า' : 'แก้ไขข้อมูลสินค้า'}</h2></header>
        <div className="body">
          <ProductForm product={product} categories={categories} />
        </div>
      </div>

      {product ? (
        <>
          <div className="card">
            <header>
              <h2>ปรับยอดคงเหลือ</h2>
              <div className="spacer" />
              <span className="subtle">คงเหลือตอนนี้ {product.qtyOnHand.toLocaleString('en-US')} {product.unit}</span>
            </header>
            <div className="body">
              <AdjustForm productId={product.id} current={product.qtyOnHand} unit={product.unit} />
            </div>
          </div>

          <div className="card">
            <header>
              <h2>ประวัติการเคลื่อนไหว</h2>
              <div className="spacer" />
              <span className="subtle">30 รายการล่าสุด</span>
            </header>
            {moves.length === 0 ? (
              <div className="empty">ยังไม่มีการเคลื่อนไหว</div>
            ) : (
              <div className="tablewrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>วันที่</th><th>ประเภท</th><th className="num">จำนวน</th>
                      <th>เอกสาร</th><th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.map((m, i) => (
                      <tr key={i}>
                        <td>{thDate(m.movedOn)}</td>
                        <td>{REASON_LABEL[m.reason] ?? m.reason}</td>
                        <td className="num" style={{ color: m.qtyDelta < 0 ? 'var(--due)' : 'var(--ok)' }}>
                          {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta.toLocaleString('en-US')}
                        </td>
                        <td className="mono">
                          {m.docId
                            ? <Link href={`/income/${m.docId}`} style={{ textDecoration: 'underline' }}>{m.docNo}</Link>
                            : '-'}
                        </td>
                        <td className="wrap" style={{ color: 'var(--ink-3)' }}>{m.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </Shell>
  );
}
