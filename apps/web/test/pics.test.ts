/**
 * การตรวจไฟล์รูปที่ผู้ใช้อัปโหลด
 *
 * รูปถูกย่อที่เบราว์เซอร์ก็จริง แต่ `<input type=file>` ส่งอะไรมาก็ได้
 * และ `file.type` ผู้ส่งตั้งเองได้ทั้งหมด ทุกอย่างจึงต้องอ่านจากตัวไบต์จริง
 *
 * ที่ต้องกันจริง ๆ คือไฟล์หน้าตาเป็นรูปแต่ข้างในเป็น HTML — ถ้าหลุดไปแล้ว
 * เราเสิร์ฟกลับด้วย content-type ที่ผู้ใช้ส่งมา มันจะกลายเป็น XSS บนโดเมนของเราเอง
 *
 * รูปที่ใช้ทดสอบเป็นไฟล์จริง ไม่ใช่ไบต์ที่ประกอบขึ้นในเทสต์ —
 * JPEG จากกล้องมี EXIF คั่นก่อน SOF ซึ่งเป็นจุดที่ตัวอ่านขนาดพลาดได้ง่ายที่สุด
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkPic, MAX_PIC_BYTES, sniffMime } from '../src/lib/pics-core';

const here = dirname(fileURLToPath(import.meta.url));
const PICS = resolve(here, 'fixtures/pics');
const load = (n: string) => new Uint8Array(readFileSync(join(PICS, n)));

const ok = (r: ReturnType<typeof checkPic>) => {
  if (!r.ok) throw new Error(`ควรผ่าน แต่ได้: ${r.error}`);
  return r.info;
};

describe('อ่านชนิดไฟล์จากไบต์จริง', () => {
  it('รู้จัก JPEG และ PNG', () => {
    expect(sniffMime(load('small.jpg'))).toBe('image/jpeg');
    expect(sniffMime(load('small.png'))).toBe('image/png');
  });

  it('ไฟล์อื่นได้ null ไม่ใช่เดาเอา', () => {
    expect(sniffMime(new TextEncoder().encode('<html>hi</html>'))).toBeNull();
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();  /* PDF */
    expect(sniffMime(new Uint8Array([]))).toBeNull();
  });
});

describe('อ่านขนาดรูป', () => {
  it('PNG', () => {
    expect(ok(checkPic(load('small.png')))).toMatchObject({
      mime: 'image/png', width: 120, height: 80,
    });
  });

  it('JPEG — ต้องข้าม EXIF ไปหา SOF ให้เจอ', () => {
    expect(ok(checkPic(load('small.jpg')))).toMatchObject({
      mime: 'image/jpeg', width: 120, height: 80,
    });
  });
});

describe('ปฏิเสธไฟล์ที่ไม่ควรรับ', () => {
  /** ข้อสำคัญที่สุด */
  it('HTML ที่ตั้งชื่อว่าเป็นรูป', () => {
    const evil = new TextEncoder().encode('<script>alert(1)</script>');
    const r = checkPic(evil);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/ไม่ใช่รูป/);
  });

  it('SVG — เป็นรูปก็จริง แต่รันสคริปต์ได้ จึงไม่รับ', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(checkPic(svg).ok).toBe(false);
  });

  it('รูปที่กว้างเกินเพดาน', () => {
    const r = checkPic(load('toowide.png'));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/2400/);
  });

  it('ไฟล์ใหญ่เกินเพดาน', () => {
    /* หัวเป็น JPEG จริง แต่ยาวเกิน — ต้องตกที่ขนาด ไม่ใช่ตกที่ชนิด */
    const big = new Uint8Array(MAX_PIC_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    const r = checkPic(big);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/ใหญ่/);
  });

  it('ไฟล์ว่าง', () => {
    expect(checkPic(new Uint8Array([])).ok).toBe(false);
  });

  it('หัวเป็น JPEG แต่ข้างในไม่มี SOF — อ่านขนาดไม่ได้ ต้องปฏิเสธ ไม่ใช่เดาขนาด', () => {
    const r = checkPic(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/อ่านขนาดรูปไม่ได้/);
  });

  it('หัวเป็น PNG แต่ชังก์แรกไม่ใช่ IHDR', () => {
    const b = new Uint8Array(load('small.png'));
    b.set(new TextEncoder().encode('XXXX'), 12);
    expect(checkPic(b).ok).toBe(false);
  });

  it('JPEG ที่ความยาว segment เป็นศูนย์ ต้องไม่วนไม่รู้จบ', () => {
    /* len < 2 คือค่าที่เป็นไปไม่ได้ ถ้าไม่ตรวจจะบวก i ทีละ 2 แล้วอ่านมั่วไปเรื่อย */
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
    expect(checkPic(b).ok).toBe(false);
  });
});
