/**
 * ปลายทางหลังกดบันทึก — ใส่ค่าให้หน้าปลายทางแสดงการ์ดบันทึกแล้ว (ผู้ใช้กำหนด 16 ก.ย. 2569)
 *
 * ไม่มี server-only เพื่อให้เทสต์ vitest เรียกได้ตรง ๆ — ไฟล์นี้เป็นตรรกะล้วน ไม่แตะฐาน
 *
 * สร้างใหม่ → กลับฟอร์มเปล่าชนิดเดิม · แก้ไข → กลับหน้าที่กดแก้ไขมา
 * URL มีแค่ชนิดกับ id — ข้อมูลในการ์ดหน้าปลายทางอ่านจากฐานเอง (lib/saved.ts) ไม่เชื่อค่าจาก URL
 */

export const SAVED_KINDS = ['sales', 'buy', 'bill', 'claim', 'contact', 'product', 'kit'] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export const isSavedKind = (v: unknown): v is SavedKind => SAVED_KINDS.includes(v as SavedKind);

/** ลบ saved / savedId ที่อาจค้างอยู่ใน path (เช่นกลับมาจากการ์ดรอบก่อน) */
export function withoutSaved(path: string): string {
  const at = path.indexOf('?');
  if (at < 0) return path;
  const sp = new URLSearchParams(path.slice(at + 1));
  sp.delete('saved');
  sp.delete('savedId');
  const q = sp.toString();
  return q ? `${path.slice(0, at)}?${q}` : path.slice(0, at);
}

/** ต่อค่าการ์ดบันทึกแล้วเข้ากับปลายทาง */
export function withSaved(path: string, kind: SavedKind, id: string): string {
  const clean = withoutSaved(path);
  const sep = clean.includes('?') ? '&' : '?';
  return `${clean}${sep}saved=${kind}&savedId=${encodeURIComponent(id)}`;
}

/**
 * หน้าที่จะกลับไปหลังแก้ไข — รับได้เฉพาะ path ภายในเว็บที่ขึ้นต้นด้วย `prefixes`
 *
 * ค่ามาจากผู้ใช้ (ช่องซ่อนในฟอร์ม / Referer) จึงต้องกัน open redirect:
 * ไม่รับ `//host` · `\` · โดเมนอื่น (URL เต็มเอาเฉพาะ path) · หน้าแก้ไข/พิมพ์ (กลับไปแล้วเจอฟอร์มซ้ำหรือหน้ากระดาษ)
 */
export function safeBack(raw: unknown, prefixes: readonly string[]): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      s = `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return null;
  const path = s.split(/[?#]/)[0]!;
  if (/\/(edit|print)$/.test(path)) return null;
  /* "/" = ทุกหน้าในเว็บ — ต่อ "/" ซ้ำจะได้ "//" ซึ่งไม่ตรงอะไรเลย · ด่าน // ข้างบนจึงเป็นตัวกัน //host จริง ไม่ใช่ตัวกรองนี้ */
  if (!prefixes.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`))) return null;
  return withoutSaved(s.split('#')[0]!);
}
