/**
 * บาร์โค้ด Code 39
 *
 * พอร์ตจาก C39 · barcodeSVG() · genBarcode() ของรุ่น 6.4 ให้ได้ผลตรงกันทุกแถบ
 * ฉลากที่พิมพ์ออกมาต้องยิงได้ด้วยปืนตัวเดิมที่อู่ใช้อยู่ — ผิดหนึ่งแถบคือทั้งม้วนใช้ไม่ได้
 * จึงมีชุดทดสอบเทียบกับไฟล์ต้นฉบับโดยตรง (differential.test.ts)
 *
 * Code 39 เข้ารหัสได้ 43 ตัวอักษรบวกตัวคั่น `*` แต่ละตัวเป็นแถบ 9 ช่อง
 * สลับดำขาว โดย '1' คือช่องกว้าง '0' คือช่องแคบ
 */

export const C39: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001',
  '5': '100110000', '6': '001110000', '7': '000100101', '8': '100100100', '9': '001100100',
  'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001', 'E': '100011000',
  'F': '001011000', 'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011', 'O': '100010010',
  'P': '001010010', 'Q': '000000111', 'R': '100000110', 'S': '001000110', 'T': '000010110',
  'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001', 'Y': '110010000',
  'Z': '011010000', '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100',
};

/**
 * วาดบาร์โค้ดเป็น SVG
 *
 * ตัวอักษรที่ Code 39 เข้ารหัสไม่ได้ถูกตัดทิ้งเงียบ ๆ ตามต้นฉบับ
 * แล้วครอบด้วย `*` หัวท้ายซึ่งเป็นตัวคั่นมาตรฐานของ Code 39
 */
export function barcodeSVG(text: string, w: number, h: number): string {
  const t = '*' + String(text).toUpperCase().replace(/[^A-Z0-9\-. ]/g, '') + '*';

  const bars: { bar: boolean; wide: boolean }[] = [];
  for (const ch of t) {
    const p = C39[ch];
    if (!p) continue;
    for (let i = 0; i < 9; i++) bars.push({ bar: i % 2 === 0, wide: p[i] === '1' });
    bars.push({ bar: false, wide: false });      /* ช่องคั่นตัวอักษร */
  }
  bars.pop();

  const narrow = 1;
  const wide = 2.6;
  const total = bars.reduce((s, b) => s + (b.wide ? wide : narrow), 0);
  const k = w / total;

  let x = 0;
  let rects = '';
  for (const b of bars) {
    const bw = (b.wide ? wide : narrow) * k;
    if (b.bar) rects += `<rect x="${x.toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${h}"/>`;
    x += bw;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `
       + `viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${rects}</svg>`;
}

/**
 * ออกบาร์โค้ดใหม่ให้สินค้าที่ยังไม่มี
 *
 * รับเวลาและตัวสุ่มเข้ามาได้เพื่อให้ชุดทดสอบกำหนดผลลัพธ์ได้
 * ค่าปริยายเหมือนต้นฉบับ — เวลาปัจจุบันฐาน 36 หกหลักท้าย บวกเลขสุ่มสองหลัก
 */
export function genBarcode(now: number = Date.now(), rand: () => number = Math.random): string {
  const t = now.toString(36).toUpperCase().slice(-6);
  const r = Math.floor(rand() * 1296).toString(36).toUpperCase().padStart(2, '0');
  return ('DG' + t + r).replace(/[^A-Z0-9]/g, '0');
}
