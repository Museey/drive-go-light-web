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
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
});
