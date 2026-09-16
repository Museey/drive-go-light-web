import Link from 'next/link';
import { PrintReport } from '@/components/print-report';
import { RowLink } from '@/components/row-link';
import { DocEditor } from './doc-editor';
import { SavedNotice } from '@/components/saved-notice';
import { blankSalesDoc, getDefaultNote, getDefaultWarranty, lotExpiryOf, peekDocSeq } from '@/lib/sales';
import { today } from '@drivegolight/core';
import { requireTab } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SubNav } from '@/components/sub-nav';
import { listIncomeDocs, getShop } from '@/lib/queries';
import { DocDateFilter, rangeFromParams } from '@/components/doc-date-filter';
import { HIST_DEFAULT_PAGE_SIZE, HIST_PAGE_SIZES, PageSize, pageSizeOf } from '@/components/page-size';
import { baht, KIND_SHORT, payLabel, thDate } from '@/lib/format';
import { canEdit, canTab } from '@/lib/perms';
import { TodoCell } from './todo-cell';
import { IncomeHistoryTable } from './history-table';
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
  /* ประวัติ 10 / 20 / 30 ต่อหน้า (ผู้ใช้กำหนด) */
  const pageSize = pageSizeOf(sp.size, HIST_PAGE_SIZES, HIST_DEFAULT_PAGE_SIZE);

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
  const shopBanks = (await getShop()).bankAccounts ?? [];

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
      <SavedNotice saved={sp.saved} savedId={sp.savedId} />
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

          {/* data-enter="own": ไม่มีปุ่มค้นหาแล้ว Enter ต้องส่งฟอร์ม — ไม่ให้ EnterToNext ดักไปโฟกัสช่องติ๊กถัดไป */}
          <form autoComplete="off" action="/income" method="get" data-enter="own" style={{ display: 'flex', gap: 6 }}>
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
            {/* ไม่มีปุ่มค้นหา (ผู้ใช้กำหนด: ซ้ำซ้อน) — ฟอร์มมีช่องข้อความช่องเดียว พิมพ์แล้ว Enter ส่งฟอร์มเอง */}
            <PrintReport />
          </form>
        </div>
      </div>
      {form && !histFirst ? <FormBlock form={form} kind={formKind!} returnTo={returnTo} /> : null}
      {histFirst ? (<div className="card">
        {/* hist=1 ต้องติดไปกับตัวกรองวันที่ด้วย — ไม่งั้นกรองจากหน้าประวัติแล้วเด้งไปฟอร์มสร้างใหม่
                           (เทสต์ doc-cards จับได้ตอนทำ dropdown ของจอแคบ · ชิปบนเดสก์ท็อปก็เป็นมาก่อนหน้านี้) */}
        <DocDateFilter base="/income" from={from} to={to} monthPicker={false}
                       keep={{ hist: '1', ...(search ? { q: search } : {}), ...(kind ? { kind } : {}) }} />

        {rows.length === 0 ? (
          <div className="empty">ไม่พบเอกสารที่ตรงกับเงื่อนไข</div>
        ) : (
          <IncomeHistoryTable rows={rows} todayIso={todayIso} mayEdit={mayEdit} banks={shopBanks}
                              cardTitle={kind ? `ประวัติ${KIND_SHORT[kind] ?? ''}` : 'ประวัติเอกสารทั้งหมด'}
                              more={lastPage > 1}
                              /* ปุ่มสร้างใหม่ต้องรู้ว่าจะสร้างใบอะไร — ยังไม่ได้เลือกชนิดก็ไม่มีปุ่ม */
                              newHref={kind ? `/income?kind=${kind}` : undefined}
                              newLabel={kind ? `＋ ${KIND_SHORT[kind] ?? 'สร้างใหม่'}` : undefined} />
        )}

        <div className="pager">
          <span>หน้า {page} จาก {lastPage}</span>
          <PageSize base="/income" size={pageSize} keep={filters} sizes={HIST_PAGE_SIZES} defaultSize={HIST_DEFAULT_PAGE_SIZE} />
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
      {/* key = ชนิดเอกสาร — กดแท็บ 03.1 → 03.2 → 03.4 เป็นหน้าเดียวกันแค่ ?kind= เปลี่ยน
          ไม่มี key React ใช้ฟอร์มตัวเดิม (ค่าตั้งต้นอยู่ใน useState ครั้งแรก) ฟอร์มค้างเป็นใบเสนอราคาจนกว่าจะรีเฟรช */}
      <DocEditor key={kind} initial={form.initial} vatRate={form.shop.vatRate} shopWhtRate={form.shop.whtRate} mode="new"
                 docNoPreview={{ seq: form.seq, month: form.initial.docDate.slice(0, 7) }}
                 lotExpiry={form.lotExpiry} expiryWarnDays={form.shop.expiryWarnDays} today={today()}
                 cashOnOpen={kind === 'RC'} banks={form.shop.bankAccounts} returnTo={returnTo} />
    </div>
  );
}
