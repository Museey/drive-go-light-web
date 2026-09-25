/**
 * จำกัดจำนวนครั้งต่อช่วงเวลา — สำหรับทางเข้าที่ **ไม่ต้องล็อกอิน**
 *
 * ทางเข้าที่ไม่ต้องล็อกอินทุกทางคือทางที่ใครก็เรียกได้ไม่จำกัด ถ้าปลายทางเขียนฐานข้อมูล
 * การเรียกซ้ำ ๆ จะกลายเป็นการถมดิสก์ — และดิสก์ของที่นี่เป็นของ **ทุกอู่ร่วมกัน**
 * ดิสก์เต็มเมื่อไรคืออู่ทุกรายออกบิลไม่ได้พร้อมกัน ไม่ใช่แค่รายที่โดนก่อกวน
 *
 * นับแบบช่วงเวลาตายตัว (fixed window) ไม่ใช่ถังโทเคน — หยาบกว่าแต่เดาพฤติกรรมง่าย
 * และงานนี้ไม่ต้องการความแม่นระดับนั้น ขอแค่มีเพดาน
 *
 * **อยู่ในหน่วยความจำของโพรเซส** ไม่ได้แชร์ข้ามเครื่อง ถ้าวันหนึ่งขยายเป็นหลายเครื่อง
 * เพดานจริงจะเท่ากับเพดานนี้คูณจำนวนเครื่อง ซึ่งยังมีเพดานอยู่ดี — ต่างจากตอนนี้ที่ไม่มีเลย
 */

export interface RateLimitResult {
  ok: boolean;
  /** เหลือโควตาอีกกี่ครั้งในช่วงเวลานี้ */
  remaining: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  /** จำนวนครั้งที่ยอมให้ต่อหนึ่งช่วงเวลา */
  limit: number;
  windowMs: number;
  /**
   * จำนวนกุญแจสูงสุดที่จำไว้พร้อมกัน
   *
   * ตัวจำกัดอัตราที่จำทุกกุญแจไม่อั้น **ตัวมันเองคือช่องโหว่** — ผู้โจมตีที่มีไอพีเยอะ
   * ถมหน่วยความจำของเซิร์ฟเวอร์แทนดิสก์ของฐานข้อมูล ซึ่งก็ล่มเหมือนกัน
   */
  maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 10_000;

export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(opts: RateLimiterOptions) {
    this.limit = Math.max(1, opts.limit);
    this.windowMs = Math.max(1, opts.windowMs);
    this.maxKeys = Math.max(1, opts.maxKeys ?? DEFAULT_MAX_KEYS);
  }

  /**
   * นับหนึ่งครั้งแล้วบอกว่าผ่านไหม
   *
   * `now` ใส่เองได้เพื่อให้เทสต์เดินเวลาได้โดยไม่ต้องรอจริง
   */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const cur = this.windows.get(key);

    if (!cur || now >= cur.resetAt) {
      /* กุญแจใหม่ (หรือช่วงเวลาเดิมหมดอายุแล้ว) — เก็บเพิ่มได้ก็ต่อเมื่อยังมีที่ว่าง */
      if (!cur && this.windows.size >= this.maxKeys) {
        this.sweep(now);
        if (this.windows.size >= this.maxKeys) {
          /* เต็มจริง ๆ — ปฏิเสธไว้ก่อน ผู้เรียกเลือกได้ว่าจะทำอย่างไรต่อ
             การทิ้งรายงานข้อผิดพลาดหนึ่งใบเสียหายน้อยกว่าการปล่อยให้หน่วยความจำหมด */
          return { ok: false, remaining: 0 };
        }
      }
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true, remaining: this.limit - 1 };
    }

    if (cur.count >= this.limit) return { ok: false, remaining: 0 };

    cur.count += 1;
    return { ok: true, remaining: this.limit - cur.count };
  }

  /** ทิ้งช่วงเวลาที่หมดอายุแล้ว — เรียกเองได้ แต่ปกติ check() เรียกให้ตอนที่จำเป็น */
  sweep(now: number = Date.now()): void {
    for (const [k, w] of this.windows) {
      if (now >= w.resetAt) this.windows.delete(k);
    }
  }

  /** จำนวนกุญแจที่จำอยู่ — มีไว้ให้เทสต์ตรวจว่าหน่วยความจำไม่โตไม่หยุด */
  get size(): number {
    return this.windows.size;
  }
}

/**
 * ไอพีของผู้เรียกจาก header ที่ reverse proxy ใส่มาให้
 *
 * `x-forwarded-for` ปลอมได้ถ้าคำขอมาถึงแอปตรง ๆ แต่บนเครื่องจริงทุกคำขอผ่าน
 * Caddy หรือ Render ซึ่งเขียนทับค่านี้เสมอ — ค่าแรกในรายการคือไอพีต้นทางจริง
 *
 * อ่านไม่ได้ก็คืน null แล้วให้ผู้เรียกจัดกลุ่มรวมเป็นก้อนเดียว ดีกว่าปล่อยผ่านทั้งหมด
 */
export function callerIp(headers: { get(name: string): string | null }): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get('x-real-ip');
  return real ? real.trim().slice(0, 64) : null;
}
