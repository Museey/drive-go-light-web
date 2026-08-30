import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * เทสต์ทุกไฟล์ในแพ็กเกจนี้ใช้ฐานข้อมูลเดียวกัน และแต่ละไฟล์ล้างสคีมาใหม่ตอนเริ่ม
     * ถ้าปล่อยให้รันขนานกันจะล้างทับกันกลางคัน — ต้องรันทีละไฟล์
     */
    fileParallelism: false,
  },
});
