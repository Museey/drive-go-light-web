import { num, round2 } from './num.js';
import type { Numeric } from './types.js';

const T = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

function chunk(s: string): string {
  let out = '';
  const L = s.length;
  for (let i = 0; i < L; i++) {
    const d = +s[i]!;
    const pos = L - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && L > 1) out += 'เอ็ด';
    else if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else out += T[d]! + P[pos]!;
  }
  return out;
}

function whole(n: number | string): string {
  const s = String(n);
  if (s.length > 6) {
    return whole(s.slice(0, s.length - 6)) + 'ล้าน' + (+s.slice(-6) ? chunk(s.slice(-6)) : '');
  }
  return chunk(s);
}

/** จำนวนเงินเป็นตัวหนังสือภาษาไทย — ใช้บนใบเสร็จและใบกำกับภาษี */
export function bahttext(n: Numeric): string {
  const v = round2(num(n));
  if (v === 0) return 'ศูนย์บาทถ้วน';
  const b = Math.floor(v);
  const st = Math.round((v - b) * 100);
  return (b ? whole(b) : 'ศูนย์') + 'บาท' + (st ? chunk(String(st)) + 'สตางค์' : 'ถ้วน');
}
