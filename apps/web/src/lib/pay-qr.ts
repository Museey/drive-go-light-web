import 'server-only';
import QRCode from 'qrcode';
import { promptPayPayload } from '@drivegolight/core';

/**
 * คิวอาร์รับเงินบนเอกสาร (040) — สร้างตอนเปิดหน้าพิมพ์ ไม่เก็บรูปไว้ที่ไหน
 *
 * ยอดในคิวอาร์ = **ยอดที่ยังค้างของใบนั้น ณ ตอนพิมพ์** ลูกค้าสแกนแล้วไม่ต้องพิมพ์ยอดเอง
 * ใบที่จ่ายครบแล้ว ใบที่ยกเลิก และอู่ที่ยังไม่ได้ตั้งเลขพร้อมเพย์ ไม่มีคิวอาร์
 * (คิวอาร์บนใบที่จ่ายแล้วชวนให้ลูกค้าโอนซ้ำ)
 *
 * รูปเป็น SVG ฝังเป็น data URI — พิมพ์คมทุกขนาด และผ่านนโยบาย img-src 'self' data: ที่ตั้งไว้
 * โดยไม่ต้องเปิดโดเมนภายนอก · ข้อความในคิวอาร์มาจาก core (promptpay.ts) ซึ่งมีชุดทดสอบของตัวเอง
 */

export interface PayQr {
  /** รูปคิวอาร์ ใช้เป็น src ของ <img> ได้ทันที */
  dataUri: string;
  /** ยอดที่ล็อกไว้ในคิวอาร์ (บาท) */
  amount: number;
  /** เลขพร้อมเพย์ที่รับเงิน — พิมพ์กำกับใต้รูปให้ลูกค้าเทียบกับชื่อบัญชีที่แอปธนาคารแสดง */
  promptpayId: string;
}

export interface PayQrShop {
  promptpayId: string;
  qrOnInvoice: boolean;
  qrOnReceipt: boolean;
}

export async function payQrFor(
  shop: PayQrShop,
  doc: { kind: string; status: string; payable: number; payments: { amount: number }[] },
): Promise<PayQr | null> {
  const wanted =
    ((doc.kind === 'IV' || doc.kind === 'IVT') && shop.qrOnInvoice) ||
    (doc.kind === 'RC' && shop.qrOnReceipt);
  if (!wanted || doc.status === 'void') return null;

  const paid = doc.payments.reduce((s, p) => s + p.amount, 0);
  const amount = Math.round((doc.payable - paid) * 100) / 100;
  if (!(amount > 0.004)) return null;

  const payload = promptPayPayload(shop.promptpayId, amount);
  if (!payload) return null;

  const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return {
    dataUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    amount,
    promptpayId: shop.promptpayId,
  };
}
