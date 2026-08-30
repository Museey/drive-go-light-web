import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // เทสต์ที่แตะฐานข้อมูลล้างสคีมา auth ใหม่ตอนเริ่ม จึงรันทีละไฟล์
    fileParallelism: false,
    environment: 'node',
  },
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
});
