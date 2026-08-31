/**
 * @drivegolight/core
 *
 * สูตรคำนวณเงินและภาษีทั้งหมดของ DriveGoLight! แยกออกมาเป็น TypeScript ล้วน
 * ไม่พึ่ง DOM ไม่พึ่งฐานข้อมูล ไม่พึ่ง global ใด ๆ
 *
 * เหตุผลที่ต้องแยก: เว็บ (Next.js) และไฟล์ HTML แบบ offline ต้องใช้สูตรชุดเดียวกัน
 * ถ้าปล่อยให้มีสองชุด วันหนึ่งเลขภาษีจะไม่ตรงกันแล้วหาสาเหตุไม่เจอ
 *
 * ทุกฟังก์ชันในนี้พอร์ตตรงจาก drivegolight.html v3.6 และมีเทสต์เทียบผลกับโค้ดเดิม
 * (test/differential.test.ts) — ถ้าจะแก้พฤติกรรม ต้องแก้เทสต์พร้อมกันและรู้ตัวว่ากำลังทำอะไร
 */
export * from './types.js';
export * from './num.js';
export * from './date.js';
export * from './totals.js';
export * from './payments.js';
export * from './vat.js';
export * from './pl.js';
export * from './expense-cats.js';
export * from './stock.js';
export * from './doc-check.js';
export * from './bahttext.js';
