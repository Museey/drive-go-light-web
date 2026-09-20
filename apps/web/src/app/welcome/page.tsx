import { Landing } from '@/components/landing';
import { landingMetadata } from '@/components/landing-meta';

/**
 * หน้าแนะนำระบบแบบเปิดตรง ๆ — เห็นเหมือนกันไม่ว่าจะล็อกอินอยู่หรือไม่
 *
 * มีไว้เพราะคนที่ล็อกอินค้างอยู่จะไม่มีวันเห็นหน้านี้ที่ `/` (ที่นั่นเป็นหน้าแรกของระบบ)
 * เจ้าของอู่จึงส่งลิงก์นี้ให้เพื่อนอู่อื่นดูได้ และเราเอาไว้ตรวจหน้าตาได้โดยไม่ต้องออกจากระบบ
 *
 * ไม่มี `dynamic = 'force-dynamic'` — ทั้งหน้าเป็นข้อความคงที่ ไม่แตะคุกกี้และฐานข้อมูล
 * ปล่อยให้ Next สร้างเป็นหน้าคงที่ไปเลย เปิดเร็วและไม่ล่มตามฐานข้อมูล
 */
export const metadata = landingMetadata;

export default function WelcomePage() {
  return <Landing />;
}
