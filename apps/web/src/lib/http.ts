/**
 * รีไดเรกต์แบบไม่ผูกโฮสต์
 *
 * `NextResponse.redirect(new URL('/login', request.url))` ใช้ได้บนเครื่องพัฒนา
 * แต่บน Render แอปอยู่หลัง proxy — `request.url` เป็นที่อยู่ภายใน (`https://localhost:10000/...`)
 * ผู้ใช้กดออกจากระบบแล้วเบราว์เซอร์เด้งไปที่นั่น (ผู้ใช้แจ้ง 16 ก.ย. 2569)
 *
 * เดาโฮสต์จาก `x-forwarded-host` ก็ทำได้ แต่เป็นค่าที่ผู้ส่งปลอมได้และต้องเชื่อ proxy
 * ทางที่ง่ายและถูกต้องกว่าคือ **ไม่ใส่โฮสต์เลย** — Location แบบ path ล้วนถูกต้องตาม HTTP
 * เบราว์เซอร์ต่อกับโฮสต์ที่ผู้ใช้เปิดอยู่เอง
 */
export function seeOther(path: string): Response {
  /* กัน `//host` ที่เบราว์เซอร์อ่านเป็นโดเมนอื่น และกันการเผลอส่ง URL เต็มเข้ามา */
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`seeOther รับเฉพาะ path ภายในเว็บ — ได้ ${path}`);
  }
  return new Response(null, { status: 303, headers: { location: path } });
}
