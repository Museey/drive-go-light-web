import { defineConfig, devices } from '@playwright/test';

/**
 * เทสต์ที่ต้องเปิดเบราว์เซอร์จริง — เรื่องการทับกันของเมนู
 *
 * เทสต์ที่อ่านไฟล์ CSS บอกได้แค่ว่า "เขียนกฎไว้แล้ว" ไม่ได้บอกว่า
 * **ผลลัพธ์บนจอจริงไม่ทับกัน** ซึ่งเป็นคำถามที่เราต้องการคำตอบ
 * เรื่องนี้ต้องวัดกรอบของจริงจากเบราว์เซอร์เท่านั้น
 *
 * **เบราว์เซอร์** ปกติ Playwright ดาวน์โหลด Chromium ของตัวเองมาใช้
 * เครื่องนี้ต่อ CDN ของ Playwright ไม่ได้ (หมดเวลาทุกครั้ง) จึงใช้เบราว์เซอร์
 * ที่ติดตั้งอยู่แล้วในเครื่องแทน — ตั้งได้ด้วย PW_CHANNEL
 *
 *   npm run e2e                      ใช้ Edge Dev ที่มีในเครื่อง
 *   PW_CHANNEL=chrome npm run e2e    ถ้ามี Chrome
 *   npx playwright install chromium  ถ้าเน็ตดีแล้วอยากใช้ของ Playwright เอง
 *   (แล้วตั้ง PW_CHANNEL=  ให้ว่าง)
 *
 * ทั้งสามขนาดจอรันสเปกชุดเดียวกัน — ข้อที่ผ่านบนเดสก์ท็อปแต่ทับกันบนมือถือ
 * จะแดงทันที ซึ่งเป็นความผิดพลาดที่เกิดบ่อยที่สุดในงานแบบนี้
 */
const channel = process.env.PW_CHANNEL ?? 'msedge-dev';
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: 'มือถือ', use: { viewport: { width: 375, height: 812 } } },
    { name: 'แท็บเล็ต', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'เดสก์ท็อป', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
