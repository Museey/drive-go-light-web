import Link from 'next/link';
import { PrintReport } from '@/components/print-report';
import { canEdit as mayEditOf, canExport as mayExportOf } from '@/lib/perms';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { query } from '@/lib/auth';
import { listBillnotes, openInvoices, unbilledSummary } from '@/lib/billnotes';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { HIST_DEFAULT_PAGE_SIZE, HIST_PAGE_SIZES, PageSize, pageSizeOf } from '@/components/page-size';
import { baht, thDate } from '@/lib/format';
import { today } from '@drivegolight/core';
import { BillForm, type Party } from './bill-form';
import { SavedNotice } from '@/components/saved-notice';

export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; from?: string; to?: string; month?: string; year?: string;
    page?: string; size?: string; vat?: string; hist?: string; saved?: string; savedId?: string;
  }>;
}) {
  const session = await requireTab('income', 'billing');
  const mayEdit = mayEditOf(session, 'income', 'billing');
  const mayPrint = mayExportOf(session, 'income', 'billing');
  const sp = await searchParams;
  const { from, to } = rangeFromParams(sp);
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const pageSize = pageSizeOf(sp.size, HIST_PAGE_SIZES, HIST_DEFAULT_PAGE_SIZE);
  const vat = sp.vat === 'yes' || sp.vat === 'no' ? sp.vat : undefined;
  const histFirst = sp.hist === '1';

  const { list, unbilled, open } = await query(async (c) => ({
    list: await listBillnotes(c, { search: sp.q, from, to, page, pageSize, vat }),
    unbilled: await unbilledSummary(c),
    /* ฟอร์มสร้างใบวางบิลฝังในหน้า — ใบส่งมอบที่ยังไม่รับเงิน กรองตาม IVT/IV ที่เลือก */
    /* รวมใบเสร็จขายหน้าร้านแบบเครดิตที่ยังค้าง (RC ค้างชำระ) ด้วย — แยก IVT/IV ตามภาษีของใบ ไม่ใช่ตามชนิด */
    open: (await openInvoices(c, { includeDocIds: [] })).filter((v) => !v.inBillnoteNo && (vat === 'yes' ? v.vatMode !== 'none' : vat === 'no' ? v.vatMode === 'none' : true)),
  }));
  const byKey = new Map<string, Party>();
  for (const v of open) {
    const key = v.partyId ?? `name:${v.partyName}`;
    const cur = byKey.get(key) ?? { key, partyId: v.partyId, name: v.partyName || 'ไม่ระบุชื่อ', taxId: '', addrText: '', count: 0, owed: 0 };
    cur.count += 1; cur.owed += v.outstanding; byKey.set(key, cur);
  }
  const parties = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const formBlock = mayEdit ? (
    <div className="card" id="new-bill">
      <header><h2>สร้างใบวางบิล{vat === 'yes' ? ' (IVT)' : vat === 'no' ? ' (IV)' : ''}</h2><div className="spacer" /><span className="subtle">{open.length} ใบส่งมอบที่ยังไม่รับเงิน</span></header>
      <div className="body">
        {/* key = vat — สลับ IVT ↔ IV ไม่มี key ลูกค้าและใบที่ติ๊กไว้ค้างจากอีกชนิด */}
        <BillForm key={vat ?? 'all'} billDate={today()} dueDate="" byWhom="" note="" parties={parties} invoices={open} selected={[]} initialPartyKey="" returnTo={`/income/billing${vat ? `?vat=${vat}` : ''}`} />
      </div>
    </div>
  ) : null;
  const { rows, total, live } = list;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const keep: Record<string, string> = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(from ? { from } : {}),
    ...(vat ? { vat } : {}),
    ...(to ? { to } : {}),
  };
  const paged = { ...keep, ...(sp.size ? { size: sp.size } : {}) };

  return (
    <Shell
      current="/income"
      title="ใบวางบิล"
      sub={`${live} ใบที่ยังไม่ยกเลิก จากทั้งหมด ${total} ใบ`}
      tools={<PrintReport />}
    >
      <SubNav menu="income" current="billing">
        {/* ตัวเลขที่ตอบว่า "ยังต้องทำอะไรต่อ" ไม่ใช่ยอดลูกหนี้ทั้งหมด
            ซึ่งมีที่ของมันอยู่แล้วที่ 06.2 — ตามที่รุ่น 6.4 เขียนกำกับไว้ */}
        <div className="grid g3" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="label">ใบวางบิลที่ยังใช้งาน</div>
            <div className="value">{live.toLocaleString('en-US')} <span className="n">ใบ</span></div>
          </div>
          <div className="stat">
            <div className="label">ใบที่ยังเก็บเงินไม่ครบ และยังไม่ได้วางบิล</div>
            <div className={`value${unbilled.count > 0 ? ' due' : ''}`}>
              {unbilled.count.toLocaleString('en-US')} <span className="n">ใบ</span>
            </div>
          </div>
          <div className="stat">
            <div className="label">ยอดค้างที่ยังไม่ได้วางบิล</div>
            <div className="value">{baht(unbilled.owed)}</div>
            <span className="n">ยอดลูกหนี้ทั้งหมดรวมกันดูที่เมนู 06.2</span>
          </div>
        </div>

        <div className="note" style={{ marginBottom: 14 }}>
          ใบวางบิลเป็น<b>เอกสารแจ้งเก็บเงิน</b> รวมใบที่ยังค้างของลูกค้ารายเดียวไว้ใบเดียว
          — <b>ไม่ตั้งลูกหนี้ซ้ำและไม่นับเป็นรายได้</b> ยอดขายกับลูกหนี้ไม่เปลี่ยนเพราะใบนี้
          เมื่อได้รับเงินแล้วให้ออกใบเสร็จรับเงินตามปกติ
        </div>

        <SavedNotice saved={sp.saved} savedId={sp.savedId} />
        <div className="card">
          <div className="toolbar">
            {/* แถบไทล์ตามเมนูย่อย "ใบวางบิล": ประวัติทั้งหมด · ประวัติ IVT · ประวัติ IV · [+ IVT] [+ IV] */}
            <div className="tiles">
              <Link className="tile" href="/income">ประวัติทั้งหมด</Link>
              <Link className="tile" aria-current={vat === 'yes' && histFirst ? 'true' : undefined} href={{ pathname: '/income/billing', query: { ...keep, vat: 'yes', hist: '1' } }}>ประวัติใบวางบิล (IVT)</Link>
              <Link className="tile" aria-current={vat === 'no' && histFirst ? 'true' : undefined} href={{ pathname: '/income/billing', query: { ...keep, vat: 'no', hist: '1' } }}>ประวัติใบวางบิล (IV)</Link>
              {mayEdit ? <Link className="tile act" href="/income/billing?vat=yes">+ ใบวางบิล (IVT)</Link> : null}
              {mayEdit ? <Link className="tile act" href="/income/billing?vat=no">+ ใบวางบิล (IV)</Link> : null}
            </div>
            {/* data-enter="own": ไม่มีปุ่มค้นหาแล้ว Enter ต้องส่งฟอร์ม — ไม่ให้ EnterToNext ดักทิ้ง */}
            <form autoComplete="off" action="/income/billing" method="get" data-enter="own" style={{ display: 'flex', gap: 6 }}>
            <input type="hidden" name="hist" value="1" />
              <input className="in search" type="search" name="q" defaultValue={sp.q ?? ''}
                     placeholder="กรอกคำค้นหา — เลขที่ใบวางบิล หรือชื่อลูกค้า" style={{ width: 260 }} />
              {/* ไม่มีปุ่มค้นหา (ผู้ใช้กำหนด) — พิมพ์แล้ว Enter ส่งฟอร์มเอง */}
            </form>
          </div>
        </div>
        {!histFirst ? formBlock : null}
        {histFirst ? (<div className="card">

          <DocDateFilter base="/income/billing" from={from} to={to} monthPicker={false}
                         keep={sp.q ? { q: sp.q } : {}} />

          {rows.length === 0 ? (
            <div className="empty">ยังไม่มีใบวางบิล</div>
          ) : (
            <div className="tablewrap">
              <table className="tbl hist fit">
                <thead>
                  <tr>
                    <th>เลขที่</th><th>วันที่วางบิล</th><th>ลูกค้า</th>
                    <th className="num">จำนวนใบ</th>
                    <th className="num">ยอดที่แจ้งไป</th>
                    <th className="num">ค้างอยู่ตอนนี้</th>
                    <th>นัดรับเงิน</th><th>สถานะ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">
                        <Link href={`/income/billing/${r.id}`} style={{ textDecoration: 'underline' }}>
                          {r.no}
                        </Link>
                      </td>
                      <td>{thDate(r.billDate)}</td>
                      <td className="wrap">{r.partyName || '-'}</td>
                      <td className="num">{r.docCount}</td>
                      <td className="num">{baht(r.totalSnapshot)}</td>
                      <td className="num">
                        {r.status === 'void' ? '-'
                          : r.total > 0.004
                            ? <span className="chip warn">{baht(r.total)}</span>
                            : <span className="chip ok">เก็บครบแล้ว</span>}
                      </td>
                      <td>{thDate(r.dueDate)}</td>
                      <td>
                        {r.status === 'void'
                          ? <span className="chip due" title={r.voidedReason ?? ''}>ยกเลิกแล้ว</span>
                          : <span className="chip">วางบิลแล้ว</span>}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className="row-acts">
                          <Link className="btn sm" href={`/income/billing/${r.id}`}>เปิด</Link>
                          {mayPrint ? (
                            <Link className="btn sm" href={`/income/billing/${r.id}/print`}>พิมพ์</Link>
                          ) : null}

                          {/* ใบที่ยกเลิกแล้วเหลือทางเดียวคือคัดลอกเป็นใบใหม่ ตามรุ่น 6.4 */}
                          {r.status === 'void' && mayEdit ? (
                            <Link className="btn sm" href={`/income/billing/new?from=${r.id}`}>
                              คัดลอกใบใหม่
                            </Link>
                          ) : null}

                          {/* ยกเลิกไม่ทำทันทีจากแถว — พาไปแผงยืนยันที่ต้องกรอกเหตุผล */}
                          {r.status !== 'void' && mayEdit ? (
                            <Link className="btn sm danger" href={`/income/billing/${r.id}?void=1`}>
                              ยกเลิก
                            </Link>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pager">
            <span>หน้า {page} จาก {lastPage}</span>
            <PageSize base="/income/billing" size={pageSize} keep={keep} sizes={HIST_PAGE_SIZES} defaultSize={HIST_DEFAULT_PAGE_SIZE} />
            <div className="spacer" />
            {page > 1 ? (
              <Link className="btn" href={{ pathname: '/income/billing', query: { ...paged, page: page - 1 } }}>
                ก่อนหน้า
              </Link>
            ) : null}
            {page < lastPage ? (
              <Link className="btn" href={{ pathname: '/income/billing', query: { ...paged, page: page + 1 } }}>
                ถัดไป
              </Link>
            ) : null}
          </div>
        </div>) : null}

      </SubNav>
    </Shell>
  );
}
