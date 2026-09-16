/**
 * รีไดเรกต์หลังออกจากระบบ ต้องไม่พาไปที่อยู่ภายในของเซิร์ฟเวอร์
 *
 * เดิมสอง route ประกอบ URL ด้วย `new URL('/login', request.url)` ซึ่งบนเครื่องพัฒนาถูกต้อง
 * แต่บน Render แอปอยู่หลัง proxy — `request.url` เป็นที่อยู่ภายใน (`https://localhost:10000/...`)
 * ผู้ใช้กดออกจากระบบแล้วเบราว์เซอร์เด้งไป localhost:10000 (ผู้ใช้แจ้ง 16 ก.ย. 2569)
 *
 * ทางที่ปลอดภัยกว่าการเดาโฮสต์จาก header คือ **ไม่ใส่โฮสต์เลย** —
 * Location แบบ path ล้วนถูกต้องตาม HTTP และเบราว์เซอร์ต่อกับโฮสต์ที่ผู้ใช้เปิดอยู่เอง
 */
import { describe, expect, it } from 'vitest';
import { seeOther } from '../src/lib/http';

describe('seeOther — รีไดเรกต์แบบไม่ผูกโฮสต์', () => {
  it('ตอบ 303 และ Location เป็น path ล้วน', () => {
    const res = seeOther('/login');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('ไม่มีชื่อโฮสต์ติดไปกับ Location', () => {
    for (const p of ['/login', '/ops/login']) {
      const at = seeOther(p).headers.get('location') ?? '';
      expect(at.startsWith('/'), at).toBe(true);
      expect(/^https?:\/\//.test(at), at).toBe(false);
    }
  });

  it('รับเฉพาะ path ภายในเว็บ — กันพาออกนอกเว็บ', () => {
    expect(() => seeOther('https://evil.example/login')).toThrow();
    expect(() => seeOther('//evil.example')).toThrow();
  });
});
