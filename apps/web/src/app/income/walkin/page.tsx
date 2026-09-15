import Link from 'next/link';
import { today } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { canEdit } from '@/lib/perms';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { SavedNotice } from '@/components/saved-notice';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { HIST_DEFAULT_PAGE_SIZE, HIST_PAGE_SIZES, PageSize, pageSizeOf } from '@/components/page-size';
import { getShop, listIncomeDocs } from '@/lib/queries';
import {
  WALK_IN_CUSTOMER, blankSalesDoc, getDefaultNote, getDefaultWarranty, lotExpiryOf, peekDocSeq,
} from '@/lib/sales';
import { DocEditor } from '../doc-editor';
import { IncomeHistoryTable } from '../history-table';

export const dynamic = 'force-dynamic';

/**
 * 03.6 ขายหน้าร้าน — ลูกค้าเดินเข้ามาซื้อของจ่ายสด ออกใบเสร็จทันที ไม่ต้องมีใบเสนอราคา
 *
 * ตามต้นแบบ (pageWalkin) และ SUMMARY ข้อ 3:
 * - เปิดมาเป็นฟอร์มใบเสร็จ ลูกค้า "ลูกค้าขาจร (เงินสด)" รับเงินสดเต็มจำนวนไว้ให้ แก้ได้ทุกช่อง
 * - ไทล์ [ประวัติขายหน้าร้าน] สลับเป็นประวัติอย่างเดียว · [+ ขายหน้าร้าน] กลับเป็นฟอร์ม
 * - ประวัติ = ใบเสร็จที่ไม่มีใบอ้างอิง (ไม่รวมที่ยกเลิกหรือลบถาวร)
 * - บันทึกแล้วกลับหน้านี้พร้อมแถบบันทึกเรียบร้อย ขายรายถัดไปได้เลย
 *
 * ขายหน้าร้านคือใบเสร็จธรรมดาที่ไม่มีต้นทาง ไม่มีคอลัมน์หรือชนิดเอกสารแยก
 * สิทธิ์จึงเป็นสิทธิ์ใบเสร็จ ชุดเดียวกับ /income/new?walkin=1
 */
export default async function WalkinPage({
  searchParams,
}: {
  searchParams: Promise<{
    hist?: string; page?: string; size?: string; from?: string; to?: string;
    month?: string; year?: string; saved?: string; savedId?: string;
  }>;
}) {
  const session = await requireTab('income', 'receipt');
  const sp = await searchParams;
  const hist = sp.hist === '1';
  const todayIso = today();
  const mayEdit = canEdit(session, 'income', 'receipt');

  const { from, to } = rangeFromParams(sp);
  const page = Number(sp.page ?? '1') || 1;
  const pageSize = pageSizeOf(sp.size, HIST_PAGE_SIZES, HIST_DEFAULT_PAGE_SIZE);
  const range = { ...(from ? { from } : {}), ...(to ? { to } : {}) };

  const history = hist
    ? await listIncomeDocs({
      search: '', kind: 'RC', page, from, to, pageSize,
      includeVoid: false, openOnly: false, walkinOnly: true,
    })
    : null;
  const shopBanks = hist ? (await getShop()).bankAccounts ?? [] : [];

  const form = hist ? null : await (async () => {
    const [shop, warranty, noteDefault] = await Promise.all([getShop(), getDefaultWarranty(), getDefaultNote()]);
    let initial = blankSalesDoc('RC', warranty, shop.whtRate);
    initial = { ...initial, note: initial.note || noteDefault, partyName: WALK_IN_CUSTOMER };
    const [lotExpiry, seq] = await Promise.all([
      lotExpiryOf(initial.items.map((it) => it.productId)),
      peekDocSeq('RC', initial.docDate),
    ]);
    return { shop, initial, lotExpiry, seq };
  })();

  const lastPage = history ? Math.max(1, Math.ceil(history.total / pageSize)) : 1;
  const pageHref = (n: number) => ({
    pathname: '/income/walkin' as const,
    query: { hist: '1', ...range, ...(sp.size ? { size: sp.size } : {}), page: n },
  });

  return (
    <Shell
      current="/income"
      title="ขายหน้าร้าน"
      sub="ลูกค้าเดินเข้ามาซื้อของจ่ายสด — ออกใบเสร็จทันที ไม่ต้องมีใบเสนอราคา"
    >
      <SubNav menu="income" current="walkin">
        <SavedNotice saved={sp.saved} savedId={sp.savedId} />

        <div className="card">
          <div className="toolbar">
            <div className="tiles">
              <Link className="tile" aria-current={hist ? 'true' : undefined}
                    href={{ pathname: '/income/walkin', query: { hist: '1', ...range } }}>
                ประวัติขายหน้าร้าน
              </Link>
              <Link className="tile act" aria-current={hist ? undefined : 'true'} href="/income/walkin">
                + ขายหน้าร้าน
              </Link>
            </div>
          </div>
        </div>

        {form ? (
          <div id="new-doc" style={{ marginBottom: 14 }}>
            <DocEditor initial={form.initial} vatRate={form.shop.vatRate} shopWhtRate={form.shop.whtRate} mode="new"
                       docNoPreview={{ seq: form.seq, month: form.initial.docDate.slice(0, 7) }}
                       lotExpiry={form.lotExpiry} expiryWarnDays={form.shop.expiryWarnDays} today={todayIso}
                       cashOnOpen banks={form.shop.bankAccounts} returnTo="/income/walkin" />
          </div>
        ) : null}

        {history ? (
          <div className="card">
            <header>
              <h2>ประวัติขายหน้าร้าน</h2>
              <span className="spacer" />
              <span className="subtle">
                {history.total.toLocaleString('en-US')} ใบ{from || to ? ' ในช่วงที่เลือก' : ''}
              </span>
            </header>
            <DocDateFilter base="/income/walkin" from={from} to={to} keep={{ hist: '1' }} monthPicker={false} />
            {history.rows.length === 0 ? (
              <div className="empty">ยังไม่มีการขายหน้าร้านในช่วงนี้</div>
            ) : (
              <IncomeHistoryTable rows={history.rows} todayIso={todayIso} mayEdit={mayEdit} banks={shopBanks} />
            )}
            <div className="pager">
              <span>หน้า {page} จาก {lastPage}</span>
              <PageSize base="/income/walkin" size={pageSize} keep={{ hist: '1', ...range }} sizes={HIST_PAGE_SIZES} defaultSize={HIST_DEFAULT_PAGE_SIZE} />
              <div className="spacer" />
              {page > 1 ? <Link className="btn" href={pageHref(page - 1)}>ก่อนหน้า</Link> : null}
              {page < lastPage ? <Link className="btn" href={pageHref(page + 1)}>ถัดไป</Link> : null}
            </div>
          </div>
        ) : null}
      </SubNav>
    </Shell>
  );
}
