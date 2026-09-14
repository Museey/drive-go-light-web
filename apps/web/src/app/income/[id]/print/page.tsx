import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { bahttext, whtBaseOf } from '@drivegolight/core';
import { BankLine } from '@/components/bank-line';
import { requireTab } from '@/lib/auth';
import { getDocDetail, getShop } from '@/lib/queries';
import { getShopSettings } from '@/lib/settings';
import { payAtIssue } from '@/lib/print';
import { baht, thDate, thDateLong } from '@/lib/format';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

/** ชื่อและคำกำกับของเอกสารแต่ละชนิด — ตรงกับ SALES_KINDS ของโปรแกรมเดิม */
const KINDS: Record<string, { title: string; en: string; party: string; signer: string; payer: string; totalLabel: string }> = {
  RC: {
    title: 'ใบเสร็จรับเงิน', en: 'RECEIPT', party: 'ได้รับเงินจาก',
    signer: 'ผู้รับเงิน', payer: 'ผู้จ่ายเงิน / ผู้รับรถ', totalLabel: 'ยอดสุทธิที่รับชำระ',
  },
  IV: {
    title: 'ใบส่งมอบงาน / ใบแจ้งหนี้', en: 'DELIVERY NOTE / INVOICE', party: 'ส่งมอบงานและแจ้งหนี้แก่',
    signer: 'ผู้ส่งมอบงาน', payer: 'ผู้รับมอบงาน', totalLabel: 'ยอดสุทธิที่ต้องชำระ',
  },
  IVT: {
    title: 'ใบส่งมอบงาน / ใบแจ้งหนี้ / ใบกำกับภาษี', en: 'DELIVERY NOTE / INVOICE / TAX INVOICE',
    party: 'ส่งมอบงานและแจ้งหนี้แก่', signer: 'ผู้ส่งมอบงาน', payer: 'ผู้รับมอบงาน',
    totalLabel: 'ยอดสุทธิที่ต้องชำระ',
  },
  QT: {
    title: 'ใบเสนอราคา / ใบอนุมัติซ่อม', en: 'QUOTATION / REPAIR APPROVAL', party: 'เสนอราคาแก่',
    signer: 'ผู้เสนอซ่อม', payer: 'ผู้อนุมัติซ่อม', totalLabel: 'ยอดสุทธิ',
  },
};

const isInvoice = (kind: string) => kind === 'IV' || kind === 'IVT';

const EPS = 0.004;
const Tick = ({ on }: { on: boolean }) => <span className="tick">{on ? '✓' : ' '}</span>;

