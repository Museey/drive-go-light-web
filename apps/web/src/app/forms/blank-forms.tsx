import { IntakeForm } from './intake-form';

/**
 * แบบฟอร์มเปล่าสำหรับพิมพ์ไปเขียนมือ — ตามต้นแบบ 14 ก.ย. 2569 22:37 (pageForms)
 *
 * หกแบบ โครงเดียวกับเอกสารจริง: หัวเอกสาร · ลูกค้า|ข้อมูลเอกสาร · รถ · รายการ · ยอด · ลายเซ็นสามช่อง
 * เจ้าของกิจการเลือกให้เหมือนต้นแบบทุกอย่าง (15 ก.ย. 2569) — ใบบันทึกค่าใช้จ่ายแยก ใบสั่งงานซ่อมแบบเดิม
 * และตัวเลือกจำนวนชุดจึงไม่มีแล้ว
 */

type Shop = { name: string; addrText: string; tel: string; tel2: string; taxId: string };

/** เส้นประให้เขียนมือ — ไม่ระบุความกว้าง = ยืดเต็มแถว (ในแถวที่เป็น flex) */
const Wl = ({ w }: { w?: number }) => <span className="wl" style={w ? { width: w, minWidth: 0 } : undefined} />;
const Tick = () => <span className="tick" />;
const Kvw = ({ l, w }: { l: string; w?: number }) => <div className="kv"><b>{l}:</b><Wl w={w} /></div>;
/** แถวที่มีแต่เส้นประ — ต้องเป็น flex ไม่งั้นเส้นยืดไม่ได้ */
const LineRow = ({ label }: { label?: string }) => (
  <div className="kv" style={{ display: 'flex', gap: 6 }}>{label ? <b>{label}</b> : null}<Wl /></div>
);

export type FormKind = 'intake' | 'quote' | 'invoice' | 'receipt' | 'billnote' | 'purchase';

export const FORM_LABEL: Record<FormKind, string> = {
  intake: 'ใบรับรถ (ตรวจสภาพ / สั่งงาน)',
  quote: 'ใบเสนอราคา (เขียนมือ)',
  invoice: 'ใบส่งมอบ / ใบกำกับภาษี (เขียนมือ)',
  receipt: 'ใบเสร็จรับเงิน (เขียนมือ)',
  billnote: 'ใบวางบิล (เขียนมือ)',
  purchase: 'ใบซื้อ / ค่าใช้จ่าย (เขียนมือ)',
};

const TITLE: Record<Exclude<FormKind, 'intake'>, string> = {
  quote: 'ใบเสนอราคา',
  invoice: 'ใบส่งมอบ / ใบกำกับภาษี',
  receipt: 'ใบเสร็จรับเงิน',
  billnote: 'ใบวางบิล',
  purchase: 'ใบซื้อ / ค่าใช้จ่าย',
};

/** บรรทัดว่างในตารางรายการ — ให้ทั้งใบพอดี A4 แผ่นเดียว */
const ROWS: Record<Exclude<FormKind, 'intake'>, number> = { quote: 8, invoice: 12, receipt: 9, billnote: 8, purchase: 12 };

const SIGNS: Record<Exclude<FormKind, 'intake'>, string[]> = {
  quote: ['ผู้เสนอราคา', 'ผู้อนุมัติซ่อม'],
  invoice: ['ผู้รับสินค้า', 'ผู้ส่งมอบงาน', 'ผู้มีอำนาจลงนาม'],
  receipt: ['ผู้รับเงิน', 'ผู้จ่ายเงิน / ผู้รับรถ', 'ผู้มีอำนาจลงนาม'],
  billnote: ['ผู้วางบิล', 'ผู้รับวางบิล', 'ผู้มีอำนาจลงนาม'],
  purchase: ['ผู้รับสินค้า', 'ผู้ขาย', 'ผู้อนุมัติ'],
};

