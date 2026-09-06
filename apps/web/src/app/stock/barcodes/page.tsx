import Link from 'next/link';
import { barcodeSVG, STOCK_FLAG_LABEL, type StockFlag } from '@drivegolight/core';
import { requireExport } from '@/lib/auth';
import { listCategories, listProducts } from '@/lib/products';
import { PrintButton } from '../../income/[id]/print/print-button';
import { baht } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** จำนวนดวงต่อสินค้าหนึ่งรายการ — ค่านอกรายการถูกปัดกลับเป็นค่าตั้งต้น */
const PER_ITEM = [1, 2, 4, 8, 12, 20] as const;
const DEFAULT_PER_ITEM = 1;

/** เพดานดวงทั้งแผ่น — กันคนใส่ ?n=999 แล้วเครื่องพิมพ์พ่นกระดาษทั้งลัง */
const MAX_LABELS = 480;

/**
 * ฉลากบาร์โค้ดของสินค้าหลายรายการในแผ่นเดียว
 *
 * รุ่น 6.4 พิมพ์ได้ทีละสินค้าเท่านั้น (printBarcodeModal รับสินค้าตัวเดียว)
 * ซึ่งใช้ไม่ได้จริงกับอู่ที่เพิ่งลงทะเบียนอะไหล่ 300 ตัวแล้วต้องติดฉลากทั้งหมด
 *
 * ใช้ตัวกรองชุดเดียวกับหน้ารายการสินค้าและหน้าพิมพ์ทะเบียน — สิ่งที่เห็นบนจอ
 * คือสิ่งที่ได้บนกระดาษ ไม่ต้องมีระบบเลือกทีละตัวที่หายไปเมื่อเปลี่ยนหน้า
 */
export default async function BarcodeSheetPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; cat?: string; reorder?: string; all?: string; flag?: string; n?: string;
  }>;
}) {
  /* เป็นการนำข้อมูลออกจากระบบทั้งชุด จึงต้องมีสิทธิ์ส่งออก ไม่ใช่แค่สิทธิ์ดู */
  await requireExport('stock', 'list');
  const sp = await searchParams;
  const flag = (['min', 'max', 'dead'] as const).find((f) => f === sp.flag) as StockFlag | undefined;

  const per = (PER_ITEM as readonly number[]).includes(Number(sp.n))
    ? Number(sp.n) : DEFAULT_PER_ITEM;

  const [cats, { rows }] = await Promise.all([
    listCategories(),
    listProducts({
      search: sp.q,
      categoryId: sp.cat,
      onlyReorder: sp.reorder === '1',
      flag,
      includeInactive: sp.all === '1',
      all: true,
    }),
  ]);

  const withCode = rows.filter((p) => p.barcode);
  const without = rows.length - withCode.length;

  /* ตัดที่เพดานโดยนับเป็นสินค้า ไม่ใช่ตัดกลางสินค้าตัวใดตัวหนึ่ง */
  const maxItems = Math.max(1, Math.floor(MAX_LABELS / per));
  const shown = withCode.slice(0, maxItems);
  const overflow = withCode.length - shown.length;

  const back = `/stock${sp.q || sp.cat || sp.reorder || sp.flag || sp.all ? '?' : ''}` +
    new URLSearchParams(
      Object.entries({
        q: sp.q, cat: sp.cat, reorder: sp.reorder, flag: sp.flag, all: sp.all,
      }).filter(([, v]) => v) as [string, string][],
    ).toString();

  const notes = [
    sp.q ? `ค้นหา "${sp.q}"` : '',
    sp.cat ? `หมวด ${cats.find((c) => c.id === sp.cat)?.name ?? '-'}` : '',
    sp.reorder === '1' ? 'เฉพาะที่ต้องสั่งซื้อ' : '',
    flag ? STOCK_FLAG_LABEL[flag] : '',
    sp.all === '1' ? 'รวมที่ปิดใช้งาน' : '',
  ].filter(Boolean);

  const labels = shown.flatMap((p) => Array.from({ length: per }, () => p));

  return (
    <>
      <div className="printbar">
        <Link className="btn" href={back}>← กลับหน้าสินค้า</Link>

        <form action="/stock/barcodes" method="get"
              style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {sp.q ? <input type="hidden" name="q" value={sp.q} /> : null}
          {sp.cat ? <input type="hidden" name="cat" value={sp.cat} /> : null}
          {sp.reorder ? <input type="hidden" name="reorder" value={sp.reorder} /> : null}
          {sp.flag ? <input type="hidden" name="flag" value={sp.flag} /> : null}
          {sp.all ? <input type="hidden" name="all" value={sp.all} /> : null}
          <label className="subtle" htmlFor="n">ดวงต่อสินค้า</label>
          <select className="in" id="n" name="n" defaultValue={String(per)} style={{ width: 80 }}>
            {PER_ITEM.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button className="btn" type="submit">เปลี่ยน</button>
        </form>

        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          {labels.length.toLocaleString()} ดวง จาก {shown.length.toLocaleString()} รายการ
        </span>
        <PrintButton />
      </div>

      {without || overflow ? (
        <div className="printbar" style={{ paddingTop: 0 }}>
          <div className="note" style={{ margin: 0, width: '100%' }}>
            {without ? (
              <div>
                ข้าม <b>{without.toLocaleString()}</b> รายการที่ยังไม่มีบาร์โค้ด —
                เข้าไปที่หน้าสินค้าแล้วกดสร้างรหัสก่อน
              </div>
            ) : null}
            {overflow ? (
              <div>
                แผ่นเดียวพิมพ์ได้ไม่เกิน {MAX_LABELS.toLocaleString()} ดวง
                จึงตัดไว้ที่ <b>{shown.length.toLocaleString()}</b> รายการแรก
                เหลืออีก {overflow.toLocaleString()} รายการ — กรองให้แคบลงแล้วพิมพ์อีกรอบ
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="printview">
        <div className="paper" style={{ padding: '10mm' }}>
          {notes.length ? (
            <div style={{ fontSize: 10, color: '#555', marginBottom: '4mm' }}>
              {notes.join(' · ')}
            </div>
          ) : null}

          {labels.length ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5mm 4mm',
            }}>
              {labels.map((p, i) => (
                <div key={i} style={{
                  border: '1px dashed #bbb', padding: '8px 6px', textAlign: 'center',
                  breakInside: 'avoid',
                }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 600, overflow: 'hidden',
                    whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>{p.name.slice(0, 30)}</div>
                  <div style={{ margin: '4px 2px 1px' }}
                       dangerouslySetInnerHTML={{ __html: barcodeSVG(p.barcode!, 180, 44) }} />
                  <div style={{ fontSize: 9.5, letterSpacing: '.12em' }}>{p.barcode}</div>
                  {p.priceA > 0 ? (
                    <div style={{ fontSize: 10.5 }}>{baht(p.priceA)} ฿</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: '20mm 0' }}>
              ไม่มีสินค้าที่มีบาร์โค้ดตามตัวกรองที่เลือก
            </div>
          )}
        </div>
      </div>
    </>
  );
}
