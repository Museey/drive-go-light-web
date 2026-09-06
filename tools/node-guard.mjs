/**
 * ตรวจรุ่น Node แล้วโหลดตัวจริงต่อ
 *
 * เครื่องมือของเราใช้ไวยากรณ์ใหม่ (top-level await · optional chaining) ซึ่ง Node เก่า
 * **อ่านไฟล์ไม่ออกตั้งแต่ตอน parse** — จะพังด้วย SyntaxError ที่ชี้ไปบรรทัดสุ่ม ๆ
 * และไม่มีทางรู้เลยว่าสาเหตุจริงคือรุ่น Node
 *
 * ตัวตรวจจึงต้องอยู่ในไฟล์ที่ Node เก่า parse ผ่าน แล้วค่อยโหลดตัวจริงทีหลัง
 * ไฟล์นี้จึงใช้ได้แค่ไวยากรณ์เก่า ๆ เท่านั้น ห้ามใส่ของใหม่ลงไป
 */
export function requireNode(min, then) {
  var major = Number(process.versions.node.split('.')[0]);
  if (major < min) {
    console.error('ต้องใช้ Node ' + min + ' ขึ้นไป (ตอนนี้ ' + process.version + ')');
    console.error('ถ้าใช้ nvm ให้สั่ง  nvm use 22  ก่อน แล้วรันใหม่');
    console.error('เช็คว่ากำลังใช้ตัวไหนด้วย  which node');
    process.exit(2);
  }
  return import(then);
}
