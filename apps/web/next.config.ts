import type { NextConfig } from 'next';

/**
 * หัวข้อความปลอดภัยของทุกหน้า
 *
 * **ทำไมต้องอยู่ที่นี่ ไม่ใช่ที่ reverse proxy** — deploy/Caddyfile ตั้งไว้ครบอยู่แล้ว
 * แต่ Caddy ใช้เฉพาะตอนติดตั้งบนเครื่องตัวเอง ส่วนเครื่องจริงรันบน Render ซึ่งไม่ได้
 * ผ่าน Caddy เลย หัวพวกนั้นจึงไม่มีผลกับที่ที่อู่ใช้งานจริง (ตรวจความปลอดภัย 24 ก.ย. 2569)
 *
 * ตั้งที่ตัวแอปแล้วได้ผลทุกที่ที่แอปไปรัน ไม่ต้องหวังว่าคนติดตั้งจะตั้ง proxy ให้ถูก
 */
function securityHeaders(isProd: boolean) {
  /**
   * CSP — ทั้งระบบโหลดของจากโดเมนอื่นอยู่ที่เดียว คือฟอนต์ไทยของหน้าแนะนำระบบ
   * (components/landing.tsx) นอกนั้นเป็นของตัวเองหมด จึงรัดได้แน่นกว่าปกติมาก
   *
   * สองโดเมนของ Google ต้องอยู่ในรายการนี้ ไม่งั้น**ฟอนต์ไทยของหน้าแรกพัง** —
   * จับได้ตอนเอาเบราว์เซอร์จริงมาโหลดหน้าเว็บ ไม่ใช่ตอนอ่านโค้ด (24 ก.ย. 2569)
   * ถ้าวันหนึ่งย้ายฟอนต์มาไว้กับตัวเอง ให้ตัดสองบรรทัดนี้ออกได้เลย
   *
   * **ข้อจำกัดที่ต้องรู้: script-src ยังต้องมี 'unsafe-inline'** เพราะ Next App Router
   * ฝังสคริปต์เริ่มต้นไว้ในหน้าโดยตรง การใช้ nonce ต้องมี middleware ซึ่งโปรเจกต์นี้
   * ตั้งใจไม่มี (ด่านตรวจสิทธิ์อยู่ที่หน้าและ action ไม่ใช่ที่ middleware)
   *
   * แปลว่า CSP ชุดนี้ **ไม่ได้กัน XSS แบบฝังสคริปต์ในหน้า** แต่ยังกันของที่มีค่าอยู่:
   * โหลดสคริปต์จากโดเมนอื่นไม่ได้ · ส่งฟอร์มออกนอกเว็บไม่ได้ · ฝัง iframe ไม่ได้ ·
   * เปลี่ยน <base> เพื่อเปลี่ยนปลายทางของลิงก์ทั้งหน้าไม่ได้ · โหลดปลั๊กอินไม่ได้
   * ซึ่งคือเส้นทางที่ข้อมูลรั่วออกนอกจริง ๆ หลังมีช่องโหว่
   */
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    /* ห้ามฝังหน้าเราใน iframe ของเว็บอื่น — ตัวเดียวกับ X-Frame-Options แต่เบราว์เซอร์ใหม่ดูตัวนี้ */
    "frame-ancestors 'none'",
    "frame-src 'none'",
    /* ฟอร์มส่งได้เฉพาะกลับมาที่เรา — กันหน้าที่ถูกแก้ไขส่งข้อมูลลูกค้าออกไปที่อื่น */
    "form-action 'self'",
    /* รูปสินค้ามาจาก /pics (self) · ไอคอนใน CSS เป็น data: · รูปที่เพิ่งเลือกเป็น blob: */
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    /* React เขียน style ลงแอตทริบิวต์โดยตรง จึงต้องยอม inline สำหรับ style เท่านั้น */
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    /* ที่อยู่หน้าของเรามีเลขเอกสารและรหัสอู่อยู่ ไม่ต้องส่งติดไปกับลิงก์ที่ผู้ใช้กดออกไป */
    { key: 'Referrer-Policy', value: 'same-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    /* เฉพาะตอนใช้งานจริง — ตั้งบน http ของเครื่องพัฒนาแล้วเบราว์เซอร์จะจำว่าต้องเป็น
       https ตลอดไป ซึ่งทำให้ localhost เปิดไม่ได้จนกว่าจะไปล้างค่าในเบราว์เซอร์เอง */
    ...(isProd
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
      : []),
  ];
}

const config: NextConfig = {
  // pg เป็นไลบรารีฝั่ง server ล้วน ห้ามให้ bundler แตะ
  serverExternalPackages: ['pg'],
  /* typedRoutes ตรวจลิงก์ที่เขียนตายตัวได้ดี แต่ redirect ที่ประกอบ URL ตอน runtime
     (เช่น /setup/<token>?error=<ข้อความ>) มันตรวจไม่ได้ ต้องใส่ cast ทุกจุดจนอ่านยาก
     เปิดกลับได้เมื่อเส้นทางนิ่งแล้ว */
  typedRoutes: false,
  /* ไม่ต้องบอกใครว่าเบื้องหลังเป็นอะไร (Caddyfile ตัดหัวนี้ให้อยู่แล้ว ตัวนี้ครอบที่เหลือ) */
  poweredByHeader: false,
  experimental: {
    /* ไฟล์สำรองของอู่ที่ใช้มาหลายปีโตได้ถึงหลักสิบเมกะไบต์ ค่าตั้งต้น 1 MB ไม่พอ
       ตัว action เองยังจำกัดที่ 40 MB อีกชั้นและตรวจก่อนอ่านไฟล์ */
    serverActions: { bodySizeLimit: '48mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') }];
  },
};

export default config;
