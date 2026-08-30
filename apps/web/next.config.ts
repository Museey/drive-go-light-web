import type { NextConfig } from 'next';

const config: NextConfig = {
  // pg เป็นไลบรารีฝั่ง server ล้วน ห้ามให้ bundler แตะ
  serverExternalPackages: ['pg'],
  /* typedRoutes ตรวจลิงก์ที่เขียนตายตัวได้ดี แต่ redirect ที่ประกอบ URL ตอน runtime
     (เช่น /setup/<token>?error=<ข้อความ>) มันตรวจไม่ได้ ต้องใส่ cast ทุกจุดจนอ่านยาก
     เปิดกลับได้เมื่อเส้นทางนิ่งแล้ว */
  typedRoutes: false,
};

export default config;
