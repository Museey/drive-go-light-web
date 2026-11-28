import Link from 'next/link';
import { VENDOR } from '@/lib/vendor';

/**
 * ส่วนหัว ท้าย และฟอนต์ของหน้าแนะนำระบบ — ใช้ร่วมกันโดยหน้าแรก (/ และ /welcome) และ /signup
 * ถอดจากหน้าที่ใช้งานจริง (welcome.html ที่ผู้ใช้ส่งมา 27 พ.ย. 2569)
 */

/**
 * ฟอนต์ของหน้าแนะนำระบบ — โหลดตอนเปิดหน้า ไม่ใช่ตอน build
 * ไม่ใช้ next/font เพราะต้องโหลดไฟล์ฟอนต์ตอน build ถ้าเครื่องที่ build ต่อ Google ไม่ได้ทั้งแอปจะ build ไม่ผ่าน
 * โหลดไม่สำเร็จก็ตกไปใช้ฟอนต์สำรองใน --lp-display / --lp-body (landing.css)
 */
export function LandingFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Prompt:wght@600;700&display=swap"
      />
    </>
  );
}

function Wordmark() {
  return <span className="lp-wordmark">DriveGo<em>Light!</em></span>;
}

/**
 * แถบบนสุด
 * `base` = หน้าที่หัวข้อ (#features ฯลฯ) อยู่ — หน้าแรกส่งค่าว่าง หน้าอื่นส่ง "/welcome" ให้ลิงก์พากลับไปหัวข้อนั้น
 * `current` = หน้าที่กำลังเปิด ใช้บอกโปรแกรมอ่านหน้าจอว่าอยู่หน้าไหน
 */
export function LandingTop({ base = '', current }: { base?: string; current?: 'signup' }) {
  return (
    <header className="lp-top">
      <div className="lp-top-in">
        <Link className="lp-brand" href="/welcome" aria-label="DriveGoLight! หน้าแนะนำระบบ">
          <Wordmark />
          <small>ระบบบริหารงานอู่ซ่อมรถยนต์</small>
        </Link>
        <nav className="lp-topnav" aria-label="หัวข้อของหน้าแนะนำระบบ">
          <a href={`${base}#features`}>ความสามารถ</a>
          <a href={`${base}#thai`}>ภาษีและเอกสารแบบไทย</a>
          <a href={`${base}#start`}>ทำมาสำหรับอู่ที่เริ่มใช้ระบบ</a>
        </nav>
        <Link className="lp-toplink" href="/signup" aria-label="สมัครใช้บริการ"
              aria-current={current === 'signup' ? 'page' : undefined}>
          สมัคร<span className="lp-wide">ใช้บริการ</span>
        </Link>
        <Link className="btn lp-btn lp-btn-go lp-login" href="/login">เข้าสู่ระบบ</Link>
      </div>
    </header>
  );
}

export function LandingFoot() {
  return (
    <footer className="lp-foot">
      <div className="lp-in">
        <div className="lp-foot-grid">
          <div>
            <Wordmark />
            <p>ระบบบริหารงานอู่ซ่อมรถยนต์ ใช้ผ่านเบราว์เซอร์ได้ทุกเครื่อง</p>
          </div>
          <div>
            <b>ผู้ให้บริการ</b>
            <p>{VENDOR.name}<br />{VENDOR.addr}</p>
          </div>
          <div>
            <b>ติดต่อ</b>
            <p>
              โทร <a href={VENDOR.telHref}>{VENDOR.tel}</a><br />
              <a href={VENDOR.line} target="_blank" rel="noreferrer noopener">LINE ทางการ</a><br />
              <a href={`https://${VENDOR.site}`} target="_blank" rel="noreferrer noopener">{VENDOR.site}</a>
            </p>
          </div>
          <div>
            <b>ลิงก์</b>
            <p>
              <Link href="/signup">สมัครใช้บริการ</Link><br />
              <Link href="/login">เข้าสู่ระบบ</Link><br />
              <Link href="/privacy">นโยบายข้อมูลส่วนบุคคล</Link>
            </p>
          </div>
        </div>
        <p className="lp-copy">© {VENDOR.name}</p>
      </div>
    </footer>
  );
}
