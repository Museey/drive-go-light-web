/**
 * ไอคอนของเว็บ — แท็บเบราว์เซอร์ และตอนเพิ่มลงหน้าจอโฮม (ผู้ใช้ส่งภาพโลโก้ 18 ก.ย. 2569)
 * ตรวจไฟล์จริงในโปรเจกต์: มีครบ เป็น PNG สี่เหลี่ยมจัตุรัส ขนาดตรงตามที่ประกาศไว้
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../src/app/manifest';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** ขนาดจริงจากหัวไฟล์ PNG (ไบต์ 16–24) — ไม่ต้องพึ่งไลบรารีอ่านรูป */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  expect(b.subarray(0, 8).toString('hex'), `${path} ไม่ใช่ไฟล์ PNG`).toBe('89504e470d0a1a0a');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const ICONS: [string, number][] = [
  ['src/app/icon.png', 512],          // แท็บเบราว์เซอร์
  ['src/app/apple-icon.png', 180],    // iPhone/iPad เพิ่มไปยังหน้าจอโฮม
  ['public/icon-192.png', 192],       // Android ติดตั้งลงหน้าจอ
  ['public/icon-512.png', 512],
];

describe('ไอคอนของเว็บ', () => {
  it.each(ICONS)('%s เป็น PNG จัตุรัส %ipx', (file, size) => {
    const path = resolve(WEB, file);
    expect(existsSync(path), `ไม่มีไฟล์ ${file}`).toBe(true);
    expect(pngSize(path)).toEqual({ width: size, height: size });
  });

  it('เก็บภาพต้นฉบับไว้ในโปรเจกต์ เผื่อทำไอคอนขนาดใหม่', () => {
    expect(existsSync(resolve(WEB, 'brand/logo-source.jpg'))).toBe(true);
  });

  it('manifest: ชื่อ DriveGoLight! · เปิดเต็มหน้าจอ · ไอคอน 192 และ 512', () => {
    const m = manifest();
    expect(m.name).toBe('DriveGoLight!');
    expect(m.short_name).toBe('DriveGoLight!');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.lang).toBe('th');
    expect((m.icons ?? []).map((i) => i.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of m.icons ?? []) {
      expect(icon.type).toBe('image/png');
      expect(existsSync(resolve(WEB, 'public', icon.src.replace(/^\//, ''))), `ไม่มีไฟล์ ${icon.src}`).toBe(true);
    }
  });
});
