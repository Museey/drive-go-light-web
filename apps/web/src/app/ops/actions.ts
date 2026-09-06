'use server';

import { revalidatePath } from 'next/cache';
import {
  appUrl, newSetupToken, opsSetupUrl, requireOperator, shopSetupUrl,
} from '@/lib/ops-auth';
import {
  addOperator, issueOwnerReset, openShop, recordRenewal, setMaxUsers, setOperatorActive,
} from '@/lib/ops-console';
import type { FormResult } from '@/lib/mutate';

/**
 * งานทั้งหมดของคอนโซล
 *
 * ทุกตัวเรียก requireOperator() เพื่อพาไปหน้าล็อกอินให้ถูกถ้ายังไม่ได้เข้า
 * แต่**ด่านจริงอยู่ในฐานข้อมูล** — ฟังก์ชัน ops.* ตรวจโทเคนเองทุกตัว
 * ถ้าลืมเรียก requireOperator() ตรงไหน ที่นั่นก็ยังทำอะไรไม่ได้อยู่ดี
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** ลิงก์ที่ออกมาไม่ถูกเก็บไว้ที่ไหน — แสดงครั้งเดียวแล้วหายไป ต้องออกใหม่ถ้าทำหาย */
export interface LinkResult extends FormResult {
  link?: string;
  email?: string;
}

export async function openShopAction(_prev: LinkResult, fd: FormData): Promise<LinkResult> {
  const s = await requireOperator();

  const name = str(fd, 'name');
  const ownerEmail = str(fd, 'ownerEmail');
  if (!name) return { error: 'ต้องกรอกชื่ออู่', field: 'name' };
  if (!ownerEmail) return { error: 'ต้องกรอกอีเมลของเจ้าของอู่', field: 'ownerEmail' };

  const t = newSetupToken();
  try {
    await openShop(s, {
      name, tel: str(fd, 'tel'), ownerEmail, ownerName: str(fd, 'ownerName'),
    }, t.hash, t.expiresAt);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'เปิดอู่ไม่สำเร็จ' };
  }

  revalidatePath('/ops');
  return { ok: true, link: shopSetupUrl(appUrl(), t.token), email: ownerEmail };
}

export async function issueResetAction(_prev: LinkResult, fd: FormData): Promise<LinkResult> {
  const s = await requireOperator();
  const tenantId = str(fd, 'tenantId');
  if (!tenantId) return { error: 'ไม่รู้ว่าเป็นอู่ไหน' };

  const t = newSetupToken();
  try {
    const email = await issueOwnerReset(s, tenantId, t.hash, t.expiresAt);
    return { ok: true, email, link: shopSetupUrl(appUrl(), t.token) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'ออกลิงก์ไม่สำเร็จ' };
  }
}

export async function renewAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const s = await requireOperator();
  const tenantId = str(fd, 'tenantId');
  const from = str(fd, 'from');
  const to = str(fd, 'to');
  if (!tenantId || !from || !to) return { error: 'กรอกวันเริ่มและวันหมดอายุให้ครบ' };

  const raw = str(fd, 'amount').replace(/,/g, '');
  const amount = raw === '' ? null : Number(raw);
  if (amount !== null && !Number.isFinite(amount)) return { error: 'ยอดเงินไม่ถูกต้อง' };

  try {
    await recordRenewal(s, {
      tenantId, plan: str(fd, 'plan') || 'light-yearly', from, to, amount,
      note: str(fd, 'note'),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ' };
  }
  revalidatePath('/ops');
  revalidatePath(`/ops/shop/${tenantId}`);
  return { ok: true };
}

export async function setSeatsAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const s = await requireOperator();
  const tenantId = str(fd, 'tenantId');
  const raw = str(fd, 'maxUsers');
  const max = raw === '' ? null : Number(raw);
  if (max !== null && (!Number.isInteger(max) || max <= 0)) {
    return { error: 'จำนวนที่นั่งต้องเป็นจำนวนเต็มบวก หรือเว้นว่างถ้าไม่จำกัด' };
  }

  try {
    await setMaxUsers(s, tenantId, max);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ' };
  }
  revalidatePath(`/ops/shop/${tenantId}`);
  return { ok: true };
}

export async function addOperatorAction(_prev: LinkResult, fd: FormData): Promise<LinkResult> {
  const s = await requireOperator();
  const email = str(fd, 'email');
  if (!email) return { error: 'ต้องกรอกอีเมล', field: 'email' };

  const t = newSetupToken();
  try {
    await addOperator(s, email, str(fd, 'name'), t.hash, t.expiresAt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    return { error: /duplicate|unique/i.test(msg) ? 'อีเมลนี้มีบัญชีอยู่แล้ว' : (msg || 'เพิ่มไม่สำเร็จ') };
  }
  revalidatePath('/ops/operators');
  return { ok: true, email, link: opsSetupUrl(appUrl(), t.token) };
}

export async function toggleOperatorAction(operatorId: string, active: boolean): Promise<void> {
  const s = await requireOperator();
  await setOperatorActive(s, operatorId, active);
  revalidatePath('/ops/operators');
}
