import type { DocDetail, ShopInfo } from '@/lib/queries';
import { baht, thDate } from '@/lib/format';
import { PrintButton } from '@/app/income/[id]/print/print-button';
import { BackFab } from './back-fab';

/**
 * หน้าพิมพ์เอกสาร A4 ตามต้นแบบ 14 ก.ย. 2569 22:37 (pagePrint ใน dgl-prototype-2569-09-13.html)
 *
 * ใช้ร่วมกันระหว่างเอกสารขาย (ใบเสนอราคา ใบส่งมอบ ใบกำกับภาษี ใบเสร็จ) และใบซื้อ/ค่าใช้จ่าย
 * เจ้าของกิจการเลือกให้เหมือนต้นแบบทุกอย่าง (15 ก.ย. 2569) — ไม่มีกรอบวิธีชำระเงิน หัก ณ ที่จ่าย
 * ยอดสุทธิ และจำนวนเงินตัวอักษรเหมือนหน้าพิมพ์เดิม · ดู docs/ui-layout-spec.md §13
 * ยกเว้นใบเสร็จ: ต่อท้ายยอดรวมด้วย หัก ณ ที่จ่าย (ถ้ามี) · ชำระแล้ว · คงค้างชำระ (ผู้ใช้ขอเพิ่ม 17 ก.ย. 2569)
 *
 * แบ่งหน้า A4: หน้าแรกมีกรอบลูกค้า/รถ/อาการ จุได้น้อยกว่า หน้าต่อไปจุ 26 บรรทัด ยอดรวม/ลายเซ็นอยู่หน้าสุดท้าย
 */
export const PRINT_TITLE: Record<string, string> = {
  BN: 'ใบวางบิล',
  QT: 'ใบเสนอราคา',
  IVT: 'ใบส่งมอบงาน / ใบกำกับภาษี',
  IV: 'ใบส่งมอบงาน / ใบแจ้งหนี้',
  RC: 'ใบเสร็จรับเงิน',
  PO: 'ใบซื้อสินค้า',
  EX: 'บันทึกค่าใช้จ่าย',
};

type Brand = { logoUrl: string; ownerName: string; signatureUrl: string; warrantyText: string };

const CAPN = 26;

/** ทุกเอกสารพิมพ์สองชุด — ต้นฉบับให้ลูกค้า สำเนาเก็บเข้าแฟ้ม (ผู้ใช้กำหนด 19 ก.ย. 2569) */
export const COPY_LABELS = ['ต้นฉบับ', 'สำเนา'] as const;

function Kv({ l, v, mono, bold }: { l: string; v: string | number | null | undefined; mono?: boolean; bold?: boolean }) {
  return (
    <div className="kv">
      <b>{l}:</b>
      <span className={mono ? 'mono' : undefined} style={bold ? { fontWeight: 700 } : undefined}>{v || '-'}</span>
    </div>
  );
}

