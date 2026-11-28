import type { CSSProperties } from 'react';
import { VENDOR } from '@/lib/vendor';
import { LandingFoot, LandingFonts, LandingTop } from './landing-chrome';
import { LandingMotion } from './landing-motion';
import './landing.css';

/**
 * หน้าแนะนำระบบสำหรับผู้เข้าชม — โฉมใหม่ (landing redesign 26 พ.ย. 2569)
 *
 * เนื้อหาและโครงของหน้านี้ถอดจากหน้าที่ใช้งานจริง (welcome.html ที่ผู้ใช้ส่งมา 27 พ.ย. 2569)
 * เพราะโค้ดต้นฉบับของโฉมใหม่ไม่ได้มากับงานที่ส่งต่อ — สร้างด้วยสคริปต์แล้วตรวจกับหน้าต้นทางทีละส่วน
 * ส่วนหัวและท้ายหน้าอยู่ที่ landing-chrome.tsx (ใช้ร่วมกับ /signup) · สไตล์อยู่ที่ landing.css
 *
 * หน้าคงที่ ไม่แตะคุกกี้และฐานข้อมูล — เปิดได้แม้ฐานข้อมูลล่ม
 * ค่าที่เปลี่ยนได้อ่านจากที่เดียว: เบอร์โทรและ LINE (VENDOR)
 */
