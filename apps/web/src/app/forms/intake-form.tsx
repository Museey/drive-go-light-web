/**
 * ใบรับรถ (แบบฟอร์มเปล่า เขียนมือ) — ออกแบบตามใบรับรถของศูนย์บริการทั่วไป
 * เขียนใหม่ทั้งหมดในชื่อร้านของอู่ ไม่มีชื่อ/ตราของศูนย์ใด · คำว่า "บริษัท" ใช้ "ผู้ให้บริการ"
 * บริการอื่นๆ เปลี่ยนเป็น "ระบบแอร์" (ล้างแผงแอร์ ตรวจสอบระบบ เปลี่ยนแผ่นกรองแอร์ ฟลัชชิ่งระบบ แอร์ไม่เย็น อื่นๆ)
 * มุมขวาบน = วัน…เดือน…ปี… · ไม่มีข้อความลายมือ
 * พิมพ์ A4 หนึ่งหน้า ตัวอักษรเล็กแต่ยังอ่านออก (11–12px) เพื่อให้ครบทุกส่วนในแผ่นเดียว
 */
import type { ShopInfo } from '@/lib/queries';

const Box = ({ w = 22, n = 1 }: { w?: number; n?: number }) => (
  <>{Array.from({ length: n }, (_, i) => <span key={i} className="fbox" style={{ width: w }} />)}</>
);
const Line = ({ flex = 1, w }: { flex?: number; w?: number }) => <span className="fline" style={w ? { width: w, flex: 'none' } : { flex }} />;
const Chk = ({ label, tail }: { label: string; tail?: React.ReactNode }) => (
  <div className="fchk"><span className="cb" /><span>{label}</span>{tail ?? null}</div>
);
const Sig = ({ a = 'ผู้ปฏิบัติงาน', b = 'ผู้ตรวจสอบ' }: { a?: string; b?: string }) => (
  <div className="fsig"><span className="tag">{a}</span><Line /><span className="tag">{b}</span><Line /></div>
);