export function DocPrint({ doc, shop, brand }: { doc: DocDetail; shop: ShopInfo; brand: Brand }) {
  const kind = doc.kind;
  /* ใบซื้อและค่าใช้จ่ายเป็นคู่ค้าฝั่งผู้ขายและไม่มีรถ — ต้นแบบกันเฉพาะ PO ค่าใช้จ่ายจึงได้กรอบรถว่างและหัว "ลูกค้า"
     ซึ่งไม่มีความหมายบนบันทึกค่าใช้จ่าย ทำให้เหมือนใบซื้อ */
  const buy = kind === 'PO' || kind === 'EX';
  const hasDisc = doc.items.some((it) => it.discPct > 0);
  const CAP1 = kind === 'QT' ? 8 : 12;

  const pages: DocDetail['items'][] = [];
  if (doc.items.length <= CAP1) pages.push(doc.items);
  else {
    pages.push(doc.items.slice(0, CAP1));
    for (let k = CAP1; k < doc.items.length; k += CAPN) pages.push(doc.items.slice(k, k + CAPN));
  }
  const N = pages.length;

  /* ต้นฉบับทั้งชุด แล้วสำเนาทั้งชุด (ผู้ใช้กำหนด 19 ก.ย. 2569)
     เอกสารสามหน้าจึงพิมพ์ออกมาหกแผ่น ไม่ใช่สลับต้นฉบับ/สำเนาทีละหน้า */
  const sheets = COPY_LABELS.flatMap((copy) => pages.map((chunk, pi) => ({ copy, chunk, pi })));

  const v = doc.vehicle ?? {};
  const plate = [v.plateA, v.plateB].filter(Boolean).join(' ') || doc.vehiclePlate || '';
  const prov = v.plateProv || v.plateProvince || '';
  const due = doc.creditDays > 0 && doc.dueDate ? thDate(doc.dueDate) : '-';

  /* บัญชีรับโอน — บัญชีที่ใบนี้รับโอนเข้า (อ้างอิงในรายการรับชำระ) ไม่งั้นบัญชีหลัก */
  const banks = shop.bankAccounts ?? [];
  const bank = banks.find((b) => b.no && doc.payments.some((p) => (p.ref ?? '').includes(b.no))) ?? banks[0];
  const showBank = (kind === 'RC' || kind === 'BN' || kind === 'IVT' || kind === 'IV') && !!bank;

  const colCount = hasDisc ? 7 : 6;
  const paid = Math.round(doc.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const outstanding = Math.max(0, Math.round((doc.payable - paid) * 100) / 100);
  const owner = (kind === 'QT' ? doc.proposer : doc.receivedBy) || brand.ownerName || '..........................';
  /* ตำแหน่งงานใต้ชื่อผู้ลงนาม (ผู้ใช้กำหนด 19 ก.ย. 2569)
     ขึ้นเฉพาะเมื่อชื่อที่พิมพ์เป็นคนเดียวกับคนที่สร้างเอกสาร — ไม่งั้นจะเอาตำแหน่งของคนหนึ่ง
     ไปแปะใต้ชื่ออีกคน (ช่องผู้รับเงินบนใบพิมพ์ชื่อใครก็ได้) */
  const ownerTitle = doc.creatorJobTitle && owner.trim() === doc.creatorName.trim() ? doc.creatorJobTitle : '';

  return (
    <>
      <div className="printbar">
        <PrintButton label="🖨 พิมพ์ / บันทึก PDF" />
        <span className="subtle">
          กระดาษ A4 · ต้นฉบับ {N} หน้า แล้วสำเนาอีก {N} หน้า
          {N > 1 ? ' (รายการเกินหน้าแรก ระบบขึ้นหน้าใหม่ให้)' : ''}
        </span>
      </div>

      <BackFab solo fallbackHref={buy ? `/expense/${doc.id}` : `/income/${doc.id}`} />

      <div className="printview">
        {sheets.map(({ copy, chunk, pi }, si) => (
          <div className="paper doc2" key={si}>
            <div className="doc-head">
              {brand.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img className="lg" src={brand.logoUrl} alt="" />
              ) : null}
              <div className="co">
                <b>{shop.name}</b>
                <div>{shop.addrText || ''}</div>
                <div>โทร {shop.tel || '-'} · เลขประจำตัวผู้เสียภาษี {shop.taxId || '-'}</div>
              </div>
              <div className="doc-meta">
                <h1>{PRINT_TITLE[kind] ?? kind}</h1>
                <div className="docno-big mono">{doc.docNo}</div>
                <div className="copy-tag">{copy}</div>
                {N > 1 ? <div style={{ fontSize: 11 }}>หน้า {pi + 1} / {N}</div> : null}
              </div>
            </div>

            {pi === 0 ? (
              <>
                <div className="box party2">
                  <div>
                    <h4>{buy ? 'ผู้ขาย' : 'ลูกค้า'}</h4>
                    <Kv l="ชื่อ" v={doc.partyName} />
                    <Kv l="ที่อยู่" v={doc.partyAddrText} />
                    <Kv l="เลขประจำตัวผู้เสียภาษี" v={doc.partyTaxId} mono />
                    <Kv l="โทร" v={doc.partyTel} mono />
                  </div>
                  <div>
                    <h4>ข้อมูลเอกสาร</h4>
                    <Kv l="เลขที่" v={doc.docNo} mono bold />
                    <Kv l="วันที่" v={thDate(doc.docDate)} />
                    <Kv l="อ้างอิง" v={doc.parent?.docNo || doc.refDocNo} mono />
                    {kind === 'QT' ? (
                      <Kv l="ยืนราคา" v="30 วัน" />
                    ) : (
                      <>
                        <Kv l="เงื่อนไขชำระเงิน" v={doc.creditDays > 0 ? `เครดิต ${doc.creditDays} วัน` : 'เงินสด'} />
                        <Kv l="วันครบกำหนดชำระ" v={due} />
                      </>
                    )}
                  </div>
                </div>

                {buy ? null : (
                  <div className="box veh3">
                    <h4>รถยนต์ที่เข้ารับบริการ</h4>
                    <div className="g3">
                      <Kv l="ยี่ห้อ / รุ่น" v={[v.brand, v.model].filter(Boolean).join(' ')} />
                      <Kv l="ปี / สี" v={[v.year, v.color].filter(Boolean).join(' / ')} />
                      <Kv l="ทะเบียน" v={plate ? `${plate}${prov ? ` ${prov}` : ''}` : ''} mono bold />
                      <Kv l="เลขไมล์" v={v.mileage ? `${Number(v.mileage).toLocaleString('en-US')} กม.` : ''} mono />
                      <Kv l="เลขเครื่องยนต์" v={v.engineNo} mono />
                      <Kv l="เลขตัวถัง" v={v.chassisNo} mono />
                      {v.other ? <Kv l="อื่นๆ" v={v.other} /> : null}
                    </div>
                  </div>
                )}

                {kind === 'QT' ? (
                  <>
                    <div className="box">
                      <h4>อาการที่แจ้ง</h4>
                      {[0, 1, 2].map((i) => (
                        <div className="kv" key={i}><b>{i + 1}.</b><span>{doc.complaints[i] || ' '}</span></div>
                      ))}
                    </div>
                    <div className="box">
                      <h4>อาการที่ตรวจพบ</h4>
                      {[0, 1, 2].map((i) => (
                        <div className="kv" key={i}><b>{i + 1}.</b><span>{doc.findings[i] || ' '}</span></div>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            <table className="doc">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>ลำดับ</th>
                  <th style={{ width: 96 }}>รหัสสินค้า</th>
                  <th>รายการ</th>
                  <th style={{ width: 50 }}>จำนวน</th>
                  <th style={{ width: 80 }}>ราคา/หน่วย</th>
                  {hasDisc ? <th style={{ width: 54 }}>ส่วนลด</th> : null}
                  <th style={{ width: 90 }}>จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {chunk.map((it) => (
                  <tr key={it.lineNo}>
                    <td style={{ textAlign: 'center' }}>{it.lineNo}</td>
                    <td>{it.code}</td>
                    <td>{it.name}</td>
                    <td style={{ textAlign: 'right' }}>{it.qty.toLocaleString('en-US')}</td>
                    <td style={{ textAlign: 'right' }}>{baht(it.unitPrice)}</td>
                    {hasDisc ? <td style={{ textAlign: 'right' }}>{it.discPct > 0 ? `${it.discPct}%` : ''}</td> : null}
                    <td style={{ textAlign: 'right' }}>{baht(it.lineTotal)}</td>
                  </tr>
                ))}
                {Array.from({ length: pi === N - 1 ? Math.max(0, (pi === 0 ? CAP1 : CAPN) - chunk.length) : 0 }).map((_, i) => (
                  <tr key={`blank-${i}`}>
                    <td className="blank" />
                    {Array.from({ length: colCount - 1 }).map((__, j) => <td key={j} />)}
                  </tr>
                ))}
              </tbody>
            </table>

            {pi < N - 1 ? (
              <div className="brandfoot"><span>DriveGoLight! · {shop.name}</span><span>{doc.docNo} · ต่อหน้าถัดไป</span></div>
            ) : (
              <>
                <div className="tail2">
                  <div className="notes">
                    <div className="box"><h4>หมายเหตุ</h4><div style={{ whiteSpace: 'pre-wrap' }}>{doc.note || '-'}</div></div>
                    {kind === 'RC' ? (
                      <div className="box">
                        <h4>การรับประกัน</h4>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{doc.warrantyText || brand.warrantyText || ''}</div>
                      </div>
                    ) : null}
                  </div>
                  <table className="totals2">
                    <tbody>
                      <tr><td>รวมเป็นเงิน</td><td>{baht(doc.subtotal)}</td></tr>
                      <tr>
                        <td>ส่วนลด{doc.discountMode === 'pct' && doc.discountPct > 0 ? ` ${doc.discountPct}%` : ''}</td>
                        <td>{baht(doc.discount)}</td>
                      </tr>
                      {doc.vatMode !== 'none' ? (
                        <>
                          <tr><td>มูลค่าก่อนภาษี</td><td>{baht(doc.netAmount)}</td></tr>
                          <tr><td>ภาษีมูลค่าเพิ่ม {doc.vatRate}%</td><td>{baht(doc.vatAmount)}</td></tr>
                        </>
                      ) : null}
                      <tr><td><b>รวมทั้งสิ้น</b></td><td><b>{baht(doc.grandTotal)}</b></td></tr>
                      {/* ใบเสร็จ: ยอดที่รับแล้วและที่ยังค้าง ณ ตอนพิมพ์ (ผู้ใช้แจ้ง 17 ก.ย. 2569 — ต้นแบบไม่มี)
                          คงค้างคิดจากยอดต้องชำระหลังหัก ณ ที่จ่าย จึงต้องโชว์บรรทัดหักด้วย ไม่งั้นบวกลบไม่ลงกัน */}
                      {kind === 'RC' ? (
                        <>
                          {doc.whtAmount > 0 ? (
                            <tr className="pay-wht"><td>หัก ณ ที่จ่าย {doc.whtRate}%</td><td>−{baht(doc.whtAmount)}</td></tr>
                          ) : null}
                          <tr className="pay-paid"><td>ชำระแล้ว</td><td>{baht(paid)}</td></tr>
                          <tr className="pay-out"><td><b>คงค้างชำระ</b></td><td><b>{baht(outstanding)}</b></td></tr>
                        </>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="sign">
                  <div><div className="line" />ผู้รับสินค้า</div>
                  <div>
                    {brand.signatureUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={brand.signatureUrl} alt="" style={{ height: 26, display: 'block', margin: '0 auto -26px', objectFit: 'contain' }} />
                    ) : null}
                    <div className="line" />
                    {kind === 'RC' ? 'ผู้รับเงิน' : kind === 'QT' ? 'ผู้เสนอราคา' : 'ผู้ส่งมอบงาน'}
                    <br /><span style={{ fontSize: 11 }}>( {owner} )</span>
                    {ownerTitle ? <><br /><span className="sign-title">{ownerTitle}</span></> : null}
                  </div>
                  <div><div className="line" />{kind === 'QT' ? 'ผู้อนุมัติซ่อม' : 'ผู้มีอำนาจลงนาม'}</div>
                </div>

                {showBank ? (
                  <div className="bankline2">
                    <b>ชำระเงินโอนเข้าบัญชี:</b> ธนาคาร {bank!.bank} · เลขที่บัญชี <b className="mono">{bank!.no}</b> · ชื่อบัญชี {bank!.name}
                  </div>
                ) : null}
                <div className="brandfoot"><span>DriveGoLight! · {shop.name}</span><span>{doc.docNo}</span></div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
