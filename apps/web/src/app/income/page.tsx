import Link from 'next/link';
import { PrintReport } from '@/components/print-report';
import { RowLink } from '@/components/row-link';
import { DocEditor } from './doc-editor';
import { SavedBanner } from '@/components/saved-banner';
import { blankSalesDoc, getDefaultNote, getDefaultWarranty, lotExpiryOf, peekDocSeq } from '@/lib/sales';
import { today } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { listIncomeDocs, getShop } from '@/lib/queries';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { PageSize, pageSizeOf } from '@/components/page-size';
import { baht, KIND_SHORT, payLabel, thDate } from '@/lib/format';
import { canEdit, canTab } from '@/lib/perms';
import { TodoCell } from './todo-cell';
import { NEW_BTNS, newBtnHref } from '@/lib/doc-flow';

export const dynamic = 'force-dynamic';

/**
 * เลขกำกับยกมาจากเมนูของรุ่น 3.6 ให้ผู้ใช้เดิมไม่ต้องเรียนใหม่
 *
 * ใบส่งมอบสองแบบเคยได้ 03.3 เท่ากันทั้งคู่ ตอนนี้แยกเป็น 03.2 กับ 03.2.1
 * ให้ตรงกับผังเมนู — เลขซ้ำกันทำให้กดจากเมนูแล้วหน้าปลายทางบอกเลขคนละตัว
 */
/**
 * แถบไทล์ด้านบน "ตามเมนูย่อยที่กดอยู่" (ผู้ใช้กำหนดจากภาพ):
 *   ใบเสนอราคา     → ประวัติทั้งหมด · ประวัติใบเสนอราคา · [+ ใบเสนอราคา]
 *   ใบส่งมอบ+กำกับ → ประวัติทั้งหมด · ประวัติใบส่งมอบ+ใบกำกับภาษี · [+ ใบส่งมอบ/ใบกำกับภาษี]
 *   ใบส่งมอบ (ไม่มี VAT) → ประวัติทั้งหมด · ประวัติใบส่งมอบ (ไม่มี VAT) · [+ …]
 *   ใบเสร็จรับเงิน → ประวัติทั้งหมด · ประวัติใบเสร็จ IVT (มี VAT) · ประวัติใบเสร็จ IV (ไม่มี VAT) · [+ ใบเสร็จรับเงิน]
 * ทุกประวัติเลือกช่วงเวลาได้ (วันนี้/เดือนนี้/เดือนที่แล้ว/ปีนี้/ปีที่แล้ว/กำหนดเอง)
 */
type Strip = { label: string; query: Record<string, string>; act?: boolean; on?: (q: { kind: string; vat?: string }) => boolean };
const ALL_HISTORY: Strip = { label: 'ประวัติทั้งหมด', query: {}, on: (q) => q.kind === '' };
const STRIP: Record<string, Strip[]> = {
  '': [ALL_HISTORY],
  QT: [ALL_HISTORY, { label: 'ประวัติใบเสนอราคา', query: { kind: 'QT' }, on: (q) => q.kind === 'QT' },
       { label: '+ ใบเสนอราคา', query: { kind: 'QT' }, act: true }],
  IVT: [ALL_HISTORY, { label: 'ประวัติใบส่งมอบ + ใบกำกับภาษี', query: { kind: 'IVT' }, on: (q) => q.kind === 'IVT' },
        { label: '+ ใบส่งมอบ/ใบกำกับภาษี', query: { kind: 'IVT' }, act: true }],
  IV: [ALL_HISTORY, { label: 'ประวัติใบส่งมอบ (ไม่มี VAT)', query: { kind: 'IV' }, on: (q) => q.kind === 'IV' },
       { label: '+ ใบส่งมอบ (ไม่มี VAT)', query: { kind: 'IV' }, act: true }],
  RC: [ALL_HISTORY, { label: 'ประวัติใบเสร็จรับเงิน IVT (มี VAT)', query: { kind: 'RC', vat: 'yes' }, on: (q) => q.kind === 'RC' && q.vat === 'yes' },
       { label: 'ประวัติใบเสร็จรับเงิน IV (ไม่มี VAT)', query: { kind: 'RC', vat: 'no' }, on: (q) => q.kind === 'RC' && q.vat === 'no' },
       { label: '+ ใบเสร็จรับเงิน', query: { kind: 'RC' }, act: true }],
};


