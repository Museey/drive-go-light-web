import Link from 'next/link';
import { notFound } from 'next/navigation';
import { today } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { canCost, canEdit, HIDDEN_COST } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { getProduct, listCategories, listProductLots, listStockMoves } from '@/lib/products';
import { baht, thDate } from '@/lib/format';
import { ProductForm } from '../product-form';
import { AdjustForm } from '../adjust-form';
import { MoveForm } from '../move-form';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  opening: 'ยอดยกมา',
  purchase: 'รับเข้าจากใบซื้อ',
  sale: 'ตัดออกตามใบเสร็จ',
  adjust: 'ปรับยอด',
  return: 'รับคืน',
  use: 'เบิกใช้ในอู่',
  count: 'ปรับตามการตรวจนับ',
  set: 'ตั้งยอดคงเหลือ',
};

export default async function ProductPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireTab('stock', 'list');
  const seeCost = canCost(session);
  const mayEdit = canEdit(session, 'stock', 'list');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';

  const [product, categories] = await Promise.all([
    isNew ? Promise.resolve(null) : getProduct(id),
    listCategories(),
  ]);
  if (!isNew && !product) notFound();

  const [moves, lots] = product
    ? await Promise.all([listStockMoves(product.id), listProductLots(product.id)])
    : [[], []];
  const lotValue = lots.reduce((s2, l) => s2 + l.qty * l.unitCost, 0);

  return (
    <Shell
      current="/stock"
      title={isNew ? 'เพิ่มสินค้าใหม่' : product!.name}
      sub={isNew ? undefined : `รหัส ${product!.code}`}
      actions={<Link className="btn" href="/stock">← กลับทะเบียนสินค้า</Link>}
    >
      {sp.saved ? <div className="ok-msg" style={{ marginBottom: 16 }}>บันทึกเรียบร้อย</div> : null}

      {/* ไม่มีสิทธิ์แก้ก็ไม่ต้องเห็นฟอร์ม — เซิร์ฟเวอร์ปฏิเสธอยู่แล้ว
          แต่การให้กรอกจนเสร็จแล้วค่อยบอกว่าทำไม่ได้ เป็นการเสียเวลาของคนทำงาน */}
      {mayEdit ? (
        <div className="card">
          <header><h2>{isNew ? 'ข้อมูลสินค้า' : 'แก้ไขข้อมูลสินค้า'}</h2></header>
          <div className="body">
            <ProductForm product={product} categories={categories} />
          </div>
        </div>
      ) : (
        <div className="card">
          <header><h2>ข้อมูลสินค้า</h2></header>
          <div className="body">
            <div className="grid g4">
              <div className="kv"><b>รหัสสินค้า</b><span className="mono">{product?.code}</span></div>
              <div className="kv"><b>รหัส OEM</b><span className="mono">{product?.oem || '-'}</span></div>
              <div className="kv" style={{ gridColumn: 'span 2' }}>
                <b>ชื่อสินค้า</b><span>{product?.name}</span>
              </div>
              <div className="kv"><b>หน่วยนับ</b><span>{product?.unit || '-'}</span></div>
              <div className="kv"><b>หมวดหมู่</b><span>{product?.categoryName || '-'}</span></div>
              <div className="kv"><b>คงเหลือ</b><span>{product?.qtyOnHand}</span></div>
            </div>
            <div className="note" style={{ marginTop: 12 }}>
              บัญชีของคุณเปิดดูทะเบียนสินค้าได้อย่างเดียว แก้ไขไม่ได้ — ติดต่อเจ้าของกิจการ
            </div>
          </div>
        </div>
      )}

      {product ? (
        <>
          {/* สองการ์ดนี้เขียนข้อมูล — ซ่อนถ้าไม่มีสิทธิ์แก้ไข
              ส่วนล็อตคงเหลือกับประวัติเป็นการอ่าน จึงยังเห็นได้ */}
          {mayEdit ? (
          <>
          <div className="card">
            <header>
              <h2>รับเข้า / ตัดออก</h2>
              <div className="spacer" />
              <span className="subtle">
                คงเหลือตอนนี้ {product.qtyOnHand.toLocaleString('en-US')} {product.unit}
                {product.qtyMin > 0 ? ` · Min ${product.qtyMin.toLocaleString('en-US')}` : ''}
                {product.qtyMax > 0 ? ` · Max ${product.qtyMax.toLocaleString('en-US')}` : ''}
              </span>
            </header>
            <div className="body">
              <MoveForm productId={product.id} unit={product.unit} today={today()} />
            </div>
          </div>

          <div className="card">
            <header>
              <h2>ปรับยอดคงเหลือ</h2>
              <div className="spacer" />
              <span className="subtle">ใช้ตอนตรวจนับแล้วยอดไม่ตรง — กรอกจำนวนที่นับได้จริง</span>
            </header>
            <div className="body">
              <AdjustForm productId={product.id} current={product.qtyOnHand} unit={product.unit} />
            </div>
          </div>
          </>
          ) : null}

          <div className="card">
            <header>
              <h2>ล็อตคงเหลือ</h2>
              <div className="spacer" />
              <span className="subtle">
                มูลค่าตามต้นทุน {seeCost ? baht(lotValue) : HIDDEN_COST} บาท · ตัดจากล็อตบนสุดก่อน
              </span>
            </header>
            {lots.length === 0 ? (
              <div className="empty">ไม่มีของคงเหลือในคลัง</div>
            ) : (
              <div className="tablewrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>รับเข้าเมื่อ</th>
                      <th className="num">คงเหลือ</th>
                      {seeCost ? <th className="num">ต้นทุน/หน่วย</th> : null}
                      <th className="num">เป็นเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((l, i) => (
                      <tr key={i}>
                        <td>{thDate(l.on)}{i === 0 ? <span className="chip" style={{ marginLeft: 6 }}>ตัดก่อน</span> : null}</td>
                        <td className="num">{l.qty.toLocaleString('en-US')} {product!.unit}</td>
                        {seeCost ? <td className="num">{baht(l.unitCost)}</td> : null}
                        {seeCost ? <td className="num">{baht(l.qty * l.unitCost)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                      {seeCost ? <th className="num">ต้นทุน</th> : null}
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
                        {seeCost ? (
                          <td className="num" style={{ color: 'var(--ink-3)' }}>
                            {m.costAmount === null ? '-' : baht(m.costAmount)}
                          </td>
                        ) : null}
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
