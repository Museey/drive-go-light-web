import { isUuid } from '@/lib/ids';
import { isSavedKind } from '@/lib/saved-target';
import { loadSavedSummary } from '@/lib/saved';
import { SavedCard } from './saved-card';

/**
 * วางไว้ในหน้าที่การบันทึกพากลับมา — อ่าน saved / savedId แล้วแสดงการ์ดบันทึกแล้ว
 *
 * ข้อมูลในการ์ดอ่านจากฐานผ่านสิทธิ์และอู่ของผู้ใช้ตามปกติ
 * ชนิดไม่รู้จัก · id ไม่ใช่ uuid · ไม่พบ (รวมของอู่อื่น) = ไม่แสดงอะไร
 */
export async function SavedNotice({ saved, savedId }: { saved?: string; savedId?: string }) {
  if (!isSavedKind(saved) || !savedId || !isUuid(savedId)) return null;
  const s = await loadSavedSummary(saved, savedId);
  /* key ตามใบ — บันทึกใบถัดไปติดกัน การ์ดต้องเริ่มนับ 2 วินาทีใหม่ ไม่ใช่ใช้ state ของใบก่อน */
  return s ? <SavedCard key={`${saved}:${savedId}`} s={s} /> : null;
}
