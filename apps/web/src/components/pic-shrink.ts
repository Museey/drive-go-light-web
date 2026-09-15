import { PIC_EDGE, PIC_QUALITY, THUMB_EDGE } from '@/lib/pics-core';

/**
 * ย่อรูปที่เบราว์เซอร์ด้วย canvas — วิธีเดียวกับรุ่น 6.4
 *
 * ทำฝั่งนี้เพราะไม่ต้องลง sharp ซึ่งเป็นโมดูล native ที่ทำให้ build บนเครื่อง
 * ผู้ให้บริการเปราะขึ้นอีกชั้น และเพราะรูปจากมือถือขนาด 5 MB ไม่ต้องวิ่งขึ้นเน็ตทั้งก้อน
 *
 * เซิร์ฟเวอร์ตรวจไบต์จริงซ้ำอยู่ดี ตรงนี้เป็นแค่ความสะดวก ไม่ใช่ด่านความปลอดภัย
 * ใช้ร่วมกันระหว่างกล่องรูปหน้าสินค้า (pic-panel) กับฟอร์มเพิ่มสินค้าใหม่
 */
export async function shrink(file: File, edge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้');
    /* รูปโปร่งใสที่แปลงเป็น JPEG จะได้พื้นดำ ทาขาวรองไว้ก่อน */
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    return await new Promise<Blob>((res, rej) => {
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error('ย่อรูปไม่สำเร็จ'))),
        'image/jpeg', PIC_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}

/**
 * ย่อรูปเต็ม + รูปย่อ แล้วใส่ลงช่องไฟล์ซ่อนสองช่อง เพื่อส่งไปพร้อมฟอร์ม
 * คืน URL ของรูปเต็มไว้แสดงตัวอย่าง (ผู้เรียกต้อง revoke เองเมื่อไม่ใช้)
 */
export async function shrinkInto(
  file: File, fullInput: HTMLInputElement | null, thumbInput: HTMLInputElement | null,
): Promise<string> {
  const [full, thumb] = await Promise.all([shrink(file, PIC_EDGE), shrink(file, THUMB_EDGE)]);
  const put = (input: HTMLInputElement | null, blob: Blob, name: string) => {
    const dt = new DataTransfer();
    dt.items.add(new File([blob], name, { type: 'image/jpeg' }));
    if (input) input.files = dt.files;
  };
  put(fullInput, full, 'full.jpg');
  put(thumbInput, thumb, 'thumb.jpg');
  return URL.createObjectURL(full);
}
