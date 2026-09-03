'use server';

import { recordError } from '@/lib/ops';

/**
 * รับข้อผิดพลาดจากฝั่งเบราว์เซอร์มาบันทึก
 *
 * ไม่ตรวจสิทธิ์ เพราะข้อผิดพลาดเกิดกับคนที่ยังไม่ได้ล็อกอินได้ (หน้าล็อกอินพังเอง)
 * แต่ recordError() ตัดข้อความยาวและกรองความลับให้แล้ว
 */
export async function reportClientError(input: {
  message: string;
  stack: string | null;
  digest: string | null;
  path: string | null;
}): Promise<void> {
  await recordError({ kind: 'client', ...input });
}