/** แท็บย่อยในผังเมนูต่อกับตัวกรองชนิดเอกสาร — ใบส่งมอบสองแบบเป็นคนละแท็บ (03.2 / 03.2.1) */
const SUB_OF: Record<string, string> = {
  QT: 'quote', IVT: 'invoice', IV: 'ivnovat', RC: 'receipt',
};

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; page?: string; size?: string;
    from?: string; to?: string; month?: string; year?: string; voided?: string; open?: string; vat?: string; hist?: string; saved?: string; savedId?: string;
  }>;
}) {
  const session = await requireTab('income', 'receipt');
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const search = sp.q ?? '';
  const kind = sp.kind ?? '';
  const { from, to } = rangeFromParams(sp);
  const pageSize = pageSizeOf(sp.size);

  const includeVoid = sp.voided === '1';
  /* งานค้างส่งมอบ — ใบเสนอราคาที่ยังไม่ออกใบต่อ (ลิงก์มาจากการ์ดหน้าแรก) */
  const openOnly = sp.open === '1';
  const todayIso = today();
  /* ทุกเมนูย่อยของรายรับเปิดมาเป็น "หน้าสร้างเอกสารใหม่" ทันที ประวัติต่อด้านล่าง
     กดไทล์ประวัติ (hist=1) จึงสลับให้ประวัติขึ้นบน */
  const formKind = (['QT', 'IVT', 'IV', 'RC'] as const).find((k) => k === kind) ?? null;
  const histFirst = sp.hist === '1' || !formKind;
  /* หลังบันทึกกลับมาหน้านี้ตามเดิม (คงชนิด/ตัวกรอง) */
  const returnTo = `/income?kind=${kind}${sp.hist === '1' ? '&hist=1' : ''}${sp.vat ? `&vat=${sp.vat}` : ''}`;
  const vat = sp.vat === 'yes' || sp.vat === 'no' ? sp.vat : undefined;
  const { rows, total } = await listIncomeDocs({
    search, kind, page, from, to, pageSize, includeVoid, openOnly, vat,
  });

  /* ข้อมูลสำหรับฟอร์มสร้างใหม่ (ชุดเดียวกับ /income/new) */
  const form = formKind ? await (async () => {
    const [shop, warranty, noteDefault] = await Promise.all([getShop(), getDefaultWarranty(), getDefaultNote()]);
    let initial = blankSalesDoc(formKind, warranty, shop.whtRate);
    initial = { ...initial, note: initial.note || noteDefault };
    const lotExpiry = await lotExpiryOf(initial.items.map((it) => it.productId));
    const seq = await peekDocSeq(formKind, initial.docDate);
    return { shop, initial, lotExpiry, seq };
  })() : null;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  /*
   * คอลัมน์เปลี่ยนตามแท็บ — รุ่น 6.4 มีหน้าแยกต่อชนิดเอกสาร แต่ละหน้าจึงมีคอลัมน์ของตัวเอง
   * เรารวมเป็นหน้าเดียวที่กรองด้วย kind ถ้าใช้คอลัมน์ชุดกลางชุดเดียวเหมือนเดิม
   * คอลัมน์เฉพาะทางของแต่ละชนิดจะหายหมด เช่นใบเสนอราคาไม่มีที่ให้บอกว่าออกใบต่อหรือยัง
   */
  const view = kind === 'QT' ? 'quote'
    : kind === 'RC' ? 'receipt'
    : kind === 'IV' || kind === 'IVT' ? 'invoice'
    : 'all';

  const mayInvoice = canTab(session, 'income', 'invoice');
  const mayReceipt = canTab(session, 'income', 'receipt');
  /* แก้ไขไม่ได้ก็ยกเลิกและคัดลอกไม่ได้ — ปุ่มที่กดแล้วโดนปฏิเสธไม่ควรมีให้เห็น */
  const mayEdit = canEdit(session, 'income', 'receipt');

  /* ค่าที่ต้องติดไปกับทุกลิงก์ในหน้านี้ ไม่งั้นกดหน้าถัดไปแล้วตัวกรองหลุด */
  const keep: Record<string, string> = {
    ...(search ? { q: search } : {}),
    ...(kind ? { kind } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(sp.size ? { size: sp.size } : {}),
    ...(includeVoid ? { voided: '1' } : {}),
    ...(openOnly ? { open: '1' } : {}),
    ...(vat ? { vat } : {}),
  };
  /* เหมือน keep แต่ไม่มี size — ปุ่มเลือกจำนวนแถวใส่ค่าของตัวเอง */
  const { size: _size, ...filters } = keep;

  const linkTo = (patch: Record<string, string | number>) => ({
    pathname: '/income' as const,
    query: { ...keep, ...patch },
  });

  return (
    <Shell
      current="/income"
      title="รายรับ"
      sub={`เอกสารขายทั้งหมด ${total.toLocaleString('en-US')} ฉบับ`}
      actions={undefined}
    >
      <SubNav menu="income" current={SUB_OF[kind] ?? ''}>
      {sp.saved && sp.savedId ? <SavedBanner docNo={sp.saved} printHref={`/income/${sp.savedId}/print`} openHref={`/income/${sp.savedId}`} /> : null}
      {/* แถบไทล์ (ประวัติ… / + สร้าง) อยู่บนสุดเสมอ · ประวัติแสดงเมื่อกด "ประวัติ…" เท่านั้น (ผู้ใช้กำหนด) */}
      <div className="card">
        <div className="toolbar">
          <div className="tiles">
          {(STRIP[kind] ?? STRIP['']).map((t) => t.act ? (
            <Link key={t.label} className="tile act" href={{ pathname: '/income', query: { kind: t.query.kind } }}>{t.label}</Link>
          ) : (
            <Link key={t.label} className="tile" aria-current={t.on?.({ kind, vat }) ? 'true' : undefined}
                  /* กดประวัติ → ประวัติขึ้นด้านบน ฟอร์มสร้างลงล่าง (ผู้ใช้กำหนด) */
                  href={{ pathname: '/income', query: { ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...t.query, hist: '1' } }}>
              {t.label}
            </Link>
          ))}
          </div>

          <div className="spacer" />

          <form action="/income" method="get" style={{ display: 'flex', gap: 6 }}>
            <input type="hidden" name="hist" value="1" />
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            {from ? <input type="hidden" name="from" value={from} /> : null}
            {to ? <input type="hidden" name="to" value={to} /> : null}
            <input className="in search" type="search" name="q" defaultValue={search}
                   placeholder="กรอกคำค้นหา — เลขที่เอกสาร ชื่อลูกค้า หรือทะเบียนรถ" style={{ width: 260 }} />
            {/* ค้นด้วยเลขที่เอกสารเจอใบที่ยกเลิกเสมอ ตัวเลือกนี้มีไว้สำหรับตอนไล่ดูทั้งรายการ */}
            <label className="chip" style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                   title="ปกติซ่อนไว้ ค้นด้วยเลขที่เอกสารยังเจอใบที่ยกเลิกอยู่แล้ว">
              <input type="checkbox" name="voided" value="1" defaultChecked={includeVoid} />
              รวมใบที่ยกเลิก
            </label>
            {kind === 'QT' || openOnly ? (
              <label className="chip" style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                     title="ใบเสนอราคาที่ยังไม่มีใบส่งมอบ/ใบเสร็จออกต่อ = รถยังซ่อมไม่เสร็จ">
                <input type="checkbox" name="open" value="1" defaultChecked={openOnly} />
                เฉพาะงานค้างส่งมอบ
              </label>
            ) : null}
            <button className="btn" type="submit">ค้นหา</button>
            <PrintReport />
          </form>
        </div>
      </div>
      {form && !histFirst ? <FormBlock form={form} kind={formKind!} returnTo={returnTo} /> : null}
      {histFirst ? (<div className="card">
        <DocDateFilter base="/income" from={from} to={to}
                       keep={{ ...(search ? { q: search } : {}), ...(kind ? { kind } : {}) }} />

        {rows.length === 0 ? (
          <div className="empty">ไม่พบเอกสารที่ตรงกับเงื่อนไข</div>
        ) : (
          <div className="tablewrap">
            {/* ประวัติแบบใหม่ (ผู้ใช้ให้ภาพอ้างอิง): ชนิด · วันที่ · ลูกค้า · ชำระ · ครบกำหนด · ก่อนภาษี · ภาษี · รวมสุทธิ · คงค้าง · สถานะ · รับชำระ/แก้/≡/ลบ */}
            {/* คอลัมน์พอดีหน้า ไม่ต้องเลื่อนซ้ายขวา: table-layout fixed + ชื่อลูกค้าตัดบรรทัดได้ · จอ < 1280 ซ่อน ก่อนภาษี/ภาษี */}
            <table className="tbl hist fit">
              {/* ความกว้างเป็น px ทุกคอลัมน์ ยกเว้นลูกค้า = ที่เหลือ → รวมไม่เกินหน้า ไม่มีเลื่อนซ้ายขวา */}
              <colgroup>
                <col style={{ width: 150 }} /><col style={{ width: 44 }} /><col style={{ width: 84 }} /><col />
                <col style={{ width: 48 }} /><col style={{ width: 84 }} /><col className="opt" style={{ width: 82 }} /><col className="opt" style={{ width: 68 }} />
                <col style={{ width: 90 }} /><col style={{ width: 82 }} /><col style={{ width: 90 }} /><col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>เลขที่เอกสาร</th>
                  <th>ชนิด</th>
                  <th>วันที่</th>
                  <th>ลูกค้า</th>
                  <th>ชำระ</th>
                  <th>ครบกำหนด</th>
                  <th className="num opt">ก่อนภาษี</th>
                  <th className="num opt">ภาษี</th>
                  <th className="num">รวมสุทธิ</th>
                  <th className="num">คงค้าง</th>
                  <th>สถานะ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const overdue = r.outstanding > 0.004 && !!r.dueDate && r.dueDate < todayIso;
                  const st = r.voided ? <span className="chip">ยกเลิก</span>
                    : r.kind === 'QT' ? (r.invoice || r.receipt ? <span className="chip ok">ออกใบต่อแล้ว</span> : <span className="chip warn">ค้างส่งมอบ</span>)
                    : overdue ? <span className="chip due">เกินกำหนด</span>
                    : r.outstanding > 0.004 ? <span className="chip warn">ค้างชำระ</span>
                    : <span className="chip ok">ชำระครบ</span>;
                  const canPay = !r.voided && r.kind !== 'QT' && r.outstanding > 0.004;
                  return (
                    <RowLink key={r.id} href={`/income/${r.id}`} className={r.voided ? 'voided' : ''}>
                      <td className="mono docno">{r.docNo}</td>
                      <td><span className={`kindchip k-${r.kind}`}>{r.kind}</span></td>
                      <td>{thDate(r.docDate)}</td>
                      <td className="wrap party"><b>{r.partyName}</b>{r.vehiclePlate ? <div className="mono subtle" style={{ fontSize: 12 }}>{r.vehiclePlate}</div> : null}</td>
                      <td>{r.kind === 'QT' ? '-' : r.creditDays > 0 ? `${r.creditDays} วัน` : 'สด'}</td>
                      <td>{r.kind !== 'QT' && r.creditDays > 0 && r.dueDate ? thDate(r.dueDate) : '-'}</td>
                      <td className="num mono opt">{baht(r.netAmount)}</td>
                      <td className="num mono opt">{baht(r.vatAmount)}</td>
                      <td className="num mono"><b>{baht(r.payable)}</b></td>
                      <td className="num mono">{r.kind === 'QT' ? '-' : r.outstanding > 0.004 ? baht(r.outstanding) : '-'}</td>
                      <td>{st}</td>
                      <td>
                        {/* ปุ่มสองบรรทัด: รับชำระ(เขียว) แก้ไข(แดงอ่อน) / พิมพ์(เทา) ลบ(แดงเข้ม) — มี 3 ปุ่ม = บน 2 ล่าง 1 (ผู้ใช้กำหนด) */}
                        <span className="row-acts grid2">
                          {canPay ? <Link className="btn sm act-pay" href={`/income/${r.id}#pay`}>รับชำระ</Link> : null}
                          {!r.voided && mayEdit ? <Link className="btn sm act-edit" href={`/income/${r.id}/edit`}>แก้ไข</Link> : null}
                          <Link className="btn sm act-print" href={`/income/${r.id}/print`}>พิมพ์</Link>
                          {!r.voided && mayEdit ? <Link className="btn sm act-del" href={`/income/${r.id}?void=1`}>ลบ</Link> : null}
                        </span>
                      </td>
                    </RowLink>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right' }} className="subtle">รวมหน้านี้</td>
                  <td className="opt" /><td className="opt" />
                  <td className="num mono"><b>{baht(rows.filter((r) => !r.voided).reduce((s, r) => s + r.payable, 0))}</b></td>
                  <td className="num mono"><b>{baht(rows.filter((r) => !r.voided && r.kind !== 'QT').reduce((s, r) => s + Math.max(0, r.outstanding), 0))}</b></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <PageSize base="/income" size={pageSize} keep={filters} />
          <div className="spacer" />
          {page > 1 ? <Link className="btn" href={linkTo({ page: page - 1 })}>ก่อนหน้า</Link> : null}
          {page < lastPage ? <Link className="btn" href={linkTo({ page: page + 1 })}>ถัดไป</Link> : null}
        </div>
      </div>) : null}

      </SubNav>
    </Shell>
  );
}


/** ฟอร์มสร้างเอกสารใหม่ที่ฝังในหน้ารายการ — ตัวเดียวกับ /income/new */
function FormBlock({ form, kind, returnTo }: {
  returnTo: string;
  form: { shop: { vatRate: number; whtRate: number; expiryWarnDays: number; bankAccounts: { bank: string; no: string; name: string }[] }; initial: Parameters<typeof DocEditor>[0]['initial']; lotExpiry: Record<string, string>; seq: number };
  kind: 'QT' | 'IVT' | 'IV' | 'RC';
}) {
  return (
    <div id="new-doc" style={{ marginBottom: 14 }}>
      <DocEditor initial={form.initial} vatRate={form.shop.vatRate} shopWhtRate={form.shop.whtRate} mode="new"
                 docNoPreview={{ seq: form.seq, month: form.initial.docDate.slice(0, 7) }}
                 lotExpiry={form.lotExpiry} expiryWarnDays={form.shop.expiryWarnDays} today={today()}
                 cashOnOpen={kind === 'RC'} banks={form.shop.bankAccounts} returnTo={returnTo} />
    </div>
  );
}
