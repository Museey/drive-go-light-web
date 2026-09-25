/**
 * หัวข้อความปลอดภัยต้องถูกส่งจริงจากตัวแอป
 *
 * deploy/Caddyfile ตั้งหัวพวกนี้ไว้ครบ แต่ Caddy ใช้เฉพาะตอนติดตั้งบนเครื่องตัวเอง
 * เครื่องจริงรันบน Render ซึ่งไม่ได้ผ่าน Caddy — หัวจึงต้องมาจาก next.config.ts
 * ไม่งั้นที่ที่อู่ใช้งานจริงคือที่ที่ไม่มีหัวเลย (ตรวจความปลอดภัย 24 ก.ย. 2569)
 *
 * ข้อที่ดูเหมือนจุกจิกที่สุดคือสองโดเมนของ Google — หน้าแนะนำระบบโหลดฟอนต์ไทยจากที่นั่น
 * ตัดออกเมื่อไร **ฟอนต์ไทยของหน้าแรกพังทันที** และจะไม่มีใครรู้จนกว่าจะมีคนเปิดดู
 */
import { describe, expect, it } from 'vitest';
import config from '../next.config';

async function headersFor(): Promise<Record<string, string>> {
  const groups = await config.headers!();
  expect(groups).toHaveLength(1);
  expect(groups[0]!.source).toBe('/:path*');
  return Object.fromEntries(groups[0]!.headers.map((h) => [h.key, h.value]));
}

describe('หัวข้อความปลอดภัย', () => {
  it('ครอบทุกเส้นทาง ไม่ใช่เฉพาะบางหน้า', async () => {
    const groups = await config.headers!();
    expect(groups[0]!.source).toBe('/:path*');
  });

  it('มีหัวที่ต้องมีครบ', async () => {
    const h = await headersFor();
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('same-origin');
    expect(h['Content-Security-Policy']).toBeTruthy();
    expect(h['Permissions-Policy']).toContain('camera=()');
  });

  it('ไม่บอกว่าเบื้องหลังเป็นอะไร', () => {
    expect(config.poweredByHeader).toBe(false);
  });

  describe('CSP', () => {
    const directive = async (name: string) => {
      const csp = (await headersFor())['Content-Security-Policy']!;
      return csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '));
    };

    it('ปิดทางที่ข้อมูลรั่วออกนอกเว็บ', async () => {
      expect(await directive('default-src')).toBe("default-src 'self'");
      expect(await directive('base-uri')).toBe("base-uri 'self'");
      expect(await directive('object-src')).toBe("object-src 'none'");
      expect(await directive('frame-ancestors')).toBe("frame-ancestors 'none'");
      expect(await directive('form-action')).toBe("form-action 'self'");
      expect(await directive('connect-src')).toBe("connect-src 'self'");
    });

    /** ฟอนต์ไทยของหน้าแนะนำระบบ (components/landing.tsx) — ตัดออกแล้วหน้าแรกพัง */
    it('ยอมให้โหลดฟอนต์จาก Google ได้ ตามที่หน้าแรกใช้อยู่จริง', async () => {
      expect(await directive('style-src')).toContain('https://fonts.googleapis.com');
      expect(await directive('font-src')).toContain('https://fonts.gstatic.com');
    });

    it('รูปสินค้าและรูปที่เพิ่งเลือกยังแสดงได้', async () => {
      const img = await directive('img-src');
      expect(img).toContain("'self'");
      expect(img).toContain('data:');
      expect(img).toContain('blob:');
    });

    /* React เขียน style ลงแอตทริบิวต์ · Next ฝังสคริปต์เริ่มต้นไว้ในหน้า
       ทั้งสองอย่างต้องยอม inline — ข้อจำกัดที่รู้อยู่ ไม่ใช่ความพลั้งเผลอ */
    it('ยอม inline เท่าที่ Next กับ React ต้องใช้จริง', async () => {
      expect(await directive('style-src')).toContain("'unsafe-inline'");
      expect(await directive('script-src')).toContain("'unsafe-inline'");
    });

    it('ไม่ยอมให้โหลดสคริปต์จากโดเมนอื่น', async () => {
      const script = await directive('script-src');
      expect(script).not.toMatch(/https?:\/\//);
    });
  });
});