export function BlankForm({ kind, shop }: { kind: FormKind; shop: Shop }) {
  if (kind === 'intake') return <IntakeForm shop={shop} />;

  const blanks = (cols: number) => Array.from({ length: ROWS[kind] }).map((_, i) => (
    <tr key={i}><td className="blank" />{Array.from({ length: cols - 1 }).map((__, j) => <td key={j} />)}</tr>
  ));

  return (
    <div className="paper doc2">
      <div className="doc-head">
        <div className="co">
          <b>{shop.name}</b>
          <div>{shop.addrText}</div>
          <div>โทร {shop.tel} · เลขประจำตัวผู้เสียภาษี {shop.taxId}</div>
        </div>
        <div className="doc-meta">
          <h1>{TITLE[kind]}</h1>
          <div className="docno-big" style={{ borderBottom: '1px dotted #000', minWidth: 150 }}>&nbsp;</div>
        </div>
      </div>

      <div className="box party2">
        <div>
          <h4>{kind === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า'}</h4>
          <Kvw l="ชื่อ" /><Kvw l="ที่อยู่" /><Kvw l="เลขประจำตัวผู้เสียภาษี" /><Kvw l="โทร" />
        </div>
        <div>
          <h4>ข้อมูลเอกสาร</h4>
          {kind === 'quote' ? (
            <><Kvw l="เลขที่" /><Kvw l="วันที่" /><Kvw l="ยืนราคาถึง" /></>
          ) : kind === 'billnote' ? (
            <><Kvw l="เลขที่" /><Kvw l="วันที่" /><Kvw l="กำหนดชำระภายใน" /></>
          ) : (
            <>
              <Kvw l="เลขที่" /><Kvw l="วันที่" /><Kvw l="อ้างอิง" />
              <div className="kv"><b>เงื่อนไขชำระ:</b><span><Tick /> เงินสด <Tick /> เครดิต <Wl w={40} /> วัน</span></div>
              <Kvw l="วันครบกำหนดชำระ" />
            </>
          )}
        </div>
      </div>

      {kind === 'purchase' || kind === 'billnote' ? null : (
        <div className="box veh3">
          <h4>รถยนต์ที่เข้ารับบริการ</h4>
          <div className="g3">
            <Kvw l="ยี่ห้อ / รุ่น" /><Kvw l="ปี / สี" /><Kvw l="ทะเบียน" />
            <Kvw l="เลขไมล์" /><Kvw l="เลขเครื่องยนต์" /><Kvw l="เลขตัวถัง" />
          </div>
        </div>
      )}

      {kind === 'quote' ? (
        <>
          <div className="box"><h4>อาการที่แจ้ง</h4>{[1, 2, 3].map((i) => <LineRow key={i} label={`${i}.`} />)}</div>
          <div className="box"><h4>อาการที่ตรวจพบ</h4>{[1, 2, 3].map((i) => <LineRow key={i} label={`${i}.`} />)}</div>
        </>
      ) : null}

      {kind === 'billnote' ? (
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: 34 }}>ลำดับ</th><th>เลขที่ใบส่งมอบ / ใบกำกับภาษี</th>
              <th style={{ width: 100 }}>วันที่</th><th style={{ width: 100 }}>ครบกำหนด</th><th style={{ width: 100 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {blanks(5)}
            <tr><td colSpan={4} style={{ textAlign: 'right' }}><b>รวมยอดที่วางบิล</b></td><td /></tr>
          </tbody>
        </table>
      ) : (
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: 34 }}>ลำดับ</th><th style={{ width: 92 }}>รหัสสินค้า</th>
              <th>รายการ{kind === 'quote' ? 'อะไหล่ / ค่าแรง' : ''}</th>
              <th style={{ width: 50 }}>จำนวน</th><th style={{ width: 44 }}>หน่วย</th>
              <th style={{ width: 78 }}>ราคา/หน่วย</th><th style={{ width: 88 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>{blanks(7)}</tbody>
        </table>
      )}

      {kind === 'billnote' ? (
        <div className="sumrow">
          <div className="box">
            <h4>กำหนดชำระ</h4>
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              ภายในวันที่ <Wl w={120} /> โดย <Tick /> เงินสด <Tick /> โอนเข้าบัญชี <Tick /> เช็ค
              <br /><b>บัญชี:</b> ธนาคาร <Wl w={90} /> เลขที่บัญชี <Wl w={130} />
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, borderTop: '1px dotted #999', paddingTop: 4 }}>จำนวนเงิน (ตัวอักษร) <Wl /></div>
          </div>
          <table className="sum2">
            <tbody>
              <tr><td>รวมยอดที่วางบิล</td><td><Wl w={100} /></td></tr>
              <tr><td><b>ยอดที่ต้องชำระ</b></td><td><Wl w={100} /></td></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sumrow">
          <div className="box">
            <h4>{kind === 'receipt' ? 'วิธีการชำระเงิน' : kind === 'quote' ? 'หมายเหตุ' : 'เงื่อนไขการชำระเงิน'}</h4>
            {kind === 'receipt' ? (
              <div className="paylines">
                <Tick /> เงินสด <Wl w={70} /> บาท <Tick /> เงินโอน <Wl w={70} /> บาท
                {/* ช่องสั้นกว่าต้นแบบ (70/80px) — ความยาวเดิมเกินกล่องจนบรรทัดนี้ตัดลงบรรทัดใหม่ ใบสูงเกิน A4
                    แล้ว FitToPage ตัดบรรทัดรายการเหลือ 3 บรรทัดบนจอ */}
                <br /><Tick /> บัตรเครดิต <Wl w={56} /> บาท <Tick /> เครดิต <Wl w={30} /> วัน ครบกำหนด <Wl w={64} />
                <br />รับชำระวันนี้ <Wl w={80} /> บาท คงเหลือ <Wl w={80} /> บาท
              </div>
            ) : kind === 'quote' ? (
              <ol style={{ fontSize: 10.5, margin: '6px 0 0', paddingLeft: 15, lineHeight: 1.5 }}>
                <li>เจ้าของรถ / ผู้อนุมัติซ่อม รับทราบรายการและค่าใช้จ่ายตามใบนี้แล้ว</li>
                <li>หากพบความเสียหายเพิ่มเติมระหว่างซ่อม อู่จะแจ้งให้ทราบก่อนดำเนินการทุกครั้ง</li>
              </ol>
            ) : (
              <div style={{ fontSize: 12, lineHeight: 2 }}>
                <Tick /> เงินสด &nbsp;<Tick /> เครดิต <Wl w={40} /> วัน ครบกำหนด <Wl w={100} />
                <br /><b>โอนเข้าบัญชี:</b> ธนาคาร <Wl w={90} /> เลขที่บัญชี <Wl w={130} />
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11.5, borderTop: '1px dotted #999', paddingTop: 4 }}>จำนวนเงิน (ตัวอักษร) <Wl /></div>
          </div>
          <table className="sum2">
            <tbody>
              <tr><td>รวมเป็นเงิน</td><td><Wl w={100} /></td></tr>
              <tr><td>ส่วนลด</td><td><Wl w={100} /></td></tr>
              <tr><td>มูลค่าก่อนภาษี</td><td><Wl w={100} /></td></tr>
              <tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td><Wl w={100} /></td></tr>
              {kind === 'receipt' ? <tr><td>หัก ณ ที่จ่าย</td><td><Wl w={100} /></td></tr> : null}
              <tr><td><b>รวมทั้งสิ้น</b></td><td><Wl w={100} /></td></tr>
            </tbody>
          </table>
        </div>
      )}

      {kind === 'receipt' ? <div className="box"><h4>เงื่อนไขการรับประกัน</h4><LineRow /></div> : null}

      <div className="sign">
        {SIGNS[kind].map((l) => (
          <div key={l}>
            <div className="line" />{l}
            <br /><span style={{ fontSize: 11 }}>( ................................................ )</span>
            <br /><span style={{ fontSize: 11 }}>วันที่ ......../......../........</span>
          </div>
        ))}
      </div>
      <div className="brandfoot"><span>DriveGoLight! · {shop.name}</span><span /></div>
    </div>
  );
}
