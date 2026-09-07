/**
 * เครื่องมือที่ส่งค่าลับให้ผู้ใช้ ต้องไม่พิมพ์ค่านั้นลงหน้าจอเอง
 *
 * เกิดขึ้นจริงมาแล้วสองครั้งในโปรเจกต์นี้ — คำสั่งพิมพ์ connection string
 * ออกมาเต็ม ๆ ผู้ใช้ก๊อปทั้งก้อนมาถาม แล้วต้องเปลี่ยนรหัสผ่านใหม่ทั้งสองครั้ง
 * ไม่ใช่ความผิดของผู้ใช้ — เครื่องมือที่พ่นค่าลับใส่หน้าจอคือคนเชิญให้ทำแบบนั้น
 */
import { describe, expect, it } from 'vitest';
import { emitSecret, linkShape, urlShape } from '../../../tools/secret-out.mjs';

const SECRET = 'postgresql://dgl_app:sUp3rS3cr3tPassw0rd@dpg-abc123-a/dgl';
const LINK = 'https://example.com/ops/setup/TqHQ8yWF9UxoQGgIVXqYVaMKD3tURvMp56tq5oz93UU';

/** เก็บทุกอย่างที่ถูกพิมพ์ออกมา แล้วเอามาตรวจว่ามีค่าลับหลุดไหม */
function capture() {
  const lines: string[] = [];
  return { log: (s = '') => lines.push(String(s)), text: () => lines.join('\n') };
}

describe('ย่อค่าลับให้ปลอดภัยพอจะพิมพ์', () => {
  it('รูปร่างของ connection string ไม่มีรหัสผ่านอยู่ในนั้น', () => {
    const shape = urlShape(SECRET);
    expect(shape).not.toContain('sUp3rS3cr3tPassw0rd');
    /* แต่ต้องบอกพอให้ตรวจว่าหยิบถูกตัว */
    expect(shape).toContain('dgl_app');
    expect(shape).toContain('dpg-abc123-a');
    expect(shape).toContain('dgl');
    expect(shape, 'ต้องบอกด้วยว่ามีรหัสผ่านอยู่จริงกี่ตัว').toMatch(/มี \d+ ตัว/);
  });

  it('บอกได้ว่าเป็นที่อยู่ภายในหรือภายนอก — จุดที่พลาดกันบ่อย', () => {
    expect(urlShape(SECRET), 'โฮสต์ไม่มีจุด = ที่อยู่ภายใน').toContain('ที่อยู่ภายใน');
    expect(urlShape('postgresql://u:p@dpg-abc-a.singapore-postgres.render.com/dgl'))
      .not.toContain('ที่อยู่ภายใน');
  });

  it('รูปร่างของลิงก์ไม่มีโทเคนอยู่ในนั้น', () => {
    const shape = linkShape(LINK);
    expect(shape).not.toContain('TqHQ8yWF9UxoQGgIVXqYVaMKD3tURvMp56tq5oz93UU');
    expect(shape).toContain('https://example.com/ops/setup/');
    expect(shape).toMatch(/\d+ ตัวอักษร/);
  });

  it('ค่าที่อ่านเป็น URL ไม่ได้ ก็ยังต้องไม่พิมพ์ค่านั้นออกมา', () => {
    expect(urlShape('ไม่ใช่ url เลย')).not.toContain('ไม่ใช่ url เลย');
    expect(linkShape('ไม่ใช่ url เลย')).not.toContain('ไม่ใช่ url เลย');
  });
});

describe('การส่งค่าลับ', () => {
  it('ค่าตั้งต้นไม่พิมพ์ค่าจริงลงหน้าจอ', () => {
    const out = capture();
    const via = emitSecret(SECRET, {
      title: 'ทดสอบ', log: out.log, copy: () => 'pbcopy',
    });
    expect(via).toBe('pbcopy');
    expect(out.text(), 'ค่าลับต้องไม่โผล่ในสิ่งที่พิมพ์').not.toContain('sUp3rS3cr3tPassw0rd');
    expect(out.text()).toContain('คลิปบอร์ด');
  });

  it('เครื่องที่ไม่มีคลิปบอร์ด ก็ยังไม่พิมพ์ค่าจริงออกมาเอง', () => {
    const out = capture();
    const via = emitSecret(SECRET, { title: 'ทดสอบ', log: out.log, copy: () => null });
    expect(via).toBeNull();
    expect(out.text(), 'ต้องไม่แอบพิมพ์ค่าลับเวลาก๊อปไม่ได้')
      .not.toContain('sUp3rS3cr3tPassw0rd');
    expect(out.text(), 'ต้องบอกทางออกให้').toContain('--show');
  });

  /** พิมพ์ค่าลับได้ แต่ต้องเป็นการตัดสินใจ ไม่ใช่ค่าตั้งต้น */
  it('สั่ง --show แล้วพิมพ์ออกมา พร้อมคำเตือน', () => {
    const out = capture();
    const via = emitSecret(SECRET, { title: 'ทดสอบ', log: out.log, show: true });
    expect(via).toBe('shown');
    expect(out.text()).toContain(SECRET);
    expect(out.text()).toContain('--show');
  });
});

describe('เครื่องมือที่แตะค่าลับ', () => {
  it('ไม่พิมพ์ connection string หรือลิงก์ตั้งรหัสผ่านออกมาตรง ๆ', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const TOOLS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tools');

    /* ไล่จากไฟล์จริง — เครื่องมือใหม่ที่พ่นค่าลับใส่หน้าจอจะแดงเอง */
    const FILES = ['setup-db.impl.mjs', 'ops-admin.impl.mjs'];
    for (const f of FILES) {
      const src = readFileSync(resolve(TOOLS, f), 'utf8');
      expect(src, `${f} ต้องส่งค่าลับผ่าน emitSecret()`).toContain('emitSecret(');

      /* console.log ที่พ่นตัวแปร URL หรือโทเคนออกมาตรง ๆ */
      const bad = [...src.matchAll(/console\.log\(([^)]*)\)/g)]
        .map((m) => m[1]!)
        .filter((arg) => /\bu\.toString\(\)|\/setup\/\$\{token\}|\bpassword\b/.test(arg));
      expect(bad, `${f} ยังพิมพ์ค่าลับลงหน้าจอตรง ๆ`).toEqual([]);
    }
  });
});
