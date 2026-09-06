/**
 * ไฟล์ตั้งค่า deploy ต้อง build ผ่านจริงบนเครื่องของผู้ให้บริการ
 *
 * เคยพังมาแล้วครั้งหนึ่ง — render.yaml ตั้ง NODE_ENV=production ไว้ ซึ่งทำให้
 * `npm ci` ข้าม devDependencies ทั้งหมด แล้ว typescript กับ @types/* ก็หายไป
 * ตอน build โดยที่บนเครื่องนักพัฒนาไม่มีทางเห็น เพราะเครื่องนักพัฒนา
 * ไม่ได้ตั้ง NODE_ENV
 *
 * เทสต์นี้อ่านไฟล์ตั้งค่าจริงและอ่าน package.json จริง ไม่ได้เขียนรายชื่อไว้ตายตัว
 * แพ็กเกจใหม่ที่ลืมประกาศ @types/node จะทำให้เทสต์นี้แดงเอง
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** ตัดไฟล์ blueprint ออกเป็นก้อนละ service — พอสำหรับเช็คระดับนี้ ไม่ต้องมีตัวอ่าน yaml เต็ม */
function services(yaml: string): string[] {
  const lines = yaml.split('\n');
  const blocks: string[] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (/^ {2}- type:/.test(line)) {
      if (cur) blocks.push(cur.join('\n'));
      cur = [line];
    } else if (cur) {
      cur.push(line);
    }
  }
  if (cur) blocks.push(cur.join('\n'));
  return blocks;
}

describe('render.yaml', () => {
  // ตัดบรรทัดคอมเมนต์ทิ้งก่อน ไม่งั้นคำว่า npm ci ในคอมเมนต์จะถูกจับมาตรวจแทนคำสั่งจริง
  const yaml = readFileSync(join(repo, 'render.yaml'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
  const blocks = services(yaml);

  it('เจอ service ครบทุกตัวในไฟล์', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it('service ที่ตั้ง NODE_ENV=production ต้องสั่ง npm ci แบบเอา devDependencies มาด้วย', () => {
    for (const block of blocks) {
      const name = /name:\s*(\S+)/.exec(block)?.[1] ?? '(ไม่มีชื่อ)';
      const isProd = /key:\s*NODE_ENV\s*\n\s*value:\s*production/.test(block);
      if (!isProd) continue;
      const calls = [...block.matchAll(/npm ci([^\n&]*)/g)];
      expect(calls.length, `service ${name}: หา npm ci ไม่เจอ`).toBeGreaterThan(0);
      for (const call of calls) {
        expect(
          call[1],
          `service ${name}: npm ci จะข้าม devDependencies เพราะ NODE_ENV=production`,
        ).toContain('--include=dev');
      }
    }
  });

  it('ทุก service ต้องอยู่ภูมิภาคเดียวกับฐานข้อมูล', () => {
    for (const block of blocks) {
      expect(block).toContain('region: singapore');
    }
  });
});

/** ไฟล์ต้นฉบับทั้งหมดของ workspace หนึ่ง */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe('การประกาศ dependency ของแต่ละ workspace', () => {
  const roots = ['packages/core', 'packages/importer', 'apps/web'];

  it('แพ็กเกจที่ใช้ของ Node ต้องประกาศ @types/node เอง ไม่ใช่อาศัยว่า workspace อื่นลงไว้ให้', () => {
    for (const root of roots) {
      const pkg = JSON.parse(readFileSync(join(repo, root, 'package.json'), 'utf8'));
      const declared = { ...pkg.dependencies, ...pkg.devDependencies };
      const usesNode = sourceFiles(join(repo, root, 'src')).some((f) => {
        const src = readFileSync(f, 'utf8');
        return /from 'node:|require\('node:|\bprocess\.env\b|\bBuffer\b/.test(src);
      });
      if (!usesNode) continue;
      expect(declared, `${root} ใช้ของ Node แต่ไม่ได้ประกาศ @types/node`).toHaveProperty('@types/node');
    }
  });
});
