'use server';

import { headers } from 'next/headers';
import { recordError } from '@/lib/ops';
import { checkPic, MAX_PIC_BYTES } from '@/lib/pics-core';
import { callerIp, RateLimiter } from '@/lib/rate-limit';
import { checkSignup } from '@/lib/signup-core';
import { submitSignup, type Attached } from '@/lib/signup';

/**
 * เพดานของทางเข้านี้ — ไม่ต้องล็อกอิน และแต่ละใบมีรูปแนบได้ถึง 2 MB
 *
 * คนจริงหนึ่งคนสมัครครั้งเดียว ส่งพลาดแก้แล้วส่งใหม่ก็ไม่กี่ครั้ง · ก้อนรวมกันคนที่มีไอพีเยอะ
 * ชั้นสุดท้ายคือเพดานใบที่รอตรวจ 30 ใบในฐานข้อมูล (ops.submit_signup)
 */
const PER_IP = new RateLimiter({ limit: 5, windowMs: 60 * 60_000, maxKeys: 5_000 });
const OVERALL = new RateLimiter({ limit: 60, windowMs: 60 * 60_000, maxKeys: 1 });

export interface SignupResult {
  ok?: boolean;
  error?: string;
  /** ชื่อช่อง → ข้อความ — ชื่อเดียวกับที่ checkSignup() ใช้ */
  errors?: Record<string, string>;
}

/** ไฟล์แนบ — ตรวจจากไบต์จริงเสมอ (pics-core) ไม่เชื่อ file.type หรือนามสกุล */
async function attached(fd: FormData, name: string): Promise<Attached | null | string> {
  const f = fd.get(name);
  if (!(f instanceof File) || f.size === 0) return null;
  /* ดูขนาดก่อนอ่านทั้งก้อนเข้าหน่วยความจำ — ปกติหน้าเว็บย่อรูปให้ก่อนส่งแล้ว */
  if (f.size > MAX_PIC_BYTES) return 'ไฟล์ใหญ่เกิน 1 MB — ลองแนบใหม่อีกครั้ง';
  const bytes = Buffer.from(await f.arrayBuffer());
  const check = checkPic(bytes);
  return check.ok ? { mime: check.info.mime, bytes } : check.error;
}

/**
 * เรียกตรงจากหน้าเว็บ ไม่ใช่ผ่าน <form action> — ฟอร์มของ React 19 ล้างทุกช่องหลังส่ง
 * ถ้าส่งไม่ผ่านแล้วผู้ใช้ต้องกรอกใบสมัครยาว ๆ ใหม่หมด แย่กว่าไม่มีฟอร์ม
 */
export async function submitSignupAction(fd: FormData): Promise<SignupResult> {
  /* ช่องกับดัก — ซ่อนจากคน บอตกรอกทุกช่องที่เห็น · ตอบว่าสำเร็จ จะได้ไม่ลองใหม่ */
  if (String(fd.get('website') ?? '') !== '') return { ok: true };

  const ip = callerIp(await headers());
  if (!PER_IP.check(ip ?? 'unknown').ok || !OVERALL.check('all').ok) {
    return { error: 'ส่งใบสมัครถี่เกินไป กรุณารอสักครู่แล้วลองใหม่ หรือติดต่อทีมงานทาง LINE' };
  }

  const check = checkSignup((k) => String(fd.get(k) ?? ''));
  const slip = await attached(fd, 'slip');
  const cert = await attached(fd, 'wht_cert');
  const errors: Record<string, string> = check.ok ? {} : { ...check.errors };
  if (slip === null) errors.slip = 'กรุณาแนบรูปสลิปการโอนเงิน';
  else if (typeof slip === 'string') errors.slip = slip;
  if (typeof cert === 'string') errors.wht_cert = cert;
  if (!check.ok || Object.keys(errors).length) {
    return { error: `ยังมีข้อมูลที่ต้องแก้ไข ${Object.keys(errors).length} รายการ`, errors };
  }

  try {
    await submitSignup(check.value, slip as Attached, (cert as Attached | null), ip);
    return { ok: true };
  } catch (err) {
    /* P0001 = raise exception ของเราเอง (อีเมลซ้ำ · ใบรอตรวจเต็ม) — ข้อความเขียนไว้ให้ลูกค้าอ่านแล้ว */
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P0001') {
      const message = err instanceof Error ? err.message : 'ส่งใบสมัครไม่สำเร็จ';
      return /อีเมล/.test(message) ? { error: message, errors: { c_email: message } } : { error: message };
    }
    await recordError({
      kind: 'action', path: '/signup',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack ?? null : null,
    });
    return { error: 'ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือติดต่อทีมงานทาง LINE' };
  }
}