/** ช่องเงินบนเส้นประ — เว้นว่างไว้ให้เขียนมือถ้าไม่ได้จ่ายทางนั้น */
const Slot = ({ value }: { value: number }) => (
  <span className="dotted">&nbsp;{value > EPS ? baht(value) : ' '.repeat(8)}&nbsp;</span>
);

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTab('income', 'receipt');
  const { id } = await params;
  /* รหัสที่ไม่ใช่ uuid ส่งไป Postgres แล้วพังเป็น 500 — ต้องเป็น 404 */
  if (!isUuid(id)) notFound();
  const [doc, shop, brand] = await Promise.all([getDocDetail(id), getShop(), getShopSettings()]);
  if (!doc) notFound();

  const K = KINDS[doc.kind] ?? KINDS.RC!;
  const A = payAtIssue(doc);

  /* ฐานภาษีหัก ณ ที่จ่ายคือมูลค่าค่าแรงอย่างเดียว ไม่ใช่มูลค่าทั้งใบ
     ตารางเอกสารไม่ได้เก็บค่านี้ไว้ จึงคำนวณใหม่จากบรรทัดรายการด้วยสูตรเดียวกับที่ออกเอกสาร */
  const whtBase = whtBaseOf(
    {
      items: doc.items.map((it) => ({ qty: it.qty, price: it.unitPrice, svc: it.isService, discPct: it.discPct })),
      discount: doc.discount,
      vatMode: doc.vatMode as 'none' | 'ex' | 'in',
    },
    { vatRate: doc.vatRate },
  );
  const v = doc.vehicle ?? {};

  /* เติมแถวว่างให้ตารางสูงพอดีหน้ากระดาษ ไม่ให้ดูโหรงเหรง */
  /* ความจุบรรทัดต่อหน้า: หน้าแรกมีกรอบลูกค้า/รถ (+อาการ สำหรับใบเสนอราคา) จึงจุน้อยกว่า หน้าต่อไปจุ 26 */
  const CAP1 = doc.kind === 'QT' ? 8 : 12;
  const CAPN = 26;
  const pages: typeof doc.items[] = [];
  if (doc.items.length <= CAP1) pages.push(doc.items);
  else {
    pages.push(doc.items.slice(0, CAP1));
    for (let k = CAP1; k < doc.items.length; k += CAPN) pages.push(doc.items.slice(k, k + CAPN));
  }

  /* คอลัมน์ส่วนลดรายบรรทัดขึ้นเฉพาะใบที่มีจริง — ใบทั่วไปหน้ากระดาษไม่เปลี่ยน */
  const hasLineDisc = doc.items.some((it) => it.discPct > 0);

  return (
    <>
      <div className="printbar">
        <div className="spacer" />
        <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
          กระดาษ A4 · ตั้งค่าเครื่องพิมพ์ให้ขอบกระดาษเป็น &quot;ไม่มี&quot; หรือ &quot;ต่ำสุด&quot;
        </span>
        <PrintButton />
      </div>

      <div className="printview">
        {/* แบ่งหน้า A4 อัตโนมัติ: รายการเกินหน้าแรกขึ้นหน้าใหม่ (หัวเอกสารซ้ำทุกหน้า กรอบลูกค้า/รถ/อาการเฉพาะหน้าแรก ยอดรวม/ลายเซ็นหน้าสุดท้าย) */}
        {pages.map((chunk, pi) => (
        <div className="paper" key={pi}>
          {/* ---------- หัวเอกสาร ---------- */}
          <div className="doc-head">
            {brand.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="lg" src={brand.logoUrl} alt="" />
            ) : null}
            <div className="co">
              <b>{shop.name}</b>
              <div>{shop.addrText || ''}</div>
              <div>
                โทร. {shop.tel || '-'}{shop.tel2 ? ` / ${shop.tel2}` : ''}
                &nbsp;·&nbsp; เลขประจำตัวผู้เสียภาษี {shop.taxId || '-'}
              </div>
            </div>
            <div className="doc-meta">
              <h1>{K.title}</h1>
              <div style={{ fontSize: 11, letterSpacing: '.08em' }}>{K.en}</div>
              <div className="docno-big">{doc.docNo}</div>
              {pages.length > 1 ? <div style={{ fontSize: 11 }}>หน้า {pi + 1} / {pages.length}</div> : null}
            </div>
          </div>

          {pi === 0 ? (
            <>
          {/* ---------- กรอบ 1: ลูกค้า | ข้อมูลเอกสาร (ผู้ใช้กำหนด) ---------- */}
          <div className="box party2">
            <div>
              <h4>{K.party}</h4>
              <div className="kv"><b>ชื่อ:</b><span>{doc.partyName || '-'}</span></div>
              <div className="kv"><b>ที่อยู่:</b><span>{doc.partyAddrText || '-'}</span></div>
              <div className="kv"><b>เลขประจำตัวผู้เสียภาษี:</b><span className="mono">{doc.partyTaxId || '-'}</span></div>
              <div className="kv"><b>โทร:</b><span className="mono">{doc.partyTel || '-'}</span>{doc.partyEmail ? <><b>อีเมล:</b><span>{doc.partyEmail}</span></> : null}</div>
            </div>
            <div>
              <h4>ข้อมูลเอกสาร</h4>
              <div className="kv"><b>เลขที่:</b><span className="mono" style={{ fontWeight: 700 }}>{doc.docNo}</span></div>
              <div className="kv"><b>วันที่:</b><span>{thDateLong(doc.docDate)}</span></div>
              <div className="kv"><b>อ้างอิง:</b><span className="mono">{doc.refDocNo || doc.parent?.docNo || '-'}</span></div>
              {doc.kind !== 'QT' ? (
                <>
                  <div className="kv"><b>เงื่อนไขชำระเงิน:</b><span>{doc.creditDays > 0 ? `เครดิต ${doc.creditDays} วัน` : 'เงินสด'}</span></div>
                  <div className="kv"><b>วันครบกำหนดชำระ:</b><span>{doc.creditDays > 0 ? thDateLong(doc.dueDate) : '-'}</span></div>
                </>
              ) : (
                <div className="kv"><b>ยืนราคา:</b><span>30 วัน</span></div>
              )}
            </div>
          </div>

          {/* ---------- กรอบ 2: รถยนต์ที่เข้ารับบริการ (เต็มความกว้าง 3 คอลัมน์) ---------- */}
          <div className="box veh3">
            <h4>รถยนต์ที่เข้ารับบริการ</h4>
            <div className="g3">
              <div className="kv"><b>ยี่ห้อ / รุ่น:</b><span>{[v.brand, v.model].filter(Boolean).join(' ') || '-'}</span></div>
              <div className="kv"><b>ปี / สี:</b><span>{[v.year, v.color].filter(Boolean).join(' / ') || '-'}</span></div>
              <div className="kv"><b>ทะเบียน:</b><span className="mono" style={{ fontWeight: 700 }}>{[v.plateA, v.plateB].filter(Boolean).join(' ') || '-'}{(v.plateProv || v.plateProvince) ? ` ${v.plateProv || v.plateProvince}` : ''}</span></div>
              <div className="kv"><b>เลขไมล์:</b><span className="mono">{v.mileage ? `${Number(v.mileage).toLocaleString('en-US')} กม.` : '-'}</span></div>
              <div className="kv"><b>เลขเครื่องยนต์:</b><span className="mono">{v.engineNo || '-'}</span></div>
              <div className="kv"><b>เลขตัวถัง:</b><span className="mono">{v.chassisNo || '-'}</span></div>
              {v.other ? <div className="kv"><b>อื่นๆ:</b><span>{v.other}</span></div> : null}
            </div>
          </div>

          {/* ---------- อาการที่แจ้งและที่ตรวจพบ (เฉพาะใบเสนอราคา) ---------- */}
          {doc.kind === 'QT' ? (
            <>
              <div className="box">
                <h4>อาการที่แจ้ง</h4>
                {[0, 1, 2].map((i) => doc.complaints[i] ?? '').map((c, i) => (
                  <div className="kv" key={i}><b>{i + 1}.</b><span>{c || ' '}</span></div>
                ))}
              </div>
              <div className="box">
                <h4>อาการที่ตรวจพบ</h4>
                {[0, 1, 2].map((i) => doc.findings[i] ?? '').map((f, i) => (
                  <div className="kv" key={i}><b>{i + 1}.</b><span>{f || ' '}</span></div>
                ))}
              </div>
            </>
          ) : null}

            </>
          ) : null}

          {/* ---------- รายการ ---------- */}
          <table className="doc">
            <thead>
              <tr>
                <th style={{ width: 34 }}>ลำดับ</th>
                <th style={{ width: 96 }}>รหัสสินค้า</th>
                <th>รายการ</th>
                <th style={{ width: 50 }}>จำนวน</th>
                <th style={{ width: 80 }}>ราคา/หน่วย</th>
                {hasLineDisc ? <th style={{ width: 54 }}>ส่วนลด</th> : null}
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
                  {hasLineDisc ? <td style={{ textAlign: 'right' }}>{it.discPct > 0 ? `${it.discPct}%` : ''}</td> : null}
                  <td style={{ textAlign: 'right' }}>{baht(it.lineTotal)}</td>
                </tr>
              ))}
              {Array.from({ length: pi === pages.length - 1 ? Math.max(0, (pi === 0 ? CAP1 : CAPN) - chunk.length) : 0 }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td className="blank">&nbsp;</td><td /><td /><td /><td /><td />
                </tr>
              ))}
            </tbody>
          </table>

          {pi === pages.length - 1 ? (
            <>
          {/* ---------- การชำระเงิน + ยอดรวม ---------- */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <div className="box" style={{ flex: 1, marginTop: 0 }}>
              <h4>{doc.kind === 'QT' ? 'หมายเหตุ' : isInvoice(doc.kind) ? 'เงื่อนไขการชำระเงิน' : 'วิธีการชำระเงิน'}</h4>

              {doc.kind === 'QT' ? (
                <ol style={{ fontSize: 10.5, margin: '7px 0 0', paddingLeft: 15, lineHeight: 1.45 }}>
                  <li>เจ้าของรถ / ผู้อนุมัติซ่อม ได้รับทราบรายการและค่าใช้จ่ายตามใบเสนอราคานี้แล้ว</li>
                  <li>
                    การเสนอซ่อมนี้เป็นการเสนอตามอาการที่วิเคราะห์ได้ในครั้งแรก
                    หากตรวจพบความเสียหายเพิ่มเติมระหว่างซ่อม อู่จะแจ้งให้ทราบก่อนดำเนินการทุกครั้ง
                  </li>
                </ol>
              ) : isInvoice(doc.kind) ? (
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  เครดิต <b>{doc.creditDays}</b> วัน · ครบกำหนดชำระ <b>{thDateLong(doc.dueDate)}</b>
                  <br />
                  ชำระโดย <Tick on={false} /> เงินสด &nbsp;<Tick on={false} /> เงินโอน &nbsp;
                  <Tick on={false} /> เช็ค &nbsp; เลขที่อ้างอิง ..............................
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, lineHeight: 1.85 }}>
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                      <span><Tick on={A.cash > EPS} /> เงินสด <Slot value={A.cash} /> บาท</span>
                      <span>
                        <Tick on={A.transfer > EPS} /> เงินโอน <Slot value={A.transfer} /> บาท
                        {A.ref ? <span className="dotted">&nbsp;{A.ref}&nbsp;</span> : null}
                      </span>
                    </div>
                    <div><Tick on={A.card > EPS} /> บัตรเครดิต <Slot value={A.card} /> บาท</div>
                    {A.other > EPS ? (
                      <div><Tick on /> ช่องทางอื่น <Slot value={A.other} /> บาท</div>
                    ) : null}
                    <div>
                      <Tick on={A.remain > EPS} /> เครดิต{' '}
                      <span className="dotted">&nbsp;{A.remain > EPS ? doc.creditDays : '........'}&nbsp;</span> วัน
                      &nbsp; ครบกำหนด <b>{A.remain > EPS ? thDate(doc.dueDate) : '................'}</b>
                    </div>
                  </div>

                  <table style={{ width: '100%', marginTop: 6, fontSize: 11.5, borderTop: '1px dotted #999' }}>
                    <tbody>
                      <tr>
                        <td style={{ paddingTop: 4 }}>รับชำระวันนี้</td>
                        <td style={{ textAlign: 'right', paddingTop: 4 }}><b>{baht(A.paid)}</b></td>
                      </tr>
                      <tr>
                        <td>{A.remain > EPS ? 'คงเหลือชำระภายหลัง' : 'คงเหลือ'}</td>
                        <td style={{ textAlign: 'right' }}><b>{baht(A.remain)}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}

              <div style={{ marginTop: 5, fontSize: 11.5, borderTop: '1px dotted #999', paddingTop: 4 }}>
                จำนวนเงิน (ตัวอักษร) <b>{bahttext(doc.payable)}</b>
              </div>

              {/* บรรทัดบัญชีเฉพาะใบที่ลูกค้าต้องจ่ายเงิน — ใบเสนอราคายังไม่ถึงขั้นจ่าย */}
              {doc.kind !== 'QT' ? <BankLine shop={shop} /> : null}
            </div>

            <table className="doc" style={{ width: '46%', marginTop: 0 }}>
              <tbody>
                <tr><td>รวมเป็นเงิน</td><td style={{ textAlign: 'right', width: 96 }}>{baht(doc.subtotal)}</td></tr>
                <tr><td>ส่วนลด{doc.discountMode === 'pct' && doc.discountPct > 0 ? ` ${doc.discountPct}%` : ''}</td><td style={{ textAlign: 'right' }}>{baht(doc.discount)}</td></tr>
                {doc.vatMode !== 'none' ? (
                  <>
                    <tr><td>มูลค่าก่อนภาษี</td><td style={{ textAlign: 'right' }}>{baht(doc.netAmount)}</td></tr>
                    <tr>
                      <td>ภาษีมูลค่าเพิ่ม {doc.vatRate}%</td>
                      <td style={{ textAlign: 'right' }}>{baht(doc.vatAmount)}</td>
                    </tr>
                  </>
                ) : null}
                <tr><td><b>รวมทั้งสิ้น</b></td><td style={{ textAlign: 'right' }}><b>{baht(doc.grandTotal)}</b></td></tr>
                {doc.kind === 'QT' ? null : (
                <tr>
                  <td>
                    หัก ณ ที่จ่าย {doc.whtRate}%
                    {whtBase > 0 ? (
                      <span style={{ fontSize: 10, color: '#666' }}> (ค่าบริการ {baht(whtBase)})</span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>−{baht(doc.whtAmount)}</td>
                </tr>
                )}
                <tr>
                  <td style={{ background: '#EDEFF1' }}><b>{K.totalLabel}</b></td>
                  <td style={{ textAlign: 'right', background: '#EDEFF1' }}><b>{baht(doc.payable)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---------- การรับประกัน ---------- */}
          {doc.kind === 'QT' ? null : (
          <div className="box">
            <h4>เงื่อนไขการรับประกัน</h4>
            <div style={{ fontSize: 11.5, lineHeight: 1.6, minHeight: 34, whiteSpace: 'pre-wrap' }}>
              {doc.warrantyText || ''}
            </div>
            {!doc.warrantyText?.trim() ? (
              <>
                <div style={{ borderBottom: '1px dotted #666', height: 14, marginTop: 2 }} />
                <div style={{ borderBottom: '1px dotted #666', height: 14, marginTop: 4 }} />
              </>
            ) : null}
          </div>
          )}

          {/* ---------- ลายเซ็น ---------- */}
          <div className="sign">
            <div>
              {/* ลายเซ็นที่ตั้งไว้ในข้อมูลร้าน — มีก็พิมพ์ทับเส้น ไม่มีก็เว้นให้เซ็นมือ */}
              {brand.signatureUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={brand.signatureUrl} alt="" style={{ height: 26, objectFit: 'contain', display: 'block', margin: '0 auto -26px' }} />
              ) : null}
              <div className="line" />{K.signer}
              <br />
              <span style={{ fontSize: 11 }}>
                ( {(doc.kind === 'QT' ? doc.proposer : doc.receivedBy) || brand.ownerName || '.'.repeat(24)} )
              </span>
            </div>
            <div>
              <div className="line" />{K.payer}
              <br />
              <span style={{ fontSize: 11 }}>
                ( {(doc.kind === 'QT' ? doc.approver : '') || doc.partyName || '.'.repeat(24)} )
              </span>
            </div>
          </div>

          <div style={{ fontSize: 10.5, marginTop: 10, color: '#555' }}>
            {doc.parent
              ? `เอกสารนี้ออกต่อจากเอกสารเลขที่ ${doc.parent.docNo}`
              : 'เอกสารนี้ออกโดยไม่ได้อ้างอิงเอกสารก่อนหน้า'}
            {isInvoice(doc.kind) ? ' · กรุณาชำระเงินภายในวันครบกำหนด' : ''}
          </div>

          <div className="brandfoot">
            <span>จัดทำด้วยโปรแกรม DriveGoLight!</span>
            <span>www.drivebizbegin.com</span>
          </div>
            </>
          ) : (
            <div style={{ fontSize: 10.5, marginTop: 10, color: '#555', textAlign: 'right' }}>ต่อหน้าถัดไป →</div>
          )}
        </div>
        ))}
      </div>
    </>
  );
}
