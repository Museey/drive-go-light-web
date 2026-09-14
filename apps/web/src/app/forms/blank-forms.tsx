import { IntakeForm } from './intake-form';
import type { ReactNode } from 'react';

/**
 * แบบฟอร์มเปล่าสำหรับพิมพ์ไปเขียนมือ
 *
 * อู่หลายที่ยังรับรถหน้าร้านด้วยกระดาษก่อน แล้วค่อยมาคีย์เข้าระบบตอนเย็น
 * ฟอร์มพวกนี้ให้พิมพ์เก็บไว้เป็นปึกไว้ที่เคาน์เตอร์ ตรงกับที่โปรแกรมเดิมมี
 */

const Wl = ({ w }: { w?: number | string }) => (
  <span className="dotted" style={{ display: 'inline-block', minWidth: w ?? 60, flex: w ? undefined : 1 }}>
    &nbsp;
  </span>
);

const Tick = () => <span className="tick">&nbsp;</span>;

const Box = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="box"><h4>{title}</h4>{children}</div>
);

function BlankRows({ count, cols }: { count: number; cols: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td className="blank" style={{ textAlign: 'center' }}>{i + 1}</td>
          {Array.from({ length: cols - 1 }).map((__, j) => <td key={j} />)}
        </tr>
      ))}
    </>
  );
}