/* ผังรถ 5 มุม (หน้า · หลังคา · หลัง / ด้านซ้าย · ด้านขวา) + ช่องสภาพปกติ/ไม่ปกติ — เส้นเดียว วาดใหม่ทั้งหมด */
function CarViews() {
  const st = { fill: 'none', stroke: '#000', strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const thin = { ...st, strokeWidth: 1.1 };
  const Front = () => (<g {...st}><path d="M14 58 v-14 l6 -18 h44 l6 18 v14 z" /><path d="M20 44 l5 -14 h34 l5 14 z" {...thin} /><rect x="18" y="47" width="12" height="7" rx="2" /><rect x="54" y="47" width="12" height="7" rx="2" /><path d="M32 58 h20" /><path d="M16 58 v6 h8 v-6 M60 58 v6 h8 v-6" /></g>);
  const Rear = () => (<g {...st}><path d="M14 58 v-14 l6 -18 h44 l6 18 v14 z" /><path d="M21 44 l4 -14 h34 l4 14 z" {...thin} /><rect x="17" y="47" width="9" height="8" rx="1.5" /><rect x="58" y="47" width="9" height="8" rx="1.5" /><rect x="34" y="49" width="16" height="6" rx="1" /><path d="M16 58 v6 h8 v-6 M60 58 v6 h8 v-6" /></g>);
  const Top = () => (<g {...st}><rect x="26" y="6" width="34" height="62" rx="12" /><path d="M30 24 q13 -8 26 0 M30 50 q13 8 26 0" {...thin} /><rect x="31" y="26" width="24" height="24" rx="3" {...thin} /><path d="M26 30 h-4 v10 h4 M60 30 h4 v10 h-4 M26 52 h-4 v10 h4 M60 52 h4 v10 h-4" {...thin} /></g>);
  const Side = ({ flip }: { flip?: boolean }) => (
    <g {...st} transform={flip ? 'translate(136,0) scale(-1,1)' : undefined}><path d="M8 52 v-10 l10 -6 l14 -16 h44 l24 16 l20 6 v10 z" /><path d="M34 36 l10 -13 h20 v13 z M66 23 h12 l16 13 h-28 z" {...thin} /><circle cx="34" cy="53" r="9" /><circle cx="34" cy="53" r="3.5" {...thin} /><circle cx="106" cy="53" r="9" /><circle cx="106" cy="53" r="3.5" {...thin} /><path d="M8 52 h17 M43 52 h54 M115 52 h13" /><path d="M56 40 h8" {...thin} /></g>
  );
  return (
    <svg viewBox="0 0 400 150" width="100%" preserveAspectRatio="xMidYMid meet" aria-label="ผังตรวจสภาพรถภายนอก 5 มุม">
      <g><Front /></g><text x="42" y="76" fontSize="8" textAnchor="middle">ด้านหน้า</text>
      <g transform="translate(100,0)"><Top /></g><text x="143" y="80" fontSize="8" textAnchor="middle">หลังคา</text>
      <g transform="translate(190,0)"><Rear /></g><text x="232" y="76" fontSize="8" textAnchor="middle">ด้านหลัง</text>
      <g transform="translate(0,84)"><Side /></g><text x="68" y="148" fontSize="8" textAnchor="middle">ด้านซ้าย</text>
      <g transform="translate(140,84)"><Side flip /></g><text x="208" y="148" fontSize="8" textAnchor="middle">ด้านขวา</text>
      <text x="292" y="22" fontSize="10" fontWeight="700">ตรวจเช็คสภาพ</text><text x="292" y="36" fontSize="10" fontWeight="700">ภายนอกรถยนต์</text>
      <rect x="292" y="52" width="13" height="13" {...st} /><text x="311" y="63" fontSize="10">สภาพปกติ</text>
      <rect x="292" y="76" width="13" height="13" {...st} /><text x="311" y="87" fontSize="10">สภาพไม่ปกติ</text>
    </svg>
  );
}

function FuelGauge() {
  const stroke = { fill: 'none', stroke: '#000', strokeWidth: 1.4 } as const;
  return (
    <svg viewBox="0 0 120 70" width="120" height="70" aria-label="ระดับน้ำมันเชื้อเพลิง">
      <path d="M10 60 A50 50 0 0 1 110 60" {...stroke} />
      {[0, 45, 90, 135, 180].map((a) => { const r = (Math.PI * (180 - a)) / 180; const x1 = 60 + 50 * Math.cos(r), y1 = 60 - 50 * Math.sin(r); const x2 = 60 + 42 * Math.cos(r), y2 = 60 - 42 * Math.sin(r); return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} {...stroke} />; })}
      <text x="8" y="70" fontSize="9">E</text><text x="30" y="30" fontSize="8">1/4</text><text x="54" y="16" fontSize="8">1/2</text><text x="80" y="30" fontSize="8">3/4</text><text x="106" y="70" fontSize="9">F</text>
      <circle cx="60" cy="60" r="3" fill="#000" />
    </svg>
  );
}

