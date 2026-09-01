import type { CSSProperties } from 'react';

/**
 * ชุดไอคอนของรุ่น 6.4
 *
 * ยกมาจาก IC ในไฟล์ต้นฉบับคำต่อคำ — เส้น path ไม่ได้แก้แม้แต่จุดเดียว
 * เปลี่ยนแค่รูปแบบการเรียกใช้ให้เป็นคอมโพเนนต์ React แทนการต่อสตริง HTML
 *
 * ทุกตัวเป็น viewBox 48×48 วาดด้วยเส้น ไม่ระบายพื้น จึงรับสีจากข้างนอกได้
 * และคมทุกขนาดโดยไม่ต้องมีไฟล์รูปหลายความละเอียด
 *
 * เพิ่มไอคอนใหม่ต้องเพิ่มที่นี่ที่เดียว แล้ว menu-map.ts จะอ้างชื่อได้ทันที
 */

type Draw = (color: string) => string;

const PATHS: Record<string, Draw> = {
  /* 01 หน้าแรก — มาตรวัด */
  home: (c: string) => `
    <path d="M8 34a16 16 0 0 1 32 0"/><path d="M8 34h32"/>
    <path d="M24 34 32 20" stroke-width="2.6"/><circle cx="24" cy="34" r="2.6" fill="${c}"/>
    <path d="M13 27h3M32 27h3M24 15v3"/>`,
  /* 02 ลูกค้า */
  people: (c: string) => `
    <circle cx="19" cy="17" r="6"/><path d="M8 39c0-6.1 4.9-11 11-11s11 4.9 11 11"/>
    <path d="M32 12.6a6 6 0 0 1 0 10.8"/><path d="M34 28.6c3.6 1.6 6 5.2 6 9.4"/>`,
  /* 03 รายรับ — เอกสารมีเงิน */
  'doc$': (c: string) => `
    <path d="M12 7h15l9 9v12"/><path d="M27 7v9h9"/><path d="M12 7v34h12"/>
    <path d="M17 20h6M17 26h9"/><circle cx="33" cy="34" r="7"/>
    <path d="M33 30.5v7M35 32h-3a1.6 1.6 0 0 0 0 3.2h2a1.6 1.6 0 0 1 0 3.2h-3" stroke-width="1.7"/>`,
  /* 04 รายจ่าย — ตะกร้า */
  cart: (c: string) => `
    <path d="M6 9h5l4.6 20.4a3 3 0 0 0 3 2.3h13.7a3 3 0 0 0 3-2.3L39 15H13"/>
    <circle cx="19" cy="39" r="2.7"/><circle cx="34" cy="39" r="2.7"/>`,
  /* 05 สินค้า — กล่อง */
  box: (c: string) => `
    <path d="M24 6 40 14v20L24 42 8 34V14z"/><path d="M8 14l16 8 16-8"/>
    <path d="M24 22v20"/><path d="M16 10l16 8"/>`,
  /* 06 การเงิน — กราฟ */
  chart: (c: string) => `
    <path d="M8 40V8"/><path d="M8 40h32"/>
    <rect x="14" y="27" width="5.4" height="9" rx="1.2" fill="${c}" stroke="none"/>
    <rect x="23" y="21" width="5.4" height="15" rx="1.2" fill="${c}" stroke="none"/>
    <rect x="32" y="14" width="5.4" height="22" rx="1.2" fill="${c}" stroke="none"/>
    <path d="M14 20l9-7 8 5 7-8" stroke-width="2.3"/><path d="M38 10h-5M38 10v5"/>`,
  /* 07 ตั้งค่า */
  gear: (c: string) => `
    <path d="M20.2 12.0 L20.2 7.4 L27.8 7.4 L27.8 12.0 L29.8 12.8 L33.0 9.6 L38.4 15.0 L35.2 18.2 L36.0 20.2 L40.6 20.2 L40.6 27.8 L36.0 27.8 L35.2 29.8 L38.4 33.0 L33.0 38.4 L29.8 35.2 L27.8 36.0 L27.8 40.6 L20.2 40.6 L20.2 36.0 L18.2 35.2 L15.0 38.4 L9.6 33.0 L12.8 29.8 L12.0 27.8 L7.4 27.8 L7.4 20.2 L12.0 20.2 L12.8 18.2 L9.6 15.0 L15.0 9.6 L18.2 12.8 Z" stroke-linejoin="round"/><circle cx="24" cy="24" r="6.4"/>`,
  /* 05.5 ตรวจนับ — กระดานเช็กของ */
  tally: (c: string) => `
    <path d="M18 9h-3.5a3 3 0 0 0-3 3v25a3 3 0 0 0 3 3h19a3 3 0 0 0 3-3V12a3 3 0 0 0-3-3H30"/>
    <rect x="18" y="5.5" width="12" height="7" rx="2.4"/>
    <path d="M16.8 24.6l3.5 3.5 7.2-7.2"/><path d="M16.8 33.6h14.4"/>`,
  /* 08 ลิขสิทธิ์ — โล่ */
  shield: (c: string) => `
    <path d="M24 5l15 6v11c0 10-6.4 17.4-15 21-8.6-3.6-15-11-15-21V11z"/>
    <path d="M17 24l5 5 10-10" stroke-width="2.6"/>`,
  /* ---- เมนูย่อย ---- */
  quote: (c: string) => `
    <path d="M11 6h17l9 9v27H11z"/><path d="M28 6v9h9"/>
    <path d="M16 22h16M16 28h16M16 34h10"/>`,
  truck: (c: string) => `
    <path d="M4 12h22v18H4z"/><path d="M26 18h7l6 6v6h-13z"/>
    <circle cx="13" cy="35" r="3.4"/><circle cx="33" cy="35" r="3.4"/><path d="M16.4 35h13.2"/>`,
  stack: (c: string) => `
    <path d="M9 12h30v8H9zM9 22h30v8H9zM9 32h30v8H9z"/>
    <path d="M14 16h4M14 26h4M14 36h4"/>`,
  receipt: (c: string) => `
    <path d="M11 5h26v38l-5-3-4 3-4-3-4 3-4-3-5 3z"/>
    <path d="M17 16h14M17 23h14M17 30h8"/>`,
  receipts: (c: string) => `
    <path d="M7 10h22v30l-4-2.5L21 40l-4-2.5L13 40l-3-2z" opacity=".5"/>
    <path d="M17 6h24v34l-4.5-2.8-4 2.8-4-2.8-4 2.8-4-2.8-3.5 2.5z"/>
    <path d="M23 17h12M23 24h12M23 30h7"/>`,
  buy: (c: string) => `
    <path d="M8 12h6l3.6 16.2a2.6 2.6 0 0 0 2.6 2h13a2.6 2.6 0 0 0 2.6-2L39 17H15"/>
    <circle cx="20" cy="37" r="2.5"/><circle cx="33" cy="37" r="2.5"/>
    <path d="M27 6v9M23 10.5l4 4.5 4-4.5"/>`,
  bill: (c: string) => `
    <path d="M11 6h26v36H11z"/><path d="M17 15h14M17 22h14M17 29h9"/>
    <path d="M28 33h9" stroke-width="2.6"/>`,
  coins: (c: string) => `
    <ellipse cx="24" cy="13" rx="13" ry="5.2"/>
    <path d="M11 13v9c0 2.9 5.8 5.2 13 5.2s13-2.3 13-5.2v-9"/>
    <path d="M11 22v9c0 2.9 5.8 5.2 13 5.2s13-2.3 13-5.2v-9"/>`,
  folder: (c: string) => `
    <path d="M6 12h13l4 5h19v24H6z"/><path d="M6 22h36"/>`,
  tags: (c: string) => `
    <path d="M6 10h18l18 14-18 14H6z"/><circle cx="15" cy="24" r="2.8" fill="${c}" stroke="none"/>
    <path d="M26 18l7 6-7 6" opacity=".55"/>`,
  pending: (c: string) => `
    <circle cx="24" cy="24" r="17"/><path d="M24 14v10l7 5" stroke-width="2.5"/>
    <path d="M38 10l4-4M10 10 6 6" opacity=".5"/>`,
  claim: (c: string) => `
    <path d="M12 6h17l9 9v27H12z"/><path d="M29 6v9h9"/>
    <circle cx="31" cy="33" r="8" fill="#fff"/><path d="M28 30l6 6M34 30l-6 6" stroke-width="2.4"/>`,
  sales: (c: string) => `
    <path d="M7 38V10"/><path d="M7 38h34"/>
    <path d="M12 32l8-9 7 5 11-13" stroke-width="2.5"/><path d="M32 15h6v6"/>`,
  ar: (c: string) => `
    <circle cx="18" cy="16" r="6.5"/><path d="M6 38c0-6.6 5.4-12 12-12 2.4 0 4.6.7 6.4 1.9"/>
    <circle cx="34" cy="32" r="9"/><path d="M34 27.5v9M36.4 29.6h-3.6a1.7 1.7 0 0 0 0 3.4h2a1.7 1.7 0 0 1 0 3.4h-3.6" stroke-width="1.7"/>`,
  ap: (c: string) => `
    <path d="M6 14h30v20H6z"/><circle cx="21" cy="24" r="5"/>
    <path d="M40 18v20H12" opacity=".55"/><path d="M12 20h1M29 28h1"/>`,
  pl: (c: string) => `
    <path d="M11 6h26v36H11z"/><path d="M17 16h14M17 24h9"/>
    <path d="M17 33h6M29 36l4-5 5 3" stroke-width="2.4"/>`,
  /* ---- ปุ่มทำงาน ---- */
  addUser: (c: string) => `
    <circle cx="19" cy="16" r="7"/><path d="M6 40c0-7.2 5.8-13 13-13 2.2 0 4.3.5 6.1 1.5"/>
    <circle cx="35" cy="32" r="8"/><path d="M35 28v8M31 32h8" stroke-width="2.4"/>`,
  addShop: (c: string) => `
    <path d="M7 42V10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v32"/>
    <path d="M4 42h27"/><path d="M13 42v-8h8v8"/>
    <path d="M12.5 14h3.4M18.5 14h3.4M12.5 20h3.4M18.5 20h3.4M12.5 26h3.4M18.5 26h3.4"/>
    <circle cx="37" cy="33" r="7.5" fill="#fff"/><path d="M37 29.2v7.6M33.2 33h7.6" stroke-width="2.3"/>`,
  addBox: (c: string) => `
    <path d="M22 8 36 15v14l-14 7-14-7V15z"/><path d="M8 15l14 7 14-7"/><path d="M22 22v14"/>
    <circle cx="37" cy="35" r="7.5"/><path d="M37 31.2v7.6M33.2 35h7.6" stroke-width="2.3"/>`,
  printer: (c: string) => `
    <path d="M14 18V7h20v11"/><path d="M10 18h28a4 4 0 0 1 4 4v10h-8v9H14v-9H6V22a4 4 0 0 1 4-4z"/>
    <path d="M20 27h8M20 33h8"/><circle cx="35" cy="24" r="1.6" fill="${c}" stroke="none"/>`,
  blank: (c: string) => `
    <path d="M13 6h16l8 8v28H13z" stroke-dasharray="4 3"/><path d="M29 6v8h8"/>
    <path d="M20 24h10M20 31h10" opacity=".55"/>`,
  tools: (c: string) => `
    <path d="M30 6a9 9 0 0 0-8.4 12.2L7 32.8a4 4 0 1 0 5.6 5.6L27.2 24A9 9 0 1 0 30 6z"/>
    <path d="M33 12l4 4-3 3-4-4z" fill="${c}" stroke="none"/>`,
  seeUser: (c: string) => `
    <circle cx="18" cy="15" r="6.5"/><path d="M6 36c0-6.6 5.4-12 12-12 1.6 0 3.2.3 4.6.9"/>
    <circle cx="32" cy="30" r="7.5"/><path d="M37.5 35.5 44 42" stroke-width="2.6"/>`,
  seeShop: (c: string) => `
    <path d="M6 40V10a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v30"/>
    <path d="M3 40h25"/><path d="M12 40v-7h7v7"/>
    <path d="M11 14h3.2M17 14h3.2M11 20h3.2M17 20h3.2M11 26h3.2M17 26h3.2"/>
    <circle cx="33" cy="28" r="7.5" fill="#fff"/><path d="M38.5 33.5 45 40" stroke-width="2.6"/>`,
  listp: (c: string) => `
    <path d="M8 10h32M8 20h32M8 30h22M8 38h22"/>
    <circle cx="35" cy="35" r="6.5"/><path d="M35 32v3.4l2.4 1.6" stroke-width="1.9"/>`,
};

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({
  name, color = 'currentColor', size = 28, style,
}: {
  name: IconName;
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  const draw = PATHS[name];
  if (!draw) return null;

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
      /* เส้น path ยกมาจากต้นฉบับโดยตรง ไม่ได้มาจากผู้ใช้ */
      dangerouslySetInnerHTML={{ __html: draw(color) }}
    />
  );
}
