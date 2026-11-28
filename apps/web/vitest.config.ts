import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // เทสต์ที่แตะฐานข้อมูลล้างสคีมา auth ใหม่ตอนเริ่ม จึงรันทีละไฟล์
    fileParallelism: false,
    environment: 'node',
    // เทสต์ใน e2e/ เป็นของ Playwright ซึ่งใช้ตัวรันคนละตัว — `npm run e2e`
    // ต้องกันไว้ ไม่งั้น vitest หยิบไปรันแล้วแดงทั้งที่ไฟล์ไม่มีอะไรผิด
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    /* fileURLToPath ไม่ใช่ .pathname — .pathname คืน /C:/... บน Windows และคง %20 ไว้เมื่อโฟลเดอร์มีช่องว่าง
       alias จึงชี้ไปที่ที่ไม่มีอยู่จริง แล้วเทสต์ที่ import ผ่าน @/ ล้มทั้งไฟล์ */
    alias: { '@': fileURLToPath(new URL('./src/', import.meta.url)) },
  },
});