function Head({ shop, title, en, rows }: {
  shop: { name: string; addrText: string; tel: string; tel2: string; taxId: string };
  title: string;
  en: string;
  rows: string[];
}) {
  return (
    <div className="doc-head">
      <div className="co">
        <b>{shop.name}</b>
        <div>{shop.addrText}</div>
        <div>
          โทร. {shop.tel}{shop.tel2 ? ` / ${shop.tel2}` : ''}
          {shop.taxId ? ` · เลขประจำตัวผู้เสียภาษี ${shop.taxId}` : ''}
        </div>
      </div>
      <div className="doc-meta">
        <h1>{title}</h1>
        <div style={{ fontSize: 11, letterSpacing: '.08em' }}>{en}</div>
        <table style={{ marginTop: 4 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r}><td>{r}</td><td style={{ width: 108 }}><Wl /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CustomerBox = () => (
  <Box title="ข้อมูลลูกค้า">
    <div className="kv">
      <b>ประเภท:</b><span style={{ borderBottom: 0, flex: 'none' }}><Tick /> บุคคลธรรมดา &nbsp;<Tick /> นิติบุคคล</span>
      <b>เลขประจำตัวผู้เสียภาษี:</b><Wl w={150} />
    </div>
    <div className="kv"><b>ชื่อ:</b><Wl /><b>โทร:</b><Wl w={120} /></div>
    <div className="kv"><b>ที่อยู่:</b><Wl /></div>
  </Box>
);

const VehicleBox = () => (
  <Box title="รายละเอียดรถยนต์">
    <div className="kv"><b>ยี่ห้อ:</b><Wl w={110} /><b>รุ่น:</b><Wl /><b>สี:</b><Wl w={80} /></div>
    <div className="kv">
      <b>ทะเบียน:</b><Wl w={120} /><b>จังหวัด:</b><Wl w={110} />
      <b>ปี:</b><Wl w={60} /><b>เลขไมล์:</b><Wl w={80} />
    </div>
    <div className="kv"><b>เลขเครื่องยนต์:</b><Wl w={150} /><b>เลขตัวถัง:</b><Wl w={190} /></div>
  </Box>
);

const SumTable = ({ wht }: { wht?: boolean }) => (
  <table className="doc" style={{ width: '46%', marginTop: 0 }}>
    <tbody>
      <tr><td>รวมเป็นเงิน</td><td style={{ width: 96 }}>&nbsp;</td></tr>
      <tr><td>ส่วนลด</td><td>&nbsp;</td></tr>
      <tr><td>มูลค่าก่อนภาษี</td><td>&nbsp;</td></tr>
      <tr><td>ภาษีมูลค่าเพิ่ม ......%</td><td>&nbsp;</td></tr>
      <tr><td><b>รวมทั้งสิ้น</b></td><td>&nbsp;</td></tr>
      {wht ? <tr><td>หัก ณ ที่จ่าย ......%</td><td>&nbsp;</td></tr> : null}
      <tr><td style={{ background: '#EDEFF1' }}><b>ยอดสุทธิ</b></td><td style={{ background: '#EDEFF1' }}>&nbsp;</td></tr>
    </tbody>
  </table>
);

const Sign = ({ a, b, c }: { a: string; b: string; c?: string }) => (
  <div className="sign">
    {[a, b, ...(c ? [c] : [])].map((label) => (
      <div key={label}>
        <div className="line" />{label}
        <br /><span style={{ fontSize: 11 }}>( ................................................ )</span>
        <br /><span style={{ fontSize: 11 }}>วันที่ ......../......../........</span>
      </div>
    ))}
  </div>
);

const Foot = () => (
  <div className="brandfoot">
    <span>แบบฟอร์มจากโปรแกรม DriveGoLight!</span>
    <span>www.drivebizbegin.com</span>
  </div>
);

export type FormKind = 'intake' | 'quote' | 'invoice' | 'receipt' | 'billnote' | 'jobcard' | 'purchase' | 'expense';

export const FORM_LABEL: Record<FormKind, string> = {
  intake: 'ใบรับรถ (ตรวจสภาพ/สั่งงาน)',
  quote: 'ใบเสนอราคา / ใบอนุมัติซ่อม',
  invoice: 'ใบส่งมอบ / ใบกำกับภาษี',
  receipt: 'ใบเสร็จรับเงิน',
  billnote: 'ใบวางบิล',
  jobcard: 'ใบสั่งงานซ่อม (แบบเดิม)',
  purchase: 'ใบบันทึกซื้อสินค้า',
  expense: 'ใบบันทึกค่าใช้จ่าย',
};

/** จำนวนบรรทัดรายการที่เลือกได้ตอนพิมพ์ — ชุดเดียวกับรุ่น 3.6 */
export const FORM_ROWS = [8, 10, 12] as const;
export const DEFAULT_FORM_ROWS = 10;   /* 10 บรรทัดพอดี A4 หนึ่งหน้าพร้อมกล่องยอดและลายเซ็น */

/** จำนวนชุดที่พิมพ์ในครั้งเดียว — พิมพ์เก็บไว้เป็นปึกที่เคาน์เตอร์ */
export const FORM_COPIES = [1, 2, 3, 5, 10] as const;

/** เพดานบรรทัดต่อชนิด — ให้ทั้งใบพอดี A4 แผ่นเดียวเสมอ (เลือกบรรทัดมากกว่านี้ระบบจะตัดให้พอดีกระดาษ) */
const FIT_ROWS: Partial<Record<FormKind, number>> = { quote: 8, invoice: 12, receipt: 9, billnote: 8, purchase: 12, expense: 12, jobcard: 12 };

export function BlankForm({ kind, shop, rows: rowsIn = DEFAULT_FORM_ROWS }: {
  kind: FormKind;
  shop: { name: string; addrText: string; tel: string; tel2: string; taxId: string };
  /** จำนวนบรรทัดว่างในตารางรายการ */
  rows?: number;
}) {
  const rows = Math.min(rowsIn, FIT_ROWS[kind] ?? rowsIn);
  if (kind === 'intake') return <IntakeForm shop={shop} />;
  if (kind === 'quote') {
    return (
      <div className="paper">
        <Head shop={shop} title="ใบเสนอราคา / ใบอนุมัติซ่อม" en="QUOTATION / REPAIR APPROVAL"
              rows={['เลขที่', 'วันที่', 'ยืนราคาถึง']} />
        <CustomerBox />
        <VehicleBox />
        <Box title="ปัญหาที่ลูกค้าแจ้ง">
          {[1, 2, 3].map((i) => <div className="kv" key={i}><b>{i}.</b><Wl /></div>)}
        </Box>
        <Box title="ปัญหาที่อู่ตรวจพบ">
          {[1, 2, 3].map((i) => <div className="kv" key={i}><b>{i}.</b><Wl /></div>)}
        </Box>
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: 34 }}>ลำดับ</th><th style={{ width: 90 }}>รหัสสินค้า</th>
              <th>รายการอะไหล่ / ค่าแรง</th>
              <th style={{ width: 46 }}>จำนวน</th><th style={{ width: 44 }}>หน่วย</th>
              <th style={{ width: 74 }}>ราคา/หน่วย</th><th style={{ width: 82 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody><BlankRows count={rows} cols={7} /></tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <div className="box" style={{ flex: 1, marginTop: 0 }}>
            <h4>หมายเหตุ</h4>
            <ol style={{ fontSize: 10.5, margin: '6px 0 0', paddingLeft: 15, lineHeight: 1.5 }}>
              <li>เจ้าของรถ / ผู้อนุมัติซ่อม รับทราบรายการและค่าใช้จ่ายตามใบนี้แล้ว</li>
              <li>เป็นการเสนอตามอาการที่วิเคราะห์ได้ครั้งแรก หากพบความเสียหายเพิ่มเติมระหว่างซ่อม
                  อู่จะแจ้งให้ทราบก่อนดำเนินการทุกครั้ง</li>
            </ol>
          </div>
          <SumTable />
        </div>
        <Sign a="ผู้เสนอซ่อม" b="ผู้อนุมัติซ่อม" />
        <Foot />
      </div>
    );
  }

  /* ใบส่งมอบ/ใบกำกับภาษี — โครงเดียวกับเอกสารจริง: ลูกค้า|เอกสาร · รถ · รายการ · ยอด · ลายเซ็น (ผู้ใช้กำหนด) */
  if (kind === 'invoice') {
    return (
      <div className="paper">
        <Head shop={shop} title="ใบส่งมอบ / ใบกำกับภาษี" en="DELIVERY NOTE / TAX INVOICE" rows={['เลขที่', 'วันที่', 'อ้างอิงใบเสนอราคา', 'ครบกำหนดชำระ']} />
        <CustomerBox />
        <VehicleBox />
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: 34 }}>ลำดับ</th><th style={{ width: 92 }}>รหัสสินค้า</th><th>รายการ</th>
              <th style={{ width: 50 }}>จำนวน</th><th style={{ width: 44 }}>หน่วย</th><th style={{ width: 78 }}>ราคา/หน่วย</th>
              <th style={{ width: 88 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody><BlankRows count={rows} cols={7} /></tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <div className="box" style={{ flex: 1, marginTop: 0 }}>
            <h4>เงื่อนไขการชำระเงิน</h4>
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              <div><Tick /> เงินสด &nbsp;&nbsp;<Tick /> เครดิต <Wl w={50} /> วัน ครบกำหนด <Wl w={110} /></div>
              <div><b>ชำระเงินโอนเข้าบัญชี:</b> ธนาคาร <Wl w={90} /> เลขที่บัญชี <Wl w={130} /></div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, borderTop: '1px dotted #999', paddingTop: 4 }}>จำนวนเงิน (ตัวอักษร) <Wl /></div>
          </div>
          <SumTable />
        </div>
        <Box title="หมายเหตุ"><div className="kv"><Wl /></div></Box>
        <Sign a="ผู้รับสินค้า" b="ผู้ส่งมอบงาน" c="ผู้มีอำนาจลงนาม" />
        <Foot />
      </div>
    );
  }

  /* ใบวางบิล — รายการเป็นเลขที่ใบส่งมอบที่รวมวางบิล */
  if (kind === 'billnote') {
    return (
      <div className="paper">
        <Head shop={shop} title="ใบวางบิล" en="BILLING NOTE" rows={['เลขที่', 'วันที่', 'กำหนดชำระภายใน']} />
        <Box title="ลูกค้า">
          <div className="kv"><b>ชื่อ:</b><Wl /></div>
          <div className="kv"><b>ที่อยู่:</b><Wl /></div>
          <div className="kv"><b>เลขประจำตัวผู้เสียภาษี:</b><Wl w={150} /><b>โทร:</b><Wl w={110} /></div>
        </Box>
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: 34 }}>ลำดับ</th><th>เลขที่ใบส่งมอบ / ใบกำกับภาษี</th>
              <th style={{ width: 100 }}>วันที่</th><th style={{ width: 100 }}>ครบกำหนด</th><th style={{ width: 100 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody><BlankRows count={Math.max(6, Math.min(rows, 12))} cols={5} /></tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <div className="box" style={{ flex: 1, marginTop: 0 }}>
            <h4>กำหนดชำระ</h4>
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              <div>ภายในวันที่ <Wl w={120} /> โดย <Tick /> เงินสด &nbsp;<Tick /> โอนเข้าบัญชี &nbsp;<Tick /> เช็ค</div>
              <div><b>บัญชี:</b> ธนาคาร <Wl w={90} /> เลขที่บัญชี <Wl w={130} /> ชื่อบัญชี <Wl w={120} /></div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, borderTop: '1px dotted #999', paddingTop: 4 }}>จำนวนเงิน (ตัวอักษร) <Wl /></div>
          </div>
          <table className="sum" style={{ width: 240, fontSize: 12.5 }}>
            <tbody>
              <tr><td>รวมยอดที่วางบิล</td><td style={{ textAlign: 'right' }}><Wl w={100} /></td></tr>
              <tr><td><b>ยอดที่ต้องชำระ</b></td><td style={{ textAlign: 'right' }}><Wl w={100} /></td></tr>
            </tbody>
          </table>
        </div>
        <Sign a="ผู้วางบิล" b="ผู้รับวางบิล" c="ผู้มีอำนาจลงนาม" />
        <Foot />
      </div>
    );
  }

  if (kind === 'receipt') {
    return (
      <div className="paper">
        <Head shop={shop} title="ใบเสร็จรับเงิน" en="RECEIPT" rows={['เลขที่', 'วันที่', 'อ้างอิง']} />
        <Box title="ได้รับเงินจาก">
          <div className="kv">
            <b>ชื่อ:</b><Wl />
            <b>ประเภท:</b><span style={{ borderBottom: 0, flex: 'none' }}><Tick /> บุคคลธรรมดา &nbsp;<Tick /> นิติบุคคล</span>
          </div>
          <div className="kv"><b>ที่อยู่:</b><Wl /></div>
          <div className="kv"><b>เลขประจำตัวผู้เสียภาษี:</b><Wl w={150} /><b>โทร:</b><Wl w={110} /></div>
          <div className="kv"><b>รถยนต์:</b><Wl /><b>ทะเบียน:</b><Wl w={110} /><b>เลขไมล์:</b><Wl w={80} /></div>
        </Box>
        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: 34 }}>ลำดับ</th><th style={{ width: 92 }}>รหัสสินค้า</th><th>รายการ</th>
              <th style={{ width: 50 }}>จำนวน</th><th style={{ width: 78 }}>ราคา/หน่วย</th>
              <th style={{ width: 88 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody><BlankRows count={rows} cols={6} /></tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <div className="box" style={{ flex: 1, marginTop: 0 }}>
            <h4>วิธีการชำระเงิน</h4>
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <span><Tick /> เงินสด <Wl w={80} /> บาท</span>
                <span><Tick /> เงินโอน <Wl w={80} /> บาท <Wl w={90} /></span>
              </div>
              <div><Tick /> บัตรเครดิต <Wl w={80} /> บาท <Wl w={140} /></div>
              <div><Tick /> เครดิต <Wl w={50} /> วัน ครบกำหนด <Wl w={110} /></div>
              <div style={{ borderTop: '1px dotted #999', marginTop: 3, paddingTop: 3 }}>
                รับชำระวันนี้ <Wl w={90} /> บาท คงเหลือ <Wl w={90} /> บาท
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, borderTop: '1px dotted #999', paddingTop: 4 }}>
              จำนวนเงิน (ตัวอักษร) <Wl />
            </div>
            {/* แบบฟอร์มเปล่าใช้ตอนระบบล่มหรือออกนอกสถานที่ ต้องมีที่ให้เขียนเลขบัญชี
                เหมือนที่ bankLine() ของรุ่น 6.4 ทำ */}
            <div style={{ marginTop: 4, fontSize: 11.5 }}>
              <b>ชำระเงินโอนเข้าบัญชี:</b> ธนาคาร <Wl w={90} /> เลขที่บัญชี <Wl w={130} />
              {' '}ชื่อบัญชี <Wl w={130} />
            </div>
          </div>
          <SumTable wht />
        </div>
        <Box title="เงื่อนไขการรับประกัน">
          <div className="kv"><Wl /></div>
          <div className="kv"><Wl /></div>
        </Box>
        <Sign a="ผู้รับเงิน" b="ผู้จ่ายเงิน / ผู้รับรถ" />
        <Foot />
      </div>
    );
  }

  if (kind === 'jobcard') {
    return (
      <div className="paper">
        <Head shop={shop} title="ใบรับรถ / ใบสั่งงานซ่อม" en="JOB CARD"
              rows={['เลขที่', 'วันที่รับรถ', 'กำหนดเสร็จ']} />
        <CustomerBox />
        <VehicleBox />
        <Box title="อาการที่ลูกค้าแจ้ง">
          {[1, 2, 3, 4].map((i) => <div className="kv" key={i}><b>{i}.</b><Wl /></div>)}
        </Box>
        <Box title="สิ่งที่ตรวจพบและงานที่ต้องทำ">
          {[1, 2, 3, 4, 5, 6].map((i) => <div className="kv" key={i}><b>{i}.</b><Wl /></div>)}
        </Box>
        <Box title="ของที่ติดมากับรถ">
          <div className="kv" style={{ flexWrap: 'wrap', gap: 14 }}>
            <span style={{ borderBottom: 0, flex: 'none' }}><Tick /> ยางอะไหล่</span>
            <span style={{ borderBottom: 0, flex: 'none' }}><Tick /> แม่แรง</span>
            <span style={{ borderBottom: 0, flex: 'none' }}><Tick /> เครื่องมือประจำรถ</span>
            <span style={{ borderBottom: 0, flex: 'none' }}><Tick /> วิทยุ / จอ</span>
            <span style={{ borderBottom: 0, flex: 'none' }}><Tick /> กล้องติดรถ</span>
            <b>อื่น ๆ:</b><Wl />
          </div>
          <div className="kv"><b>ระดับน้ำมันเชื้อเพลิง:</b><Wl w={110} /><b>สภาพตัวถังที่พบ:</b><Wl /></div>
        </Box>
        <Sign a="ผู้รับรถ (พนักงานอู่)" b="ผู้ส่งรถ (ลูกค้า)" />
        <Foot />
      </div>
    );
  }

  const isPurchase = kind === 'purchase';
  return (
    <div className="paper">
      <Head shop={shop}
            title={isPurchase ? 'ใบบันทึกซื้อสินค้า' : 'ใบบันทึกค่าใช้จ่าย'}
            en={isPurchase ? 'PURCHASE RECORD' : 'EXPENSE RECORD'}
            rows={['เลขที่', 'วันที่', 'ใบกำกับผู้ขาย']} />
      <Box title={isPurchase ? 'ซื้อจาก' : 'จ่ายให้'}>
        <div className="kv"><b>ชื่อ:</b><Wl /><b>เลขประจำตัวผู้เสียภาษี:</b><Wl w={150} /></div>
        <div className="kv"><b>ที่อยู่:</b><Wl /></div>
        <div className="kv"><b>โทร:</b><Wl w={120} /><b>เครดิต:</b><Wl w={60} /> วัน</div>
      </Box>
      {!isPurchase ? (
        <Box title="หมวดค่าใช้จ่าย">
          <div className="kv" style={{ flexWrap: 'wrap', gap: 14 }}>
            {['ค่าเช่า', 'ค่าน้ำค่าไฟ', 'เงินเดือนพนักงาน', 'ค่าโทรศัพท์ / อินเทอร์เน็ต',
              'ซื้อสินทรัพย์', 'ค่าใช้จ่ายอื่น ๆ'].map((c) => (
              <span key={c} style={{ borderBottom: 0, flex: 'none' }}><Tick /> {c}</span>
            ))}
          </div>
        </Box>
      ) : null}
      <table className="doc">
        <thead>
          <tr>
            <th style={{ width: 34 }}>ลำดับ</th>
            {isPurchase ? <th style={{ width: 92 }}>รหัสสินค้า</th> : null}
            <th>รายการ</th>
            <th style={{ width: 50 }}>จำนวน</th><th style={{ width: 44 }}>หน่วย</th>
            <th style={{ width: 78 }}>ราคา/หน่วย</th><th style={{ width: 88 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody><BlankRows count={rows} cols={isPurchase ? 7 : 6} /></tbody>
      </table>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <div className="box" style={{ flex: 1, marginTop: 0 }}>
          <h4>การจ่ายเงิน</h4>
          <div style={{ fontSize: 12, lineHeight: 2 }}>
            <div><Tick /> จ่ายแล้ว &nbsp; <Tick /> ยังไม่จ่าย (ตั้งเป็นเจ้าหนี้)</div>
            <div><Tick /> เงินสด &nbsp; <Tick /> เงินโอน &nbsp; <Tick /> เช็ค &nbsp; เลขที่ <Wl w={120} /></div>
            <div>วันที่จ่าย <Wl w={110} /> ครบกำหนด <Wl w={110} /></div>
          </div>
        </div>
        <SumTable wht={!isPurchase} />
      </div>
      <Sign a="ผู้บันทึก" b="ผู้อนุมัติ" />
      <Foot />
    </div>
  );
}