export function IntakeForm({ shop }: { shop: Pick<ShopInfo, 'name' | 'addrText' | 'tel' | 'tel2' | 'taxId'> }) {
  return (
    <div className="paper intake">
      {/* หัว: ชื่อร้าน | ใบรับรถ | วันเดือนปี */}
      <div className="ihead">
        <div className="co"><b>{shop.name}</b><div>{shop.addrText}</div><div>โทร {shop.tel}{shop.tel2 ? ` / ${shop.tel2}` : ''} · เลขประจำตัวผู้เสียภาษี {shop.taxId || '-'}</div></div>
        <div className="title">ใบรับรถ</div>
        <div className="date">วัน <Box w={28} /> เดือน <Box w={40} /> ปี <Box w={44} /></div>
      </div>

      {/* กรอบบน (ตามภาพ): ซ้าย = ช่องกรอกแบบกล่อง · ขวา = ผังรถ 5 มุม + สภาพปกติ/ไม่ปกติ */}
      <div className="itop">
        <div>
          {/* เส้นบรรทัดแทนกล่อง — สองช่องเวลาแบ่งพื้นที่เท่ากัน · ข้อมูลรถ 5 ช่องแบ่งเท่ากัน ไม่ตัดบรรทัด */}
          <div className="fgrid c2"><span className="fl">เวลาเข้ารับบริการ<Line /> น.</span><span className="fl">นัดรับรถเวลา<Line /> น.</span></div>
          <div className="fgrid c5"><span className="fl">ยี่ห้อรถ<Line /></span><span className="fl">ทะเบียนรถ<Line /></span><span className="fl">รุ่น<Line /></span><span className="fl">สี<Line /></span><span className="fl">เลขไมล์<Line /></span></div>
          <ol className="terms">
            <li>ผู้ให้บริการขอสงวนสิทธิ์ในการรับผิดชอบทรัพย์สินที่เกิดจากการสูญหายหรือไม่ทำงาน หลังจากการตรวจสอบเพื่อตรวจเช็คสภาพ</li>
            <li>กรุณานำสิ่งของทั้งหมดที่มีค่าติดตัวออกจากรถก่อนส่งซ่อม ผู้ให้บริการจะไม่รับผิดชอบ หากสูญหายหรือไม่ครบถ้วนไม่ว่ากรณีใด</li>
            <li>ลูกค้ายินยอมให้พนักงานของผู้ให้บริการขับรถเพื่อเคลื่อนย้ายภายในศูนย์บริการได้</li>
            <li>ก่อนนำรถออกจากศูนย์บริการ กรุณาตรวจสอบสภาพภายนอกรถยนต์ หากพบร่องรอยที่นอกเหนือจากที่ระบุไว้ กรุณาแจ้งพนักงานทันที ผู้ให้บริการจะไม่รับผิดชอบหากลูกค้านำรถออกจากศูนย์บริการแล้ว</li>
            <li>ผู้ให้บริการจะไม่รับผิดชอบต่อความเสียหายที่เกิดจากการซ่อมนอกศูนย์บริการ หรือใช้อะไหล่ที่ไม่ได้ซื้อจากผู้ให้บริการ</li>
            <li>ลูกค้าตกลงยินยอมให้ผู้ให้บริการเก็บและใช้ข้อมูลส่วนบุคคลเพื่อการให้บริการ การตลาด และการแจ้งข่าวสาร</li>
          </ol>
          <div className="frow" style={{ justifyContent: 'flex-end' }}><Line w={160} /> <span>ลูกค้าลงชื่อรับทราบ</span></div>
        </div>
        <div className="icar">
          <CarViews />
          <div className="fuelrow"><span className="lbl">ระดับน้ำมันเชื้อเพลิง</span><FuelGauge /></div>
        </div>
      </div>

      {/* ลูกค้า */}
      <div className="icust">
        <div className="frow">ชื่อลูกค้า <Line /> ที่อยู่เลขที่ <Line w={70} /> หมู่ที่ <Line w={40} /> หมู่บ้าน/อาคาร <Line w={110} /> ซอย <Line w={70} /></div>
        <div className="frow">ถนน <Line w={110} /> แขวง/ตำบล <Line w={110} /> เขต/อำเภอ <Line w={110} /> จังหวัด <Line /></div>
        <div className="frow">รหัสไปรษณีย์ <Line w={70} /> โทรศัพท์บ้าน <Line w={110} /> มือถือ <Line w={120} /> E-mail <Line /></div>
      </div>

      {/* สองคอลัมน์งาน */}
      <div className="icols">
        <div>
          <section><h5>ยาง</h5>
            <div className="frow">ขนาดยาง <Line /></div>
            <Chk label="ยี่ห้อ/รุ่น" tail={<><Line /> ราคาต่อเส้น <Line w={60} /> บาท</>} />
            <Chk label="จำนวน" tail={<><Line w={40} /> เส้น Serial Number <Line /></>} />
            <div className="frow"><Chk label="ยางอะไหล่" /><Chk label="มี" /><Chk label="ไม่มี" /><Chk label="ตั้งศูนย์" /><Chk label="ถ่วงล้อ" tail={<><Line w={30} /> ล้อ</>} /></div>
            <div className="frow"><Chk label="สลับยาง" /><Chk label="ปะยาง" tail={<><Line w={30} /> ล้อ</>} /><Chk label="ถอด/ใส่ยาง" tail={<><Line w={30} /> ล้อ</>} /></div>
            <div className="frow"><Chk label="ปอนด์ล้อ 4 ล้อ" /> พนักงานปอนด์ล้อ <Line /></div>
            <Sig />
          </section>
          <section><h5>น้ำมันเครื่อง</h5>
            <div className="frow">ชนิด <Chk label="แกลลอน" /><Chk label="Super Set" /><Chk label="MP" /></div>
            <table className="lub"><thead><tr><th>รายการ</th><th>ชนิด</th><th>จำนวนลิตรที่เติม</th><th>จำนวนเบิกสินค้า G</th><th>L</th></tr></thead>
              <tbody>{['น้ำมันเครื่อง', 'น้ำมันเกียร์', 'น้ำมันเฟืองท้าย', 'Flushing Oil'].map((r) => <tr key={r}><td>{r}</td><td /><td /><td /><td /></tr>)}</tbody></table>
            <Chk label="กรองน้ำมันเครื่อง No." tail={<><Line /> <Chk label="แท้" /><Chk label="Value" /></>} />
            <Chk label="กรองอากาศ No." tail={<><Line /> <Chk label="แท้" /><Chk label="Value" /></>} />
            <Chk label="กรองน้ำมันเชื้อเพลิง No." tail={<Line />} />
            <Chk label="ประเก็น No." tail={<><Line /> <Chk label="ติด Lube Tag พร้อมรายละเอียด" /></>} />
            <Sig />
          </section>
          <section><h5>แบตเตอรี่</h5>
            <div className="frow">ยี่ห้อ <Line /></div>
            <Chk label="รุ่น" tail={<><Line /> ประเภท <Chk label="น้ำกลั่น" /><Chk label="MF" /></>} />
            <Chk label="เลขที่รับประกัน" tail={<Line />} />
            <Sig />
          </section>
          <section><h5>เบรก</h5>
            <div className="frow">ยี่ห้อ <Line /></div>
            <Chk label="ดิสเบรก" tail={<>หน้ารุ่น <Line /> หลังรุ่น <Line /></>} />
            <Chk label="ก้ามเบรก No." tail={<Line />} />
            <Chk label="น้ำมันเบรก : Dot" tail={<><Line w={40} /> จำนวน <Line w={40} /> ลิตร</>} />
            <Chk label="น้ำยาทำความสะอาดเบรก" />
            <Sig />
          </section>
          <section><h5>โช้คอัพ</h5>
            <div className="frow">ยี่ห้อ หน้า <Line /> หลัง <Line /></div>
            <Chk label="โช้คอัพหน้า" tail={<><Line w={30} /> ตัว No. <Line /></>} />
            <Chk label="โช้คอัพหลัง" tail={<><Line w={30} /> ตัว No. <Line /></>} />
            <Sig />
          </section>
        </div>
        <div>
          <section><h5>รายการอื่นๆ</h5>
            <div className="frow"><Chk label="เติมลมไนโตรเจน" tail={<><Line w={30} /> ล้อ</>} /><Chk label="เปลี่ยนลมไนโตรเจน" tail={<><Line w={30} /> ล้อ</>} /></div>
            <Chk label="สติกเกอร์ไนโตรเจน" />
            <Chk label="ใบปัดน้ำฝน" tail={<>ยี่ห้อ <Line /> รุ่น <Line w={60} /> ขนาด <Line w={60} /></>} />
            <Chk label="ล้อแม็กซ์" tail={<>รุ่น <Line /></>} />
            <div className="frow">ขนาด <Line /> จำนวน <Line w={60} /> วง</div>
            <Sig />
          </section>
          <section className="tall"><h5>คำสั่งพิเศษ</h5>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="frow"><Line /></div>)}
          </section>
          <section><h5>ระบบแอร์</h5>
            <Chk label="ล้างแผงแอร์" />
            <Chk label="ตรวจสอบระบบ" />
            <Chk label="เปลี่ยนแผ่นกรองแอร์" />
            <Chk label="ฟลัชชิ่งระบบ" />
            <Chk label="แอร์ไม่เย็น" tail={<Line />} />
            <Chk label="อื่นๆ" tail={<Line />} />
            <div className="frow" style={{ marginTop: 6 }}>ข้อเสนอแนะ <Line /></div>
            {[0, 1].map((i) => <div key={i} className="frow"><Line /></div>)}
            <Sig />
          </section>
          <div className="frow" style={{ marginTop: 8 }}>ลงชื่อลูกค้า <Line /></div>
          <div className="itotal"><span>รวมราคาประเมิน</span><span className="amt" /><span>บาท</span></div>
        </div>
      </div>
      <div className="ifoot">ราคาประเมินเบื้องต้นเท่านั้น อาจมีการเปลี่ยนแปลงได้ แล้วแต่กรณี</div>
    </div>
  );
}