export function Landing() {
  return (
    <div className="lp">
      <LandingFonts />
      <a className="lp-skip" href="#lp-main">ข้ามไปยังเนื้อหา</a>
      <LandingTop />
        <main id="lp-main"><section className="lp-hero"><div className="lp-glow" aria-hidden="true"><i></i><i></i><i></i></div>
        <div className="lp-in"><div className="lp-hero-copy"><h1><span className="ln"><span>งานเอกสารทั้งอู่</span></span><span className="ln"><span>จบในเว็บเดียว</span></span></h1>
        <p className="lp-lead">ตั้งแต่ลูกค้าขับรถเข้ามา จนปิดงานและเก็บเงินครบ — ใบเสนอราคา ใบส่งมอบงาน ใบกำกับภาษี ใบเสร็จ สต๊อกอะไหล่ ลูกหนี้ เจ้าหนี้ และกำไรขาดทุน อยู่ในที่เดียวกัน เปิดจากคอมพิวเตอร์หน้าร้าน แท็บเล็ตหน้าเคาน์เตอร์ หรือมือถือของช่างก็ได้ ข้อมูลตรงกันทุกเครื่อง</p>
        <div className="lp-cta"><a className="btn lp-btn lp-btn-go" href="/signup">สมัครใช้บริการ</a><a className="btn lp-btn lp-btn-ghost" href="/login">เข้าสู่ระบบ</a><a className="btn lp-btn lp-btn-ghost" href="#features">ดูว่าทำอะไรได้บ้าง</a></div>
        <p className="lp-micro">ข้อมูลเป็นของอู่ ส่งออกเก็บไว้เองได้ทุกเมื่อ</p>
        </div>
        <div className="lp-scene"><img src="/garage-lines.svg" alt="" width="1024" height="652" decoding="async"/></div>
        </div>
        </section>
        <div className="lp-in lp-facts-wrap"><ul className="lp-facts"><li><b>8 เมนูงานหลัก</b> ครบตั้งแต่หน้าร้านถึงงบกำไรขาดทุน</li>
        <li><b>ใช้ได้ทุกจอ</b> มือถือ แท็บเล็ต และคอมพิวเตอร์</li>
        <li><b>ไม่ต้องติดตั้ง</b> เปิดผ่านเบราว์เซอร์ได้เลย</li>
        </ul>
        </div>
        <section className="lp-sec lp-flowsec"><div className="lp-in"><h2 data-reveal>เอกสารต่อกันเป็นสาย ไม่ต้องพิมพ์ซ้ำ</h2>
        <p className="lp-sub" data-reveal>ออกใบเสนอราคาไว้ใบเดียว ที่เหลือกดออกต่อจากใบเดิมได้เลย รายการอะไหล่ ค่าแรง และส่วนลดตามไปครบ ระบบจำให้ว่าใบไหนออกต่อไปแล้ว ใบไหนยังค้างอยู่</p>
        <ol className="lp-flow"><li data-reveal style={{ '--i': 1 } as CSSProperties}><span className="n">1</span><b>ใบเสนอราคา</b><span className="d">เสนอราคาค่าซ่อม รอลูกค้าอนุมัติ</span></li>
        <li data-reveal style={{ '--i': 2 } as CSSProperties}><span className="n">2</span><b>ใบส่งมอบงาน / ใบกำกับภาษี</b><span className="d">ส่งรถคืน ตัดสต๊อกอะไหล่ ตั้งลูกหนี้</span></li>
        <li data-reveal style={{ '--i': 3 } as CSSProperties}><span className="n">3</span><b>ใบเสร็จรับเงิน</b><span className="d">รับเงิน ปิดยอดค้าง ทั้งก้อนหรือทยอยจ่าย</span></li>
        <li data-reveal style={{ '--i': 4 } as CSSProperties}><span className="n">4</span><b>ใบวางบิล</b><span className="d">รวมใบค้างของลูกค้าเจ้าเดียวไปวางบิลทีเดียว</span></li>
        </ol>
        <p className="lp-note-line">ยกเลิกใบที่ออกผิดได้โดยไม่ต้องลบทิ้ง สต๊อกและยอดค้างย้อนกลับให้เอง และยังเห็นร่องรอยว่าเคยมีเอกสารใบนั้นอยู่</p>
        </div>
        </section>
        <section className="lp-sec lp-featsec" id="features"><div className="lp-in"><h2 data-reveal>ระบบทำอะไรให้บ้าง</h2>
        <p className="lp-sub" data-reveal>ทุกอย่างในนี้ทำมาจากงานที่อู่ทำอยู่แล้วทุกวัน ไม่ใช่ระบบบัญชีทั่วไปที่ดัดแปลงมาใช้กับอู่</p>
        <div className="lp-cards"><article className="lp-card" data-reveal style={{ '--c': '#5B3FBF', '--i': 0 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="19" cy="17" r="6"/><path d="M8 39c0-6.1 4.9-11 11-11s11 4.9 11 11"/>
            <path d="M32 12.6a6 6 0 0 1 0 10.8"/><path d="M34 28.6c3.6 1.6 6 5.2 6 9.4"/></svg></span><h3>ลูกค้า ผู้ขาย และทะเบียนรถ</h3>
        <p>เก็บลูกค้าและร้านอะไหล่ไว้ที่เดียว พร้อมรถทุกคันของลูกค้าแต่ละราย</p>
        <ul><li>ทะเบียน ยี่ห้อ รุ่น ปี เลขตัวถัง และเลขไมล์ครั้งล่าสุด</li>
        <li>เปิดดูลูกค้าหนึ่งราย เห็นงานที่เคยซ่อมและยอดค้างทั้งหมด</li>
        <li>นำเข้าและส่งออกรายชื่อเป็นไฟล์ CSV ได้</li>
        </ul>
        </article>
        <article className="lp-card" data-reveal style={{ '--c': '#1D7A5F', '--i': 1 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 7h15l9 9v12"/><path d="M27 7v9h9"/><path d="M12 7v34h12"/>
            <path d="M17 20h6M17 26h9"/><circle cx="33" cy="34" r="7"/>
            <path d="M33 30.5v7M35 32h-3a1.6 1.6 0 0 0 0 3.2h2a1.6 1.6 0 0 1 0 3.2h-3" strokeWidth="1.7"/></svg></span><h3>เอกสารรายรับครบชุด</h3>
        <p>ใบเสนอราคา ใบส่งมอบงาน ใบกำกับภาษี ใบเสร็จ ใบวางบิล และขายหน้าร้าน</p>
        <ul><li>ออกใบต่อไปจากใบเดิม ไม่ต้องพิมพ์รายการซ้ำ</li>
        <li>มีทั้งแบบคิดและไม่คิดภาษีมูลค่าเพิ่ม เลือกตามลูกค้าแต่ละราย</li>
        <li>ลูกค้าเดินเข้ามาซื้อของจ่ายสด ออกใบเสร็จหน้าร้านได้ในหน้าเดียว</li>
        </ul>
        </article>
        <article className="lp-card" data-reveal style={{ '--c': '#C25A18', '--i': 2 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9h5l4.6 20.4a3 3 0 0 0 3 2.3h13.7a3 3 0 0 0 3-2.3L39 15H13"/>
            <circle cx="19" cy="39" r="2.7"/><circle cx="34" cy="39" r="2.7"/></svg></span><h3>รายจ่ายและใบซื้อสินค้า</h3>
        <p>ซื้ออะไหล่เข้าร้านและค่าใช้จ่ายของกิจการ บันทึกที่เดียวกัน</p>
        <ul><li>ใบซื้อสินค้ารับของเข้าสต๊อกพร้อมต้นทุนของล็อตนั้น</li>
        <li>ค่าใช้จ่ายแยกเป็นหมวด เอาไปคิดกำไรขาดทุนต่อได้ทันที</li>
        <li>จ่ายครบหรือทยอยจ่ายก็บันทึกได้ ยอดค้างขึ้นหน้าเจ้าหนี้ให้เอง</li>
        </ul>
        </article>
        <article className="lp-card" data-reveal style={{ '--c': '#2E8B3D', '--i': 3 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M24 6 40 14v20L24 42 8 34V14z"/><path d="M8 14l16 8 16-8"/>
            <path d="M24 22v20"/><path d="M16 10l16 8"/></svg></span><h3>สต๊อกอะไหล่ที่ยอดตรงกับของจริง</h3>
        <p>ตัดสต๊อกอัตโนมัติจากเอกสาร และรู้ต้นทุนของทุกชิ้นที่ขายออกไป</p>
        <ul><li>ต้นทุนแบบเข้าก่อนออกก่อน ของที่มีวันหมดอายุตัดล็อตที่ใกล้หมดอายุก่อน</li>
        <li>ใบตรวจนับสต๊อก เดินนับของจริงแล้วปรับยอดให้ตรง</li>
        <li>ใบเคลมทั้งฝั่งลูกค้าและฝั่งผู้ขาย จ่ายของออกโดยไม่ปนกับยอดขาย</li>
        <li>รองรับสินค้าที่เปิดใช้งานได้ถึง 3,000 รายการต่ออู่</li>
        </ul>
        </article>
        <article className="lp-card" data-reveal style={{ '--c': '#1F5FBF', '--i': 0 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 40V8"/><path d="M8 40h32"/>
            <rect x="14" y="27" width="5.4" height="9" rx="1.2" fill="#fff" stroke="none"/>
            <rect x="23" y="21" width="5.4" height="15" rx="1.2" fill="#fff" stroke="none"/>
            <rect x="32" y="14" width="5.4" height="22" rx="1.2" fill="#fff" stroke="none"/>
            <path d="M14 20l9-7 8 5 7-8" strokeWidth="2.3"/><path d="M38 10h-5M38 10v5"/></svg></span><h3>บัญชีและการเงิน</h3>
        <p>รู้ว่าเดือนนี้ขายได้เท่าไร ใครยังไม่จ่าย และเราค้างใครอยู่</p>
        <ul><li>ยอดขายและต้นทุนตามช่วงเวลาที่เลือกเอง</li>
        <li>ลูกหนี้และเจ้าหนี้ แยกตามคู่ค้า เห็นใบที่เลยกำหนดชัด ๆ</li>
        <li>กำไรขาดทุนรายเดือน และสรุปภาษีมูลค่าเพิ่มของแต่ละงวด</li>
        <li>ส่งออกทุกรายงานเป็น CSV เอาเข้าโปรแกรมบัญชีต่อได้</li>
        </ul>
        </article>
        <article className="lp-card" data-reveal style={{ '--c': '#5A6B76', '--i': 1 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.2 12.0 L20.2 7.4 L27.8 7.4 L27.8 12.0 L29.8 12.8 L33.0 9.6 L38.4 15.0 L35.2 18.2 L36.0 20.2 L40.6 20.2 L40.6 27.8 L36.0 27.8 L35.2 29.8 L38.4 33.0 L33.0 38.4 L29.8 35.2 L27.8 36.0 L27.8 40.6 L20.2 40.6 L20.2 36.0 L18.2 35.2 L15.0 38.4 L9.6 33.0 L12.8 29.8 L12.0 27.8 L7.4 27.8 L7.4 20.2 L12.0 20.2 L12.8 18.2 L9.6 15.0 L15.0 9.6 L18.2 12.8 Z" strokeLinejoin="round"/><circle cx="24" cy="24" r="6.4"/></svg></span><h3>พนักงานและสิทธิ์การใช้งาน</h3>
        <p>ให้ช่างและหน้าเคาน์เตอร์เข้าใช้ได้ โดยเห็นเฉพาะส่วนที่เกี่ยวกับงานของเขา</p>
        <ul><li>เจ้าของติ๊กสิทธิ์ได้ถึงระดับแท็บย่อย ไม่ใช่แค่เปิดหรือปิดทั้งเมนู</li>
        <li>ซ่อนต้นทุนจากคนที่ไม่ควรเห็นได้ แม้จะให้เปิดหน้าสินค้าก็ตาม</li>
        <li>เจ้าของตั้งรหัสผ่านให้พนักงานได้เอง ไม่ต้องรอใคร</li>
        </ul>
        </article>
        <article className="lp-card" data-reveal style={{ '--c': '#B4720B', '--i': 2 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 18V7h20v11"/><path d="M10 18h28a4 4 0 0 1 4 4v10h-8v9H14v-9H6V22a4 4 0 0 1 4-4z"/>
            <path d="M20 27h8M20 33h8"/><circle cx="35" cy="24" r="1.6" fill="#fff" stroke="none"/></svg></span><h3>พิมพ์ลงกระดาษได้จริง</h3>
        <p>หน้าตาเอกสารทำตามแบบที่อู่ใช้กันอยู่ ลูกค้าและสรรพากรอ่านแล้วคุ้นตา</p>
        <ul><li>ใส่โลโก้ ที่อยู่ และเลขประจำตัวผู้เสียภาษีของอู่บนหัวเอกสาร</li>
        <li>ฟอร์มเปล่าหกแบบ พิมพ์ออกมาเขียนมือได้ รวมถึงใบรับรถ</li>
        <li>พิมพ์ฉลากบาร์โค้ดติดชั้นวางอะไหล่</li>
        </ul>
        </article>
        <article className="lp-card" data-reveal style={{ '--c': '#1D8A5F', '--i': 3 } as CSSProperties}><span className="ic"><svg viewBox="0 0 48 48" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 12h13l4 5h19v24H6z"/><path d="M6 22h36"/></svg></span><h3>ข้อมูลเป็นของอู่</h3>
        <p>ย้ายเข้าง่าย และถ้าวันหนึ่งอยากย้ายออกก็เอาไปได้ทั้งหมด</p>
        <ul><li>นำไฟล์สำรองจากรุ่นติดตั้งในเครื่อง (รุ่นที่ใช้งานโดยไม่ต้องต่อเน็ต) เข้ามาได้ทั้งก้อน</li>
        <li>ส่งออกไฟล์สำรองรูปแบบเดิมได้ตลอดเวลา ไม่ต้องขออนุญาตใคร</li>
        <li>เอกสารที่ลบหรือยกเลิกไปอยู่ในถังขยะ กู้คืนได้</li>
        </ul>
        </article>
        </div>
        </div>
        </section>
        <section className="lp-sec lp-dark" id="thai"><img className="lp-dark-art" src="/garage-lines.svg" alt="" width="1024" height="652" loading="lazy" decoding="async"/><div className="lp-in"><h2 data-reveal>ทำมาให้ตรงกับงานเอกสารแบบไทย</h2>
        <p className="lp-sub" data-reveal>เรื่องที่โปรแกรมทั่วไปมักไม่ได้ทำมาให้ และเป็นเหตุผลที่อู่ต้องกลับไปพิมพ์เอกสารเองใน Excel</p>
        <div className="lp-thai"><div data-reveal style={{ '--i': 0 } as CSSProperties}><h3>ภาษีมูลค่าเพิ่มและภาษีหัก ณ ที่จ่าย</h3>
        <p>ตั้งอัตราเองได้ทั้งสองตัว คิดทั้งแบบรวมในและแยกนอก สรุปภาษีซื้อภาษีขายให้เป็นรายงวด และแยกยอดที่ลูกค้าหักไว้ตามอัตรา</p>
        </div>
        <div data-reveal style={{ '--i': 1 } as CSSProperties}><h3>วันที่เป็นพุทธศักราช</h3>
        <p>ทั้งระบบใช้ปฏิทินไทย พิมพ์วันที่แบบที่คนไทยเขียนกัน ไม่ต้องคอยบวกลบปีในหัว</p>
        </div>
        <div data-reveal style={{ '--i': 2 } as CSSProperties}><h3>จำนวนเงินเป็นตัวอักษร</h3>
        <p>ใบกำกับภาษีและใบเสร็จเติมบรรทัด &quot;บาทถ้วน&quot; ให้เอง ตรงตามที่เอกสารภาษีต้องมี</p>
        </div>
        <div data-reveal style={{ '--i': 3 } as CSSProperties}><h3>วันที่ไม่เพี้ยนข้ามวัน</h3>
        <p>วันที่และเลขที่เอกสารอิงเวลาประเทศไทย ออกบิลตอนดึกก็ยังได้วันที่ของวันนั้น ไม่กระโดดไปเป็นวันถัดไป</p>
        </div>
        </div>
        </div>
        </section>
        <section className="lp-sec"><div className="lp-in lp-two"><div className="lp-panel" data-reveal><h2>ข้อมูลของอู่ปลอดภัยและกู้คืนได้เสมอ</h2>
        <ul className="lp-ticks"><li>ข้อมูลของแต่ละอู่ถูกกั้นไว้ที่ชั้นฐานข้อมูล ไม่ใช่แค่เงื่อนไขในโค้ด</li>
        <li>รหัสผ่านเก็บแบบเข้ารหัสทางเดียว อ่านกลับเป็นรหัสจริงไม่ได้</li>
        <li>อู่เป็นเจ้าของข้อมูลลูกค้าของตัวเอง เราเป็นเพียงผู้เก็บและประมวลผลให้</li>
        <li>ส่งออกไฟล์สำรองทั้งก้อนได้ตลอดเวลา และเปิดด้วยรุ่นติดตั้งในเครื่องได้</li>
        <li>เอกสารที่ลบหรือยกเลิกไปไม่ได้หายไปไหน อยู่ในถังขยะ กดกู้คืนได้</li>
        </ul>
        <p className="lp-micro"><a href="/privacy">อ่านนโยบายข้อมูลส่วนบุคคล</a></p>
        </div>
        <div className="lp-panel" data-reveal style={{ '--i': 1 } as CSSProperties}><h2>ออกแบบมาให้ใช้ได้จริงหน้างาน</h2>
        <ul className="lp-ticks"><li>บนมือถือแถบเมนูอยู่ด้านล่าง กดด้วยนิ้วโป้งมือเดียวได้</li>
        <li>แท็บเล็ตหน้าเคาน์เตอร์ใช้หน้าตาเดียวกัน ไม่ต้องเรียนใหม่</li>
        <li>บนคอมพิวเตอร์เห็นเมนูครบทั้งหมดพร้อมกันโดยไม่ต้องเลื่อนหา</li>
        <li>เพิ่มลงหน้าจอโฮมของมือถือแล้วเปิดใช้เหมือนแอปได้</li>
        </ul>
        </div>
        </div>
        </section>
        <section className="lp-sec lp-soft" id="start"><div className="lp-in"><h2 data-reveal>เริ่มต้นใช้งานสามขั้น</h2>
        <ol className="lp-steps"><li data-reveal style={{ '--i': 0 } as CSSProperties}><span className="n">01</span><div><b>เปิดบัญชีอู่</b><p>กรอกฟอร์มสมัครใช้บริการ หรือติดต่อเราเพื่อเปิดบัญชีให้อู่ของคุณ แล้วรับลิงก์ตั้งรหัสผ่านทางอีเมลของเจ้าของกิจการ</p>
        </div>
        </li>
        <li data-reveal style={{ '--i': 1 } as CSSProperties}><span className="n">02</span><div><b>ตั้งรหัสผ่านแล้วเข้าใช้ได้เลย</b><p>กดลิงก์ ตั้งรหัสผ่านของตัวเอง ระบบพาเข้าหน้าแรกให้ทันที ไม่ต้องติดตั้งโปรแกรมอะไรเพิ่ม</p>
        </div>
        </li>
        <li data-reveal style={{ '--i': 2 } as CSSProperties}><span className="n">03</span><div><b>ย้ายข้อมูลเดิมเข้ามา</b><p>มีไฟล์สำรองจากรุ่นติดตั้งในเครื่องอยู่แล้วก็นำเข้าได้ทั้งก้อน หรือจะเริ่มจากไฟล์ CSV รายชื่อลูกค้าและสินค้าก็ได้</p>
        </div>
        </li>
        </ol>
        </div>
        </section>
        <section className="lp-sec"><div className="lp-in lp-narrow"><h2 data-reveal>คำถามที่ถามกันบ่อย</h2>
        <div className="lp-faq"><details><summary>ต้องติดตั้งโปรแกรมไหม</summary><p>ไม่ต้อง เปิดผ่านเบราว์เซอร์ได้เลยทั้งคอมพิวเตอร์ แท็บเล็ต และมือถือ บนมือถือกด &quot;เพิ่มลงหน้าจอโฮม&quot; แล้วใช้เหมือนแอปได้</p>
        </details>
        <details><summary>หลายคนใช้พร้อมกันได้ไหม</summary><p>ได้ เจ้าของเพิ่มพนักงานได้เองและกำหนดสิทธิ์ทีละคน หน้าร้าน ช่าง และเจ้าของทำงานคนละเครื่องพร้อมกันบนข้อมูลชุดเดียวกัน</p>
        </details>
        <details><summary>ข้อมูลของอู่อื่นปนกับของเราได้ไหม</summary><p>ไม่ได้ ข้อมูลของแต่ละอู่ถูกกั้นไว้ที่ชั้นฐานข้อมูลโดยตรง ต่อให้โปรแกรมเขียนพลาด ฐานข้อมูลก็ยังไม่ยอมให้ข้ามอู่อยู่ดี</p>
        </details>
        <details><summary>ถ้าอินเทอร์เน็ตที่อู่ไม่ค่อยดี</summary><p>เรายังขายรุ่นติดตั้งในเครื่องที่ทำงานโดยไม่ต้องต่อเน็ตควบคู่กันอยู่ ข้อมูลย้ายไปมาระหว่างสองรุ่นได้ด้วยไฟล์สำรองรูปแบบเดียวกัน ติดต่อเราเพื่อดูว่ารุ่นไหนเหมาะกับอู่ของคุณ</p>
        </details>
        </div>
        </div>
        </section>
        <section className="lp-sec lp-endcta"><div className="lp-in"><div className="lp-end" data-reveal><div className="lp-glow" aria-hidden="true"><i></i><i></i><i></i></div>
        <h2>ให้เราช่วยจัดการงานเอกสารของอู่คุณไหม</h2>
        <p className="lp-sub">ใช้อยู่แล้วกดเข้าสู่ระบบได้เลย ยังไม่มีบัญชีอู่ สมัครใช้บริการออนไลน์ หรือติดต่อเราให้ช่วยเปิดให้</p>
        <div className="lp-cta"><a className="btn lp-btn lp-btn-go" href="/signup">สมัครใช้บริการ</a><a className="btn lp-btn lp-btn-ghost" href="/login">เข้าสู่ระบบ</a><a className="btn lp-btn lp-btn-ghost" href={VENDOR.telHref}>โทร {VENDOR.tel}</a><a className="btn lp-btn lp-btn-ghost" href={VENDOR.line} target="_blank" rel="noreferrer noopener">ทักทาง LINE</a></div>
        </div>
        </div>
        </section>
        </main>
      <LandingFoot />
      <LandingMotion />
    </div>
  );
}
