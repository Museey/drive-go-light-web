import { createHash } from 'node:crypto';
import type pg from 'pg';
import { checkPic, type PicMime } from './pics-core';

/**
 * รูปสินค้า — ฝั่งฐานข้อมูล
 *
 * รับ client เข้ามาเหมือน claims.ts และ stock-counts.ts ไม่ผูกกับ session
 * การตรวจสิทธิ์อยู่ที่ฝั่ง action และ route
 */

type Client = Pick<pg.PoolClient, 'query'>;

export interface PicMeta {
  sha: string;
  mime: PicMime;
  width: number;
  height: number;
  bytes: number;
}

export const sha256 = (b: Uint8Array): string =>
  createHash('sha256').update(b).digest('hex');

/**
 * บันทึกรูปของสินค้าหนึ่งรายการ — ทับของเดิมถ้ามี
 *
 * ตรวจทั้งรูปเต็มและรูปย่อจากไบต์จริงทั้งคู่ ไม่ใช่ตรวจแค่รูปเต็มแล้วเชื่อรูปย่อ
 * เพราะทั้งสองก้อนมาจากฝั่งผู้ใช้เท่ากัน และรูปย่อคือก้อนที่ถูกเสิร์ฟบ่อยที่สุด
 */
export async function savePic(
  c: Client, productId: string, full: Uint8Array, thumb: Uint8Array,
): Promise<{ ok: true; meta: PicMeta } | { ok: false; error: string }> {
  const f = checkPic(full);
  if (!f.ok) return { ok: false, error: f.error };

  const t = checkPic(thumb);
  if (!t.ok) return { ok: false, error: `รูปย่อไม่ผ่านการตรวจ — ${t.error}` };

  const meta: PicMeta = {
    sha: sha256(full),
    mime: f.info.mime,
    width: f.info.width,
    height: f.info.height,
    bytes: full.length + thumb.length,
  };

  await c.query(
    `insert into product_pics
       (product_id, tenant_id, sha, mime, width, height, full_bytes, thumb_bytes, bytes)
     values ($1, current_tenant_id(), $2, $3, $4, $5, $6, $7, $8)
     on conflict (product_id) do update set
       sha = excluded.sha, mime = excluded.mime,
       width = excluded.width, height = excluded.height,
       full_bytes = excluded.full_bytes, thumb_bytes = excluded.thumb_bytes,
       bytes = excluded.bytes, created_at = now()`,
    [productId, meta.sha, meta.mime, meta.width, meta.height,
     Buffer.from(full), Buffer.from(thumb), meta.bytes],
  );

  return { ok: true, meta };
}

export async function deletePic(c: Client, productId: string): Promise<void> {
  await c.query('delete from product_pics where product_id = $1', [productId]);
}

export async function getPicMeta(c: Client, productId: string): Promise<PicMeta | null> {
  const { rows } = await c.query(
    'select sha, mime, width, height, bytes from product_pics where product_id = $1',
    [productId],
  );
  return rows[0] ? { ...rows[0], bytes: Number(rows[0].bytes) } as PicMeta : null;
}

/**
 * อ่านรูปเพื่อเสิร์ฟ
 *
 * รับ sha มาด้วยและใช้เป็นเงื่อนไข ไม่ใช่แค่เอาไว้ตั้งชื่อ URL —
 * URL ที่ชี้ไปหารูปเก่าจึงตอบ 404 แทนที่จะตอบรูปใหม่ด้วยหัวแคชถาวร
 * ซึ่งจะทำให้เบราว์เซอร์เก็บรูปผิดไว้ตลอดกาล
 */
export async function readPic(
  c: Client, productId: string, sha: string, size: 'full' | 'thumb',
): Promise<{ bytes: Buffer; mime: PicMime } | null> {
  const col = size === 'thumb' ? 'thumb_bytes' : 'full_bytes';
  const { rows } = await c.query(
    `select ${col} as b, mime from product_pics where product_id = $1 and sha = $2`,
    [productId, sha],
  );
  if (!rows[0]) return null;
  return { bytes: rows[0].b as Buffer, mime: rows[0].mime as PicMime };
}

/** รูปย่อของสินค้าหลายรายการรวดเดียว — หน้ารายการ 50 แถวต้องไม่ยิง 50 คิวรี */
export async function picShaOf(
  c: Client, productIds: string[],
): Promise<Map<string, string>> {
  if (!productIds.length) return new Map();
  const { rows } = await c.query(
    'select product_id, sha from product_pics where product_id = any($1)',
    [productIds],
  );
  return new Map(rows.map((r: any) => [r.product_id as string, r.sha as string]));
}

/** พื้นที่รูปที่อู่นี้ใช้ไปแล้ว — เอาไว้แสดงบนหน้าจอ ไม่ใช่เอาไว้บังคับ (ฐานข้อมูลบังคับเอง) */
export async function picUsage(c: Client): Promise<{ count: number; bytes: number }> {
  const { rows } = await c.query(
    'select count(*)::int as n, coalesce(sum(bytes), 0)::bigint as b from product_pics',
  );
  return { count: rows[0].n, bytes: Number(rows[0].b) };
}
