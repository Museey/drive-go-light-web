import { requireExport } from '@/lib/auth';
import { listProducts } from '@/lib/products';
import { today } from '@drivegolight/core';

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const fmtQty = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * ใบตรวจนับเปล่าเป็น CSV — เปิดด้วย Excel แล้วกรอกในเครื่องได้
 * เว้นช่อง "นับได้จริง" "ผลต่าง" "หมายเหตุ" ไว้ให้กรอก เหมือน exportCountSheetCsv ของรุ่น 6.4
 */
export async function GET(request: Request) {
  await requireExport('stock', 'list');
  const sp = new URL(request.url).searchParams;
  const showSys = sp.get('sys') === '1';

  const { rows } = await listProducts({
    search: sp.get('q') ?? undefined,
    categoryId: sp.get('cat') ?? undefined,
    all: true,
  });

  const head = ['ลำดับ', 'รหัสสินค้า', 'ชื่อสินค้า', 'หมวดหมู่', 'หน่วย']
    .concat(showSys ? ['จำนวนที่ระบบมี'] : [])
    .concat(['นับได้จริง', 'ผลต่าง', 'หมายเหตุ']);

  const lines = [head.join(',')];
  rows.forEach((p, i) => {
    lines.push([
      i + 1, q(p.code), q(p.name), q(p.categoryName ?? ''), q(p.unit),
      ...(showSys ? [fmtQty(p.qtyOnHand)] : []),
      '', '', '',
    ].join(','));
  });

  /* BOM ข้างหน้าเพื่อให้ Excel บนวินโดวส์อ่านภาษาไทยถูก */
  return new Response('﻿' + lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="drivegolight-count-sheet-${today()}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
