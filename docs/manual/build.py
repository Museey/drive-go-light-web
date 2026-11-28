# -*- coding: utf-8 -*-
"""สร้างคู่มือ (manual.html → PDF) และสไลด์ (slides.html) จากเนื้อหาชุดเดียวกัน
รัน:  python -I build.py   (อยู่ในโฟลเดอร์ docs/manual)"""
import base64, html, io, os

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = 'ฉบับวันที่ 26 พฤศจิกายน 2569'

# name, group, title, lead, steps[], note, shot, callout(x1,y1,x2,y2 เป็น % ของภาพ)
T = [
 dict(g='หน้าแรก', t='หน้าแรกโฉมใหม่ — เห็นยอดขายทั้งปีในจอเดียว',
      lead='การ์ดแต่ละใบมีสีประจำเรื่อง ตัวอักษรใหญ่ขึ้น (ขั้นต่ำ 14) และกราฟยอดขายเปลี่ยนเป็น 12 เดือนเทียบกับปีก่อน',
      steps=['แท่งสีน้ำเงิน = ยอดขายปีนี้ · แท่งสีส้ม = เดือนเดียวกันของปีก่อน',
             'ตัวเลขใต้หัวกราฟบอกยอดรวม 12 เดือน และเปอร์เซ็นต์ที่เพิ่มหรือลดจากปีก่อน',
             'เลือกช่วงเวลาที่แถบด้านบน (ทั้งหมด · วันนี้ · เดือนนี้ · ปีนี้) การ์ดทุกใบเปลี่ยนตาม'],
      note='', shot='01-home', box=(1, 52, 49, 80)),
 dict(g='หน้าแรก', t='การ์ด "เอกสารที่ออก" — เลือกดูทีละประเภท',
      lead='รายงานสรุปเอกสารที่ออกในช่วงเวลาที่เลือก เปิดมาครั้งแรกเป็นใบเสนอราคา',
      steps=['กดช่องเลือกมุมขวาบนของการ์ด แล้วเลือกประเภทเอกสารที่ต้องการดู',
             'การ์ดแสดงจำนวนใบ ยอดรวม และแยกตามสถานะ เช่น รออนุมัติ ออกใบต่อแล้ว ยกเลิก',
             'กดลิงก์ท้ายการ์ดเพื่อเปิดรายการเอกสารประเภทนั้น'],
      note='', shot='01-home', box=(51, 27, 99, 80)),
 dict(g='ทะเบียนรถ', t='ค้นลูกค้าด้วยเลขทะเบียน 2–4 ตัว',
      lead='ช่อง "ชื่อลูกค้า" บนหน้าออกเอกสาร ค้นได้ทั้งชื่อ รหัส เบอร์โทร และเลขทะเบียนรถ',
      steps=['พิมพ์เลขทะเบียนเพียง 2, 3 หรือ 4 ตัว (หรือหมวดอักษร) ลงในช่องชื่อลูกค้า',
             'ลูกค้าเจ้าของรถขึ้นให้เลือก ป้ายทะเบียนที่ตรงคำค้นขึ้นก่อนและเป็นพื้นสีเหลือง',
             'กดเลือกลูกค้า ระบบดึงชื่อ ที่อยู่ เบอร์โทร และรถคันที่ค้นขึ้นใบให้ทันที'],
      note='ลูกค้าที่มีรถหลายคัน ระบบเลือกคันที่ตรงกับเลขที่พิมพ์ ไม่ใช่คันแรกเสมอเหมือนเดิม',
      shot='02-search-plate', box=(1, 30, 50, 64)),
 dict(g='ทะเบียนรถ', t='ป้ายทะเบียนรถเด่นชัดทุกหน้า',
      lead='ทะเบียนรถแสดงเป็นป้ายกรอบเข้ม พื้นขาว ตัวหนา หน้าตาเดียวกันทั้งระบบ',
      steps=['หน้าออกเอกสาร: ป้ายใหญ่ตรงหัวข้อ "รถที่เข้ารับบริการ" บอกว่ากำลังออกใบให้รถคันไหน',
             'รายการเอกสารและทะเบียนลูกค้า: ป้ายอยู่ในแถว กวาดตาหาทะเบียนได้เร็ว',
             'ป้ายที่กดได้จะพาไปหน้าประวัติของรถคันนั้น'],
      note='', shot='03-vehicle-picked', box=(1, 42, 34, 52)),
 dict(g='ออกเอกสาร', t='ลูกค้าหน้าร้านรายใหม่ — กรอกแล้วบันทึกเข้าทะเบียนได้เลย',
      lead='ลูกค้าที่ยังไม่มีในฐานข้อมูล ไม่ต้องไปเพิ่มที่ทะเบียนลูกค้าก่อน',
      steps=['พิมพ์ชื่อ ที่อยู่ เบอร์โทร และข้อมูลรถลงในการ์ดข้อมูลลูกค้าตามปกติ',
             'ติ๊ก "บันทึกเป็นลูกค้าใหม่ในทะเบียน" ใต้ช่องชื่อลูกค้า',
             'กดบันทึกเอกสาร ระบบสร้างลูกค้าและรถในทะเบียนให้พร้อมกับเอกสาร'],
      note='ไม่ติ๊ก = ข้อมูลอยู่บนเอกสารใบนั้นเท่านั้น ไม่เข้าทะเบียนลูกค้า',
      shot='02-search-plate', box=(1, 44, 30, 52)),
 dict(g='ออกเอกสาร', t='ออกเอกสารต่อเนื่อง — ปุ่ม "ออกใบถัดไป" หลังบันทึก',
      lead='บันทึกเสร็จแล้วออกใบถัดไปของชุดเดียวกันได้ในคลิกเดียว ไม่ต้องไปเมนูใหม่แล้วเลือกใบต้นทาง',
      steps=['บันทึกเอกสาร การ์ด "บันทึกเอกสารเรียบร้อย" ขึ้นกลางจอ',
             'กดปุ่มใต้หัวข้อ "ออกเอกสารต่อจากใบนี้" เช่น ออกใบส่งมอบงาน หรือ ออกใบเสร็จรับเงิน',
             'ฟอร์มใบถัดไปเปิดพร้อมข้อมูลลูกค้า รถ และรายการจากใบเดิม และอ้างอิงเลขที่ใบเดิมให้'],
      note='ลำดับชุดเอกสาร: ใบเสนอราคา → ใบส่งมอบงาน/ใบกำกับภาษี → ใบเสร็จรับเงิน (ข้ามขั้นได้)',
      shot='04-saved-next', box=(36, 65, 64, 80)),
 dict(g='ออกเอกสาร', t='หน้าเอกสาร — แถบขั้นตอน A → B → C',
      lead='เปิดเอกสารใบใดก็เห็นว่าชุดนี้ไปถึงขั้นไหน และกดออกใบถัดไปได้จากหน้านั้น',
      steps=['ขั้นสีเขียวเข้ม = ใบที่กำลังดู · ขั้นที่มีเลขที่ = ออกแล้ว กดเพื่อเปิดใบนั้น',
             'ขั้นสีเหลือง = ขั้นถัดไปที่ยังไม่ได้ออก กดเพื่อออกใบต่อ',
             'ใบส่งมอบที่ยังไม่มีใบเสร็จ มีแถบเตือนพร้อมปุ่ม "ออกใบเสร็จรับเงิน"'],
      note='', shot='05-doc-page', box=(1, 16, 99, 26)),
 dict(g='ออกเอกสาร', t='กติกาใหม่: ใบที่ออกใบต่อไปแล้ว แก้ไม่ได้',
      lead='เพื่อให้เอกสารในชุดเดียวกันบอกยอดตรงกันเสมอ การแก้ไขต้องทำที่ใบปลายสาย',
      steps=['กด "แก้ไข" ที่ใบซึ่งออกใบต่อไปแล้ว ระบบบอกเลขที่ใบต่อที่ต้องไปจัดการ',
             'ทางเลือกที่ 1: เปิดใบต่อใบนั้นแล้วแก้ที่นั่น (ถ้าใบนั้นยังแก้ได้)',
             'ทางเลือกที่ 2: ยกเลิกใบต่อก่อน แล้วกลับมาแก้ใบนี้ จากนั้นออกใบต่อใหม่'],
      note='ใบเสร็จรับเงินและใบที่รับเงินแล้วแก้ไม่ได้เหมือนเดิม ต้องยกเลิกแล้วออกใหม่ · ใบส่งมอบที่มีใบเสร็จอยู่ ยกเลิกเดี่ยว ๆ ไม่ได้ ต้องยกเลิกใบเสร็จก่อนหรือยกเลิกทั้งสาย',
      shot='06-edit-locked', box=(72, 9, 100, 27)),
 dict(g='รายการ', t='รายการเอกสารแบบใหม่',
      lead='แถวเตี้ยลง อ่านง่ายขึ้น สถานะและตัวเลขที่เกี่ยวข้องอยู่ในช่องเดียว',
      steps=['ป้ายทะเบียนรถอยู่เหนือชื่อลูกค้าในทุกแถว',
             'ช่องสถานะ: ป้ายสีบอกสถานะ บรรทัดเล็กบอกยอดค้างและวันครบกำหนด',
             'ปุ่ม รับชำระ · แก้ไข · พิมพ์ · ลบ เรียงบรรทัดเดียวท้ายแถว'],
      note='แถบสรุปเหนือรายการ (เมื่อเลือกประเภทเอกสาร) กดเพื่อกรอง เช่น เฉพาะใบค้างชำระ หรือเกินกำหนด',
      shot='07-doc-list', box=(23, 40, 45, 97)),
 dict(g='รายการ', t='ทะเบียนลูกค้าแบบใหม่',
      lead='เห็นภาพรวมลูกค้าและยอดค้างชำระก่อนไล่รายชื่อ',
      steps=['แถบสรุปด้านบน: จำนวนลูกค้า · ลูกค้าที่มียอดค้าง · ยอดค้างรวม กดเพื่อกรองรายชื่อ',
             'ทุกแถวมีวงกลมอักษรย่อ และป้ายทะเบียนรถ 2 คันแรก (ที่เหลือแสดงเป็น "+N คัน")',
             'ค้นด้วยเลขทะเบียน ระบบขึ้นการ์ดรถคันนั้นไว้บนสุด กดเพื่อดูประวัติรถ'],
      note='', shot='09-customers-plate', box=(1, 44, 99, 58)),
 dict(g='รายงาน', t='รายงานแยกรายได้ — งานซ่อม กับ ขายหน้าร้าน',
      lead='เมนู 06.1 ยอดขาย แยกรายได้ตามช่องทาง และแยกค่าแรงกับค่าอะไหล่/สินค้า',
      steps=['งานซ่อม = เอกสารที่ออกจากเมนูรายรับตามปกติ · ขายหน้าร้าน = ใบเสร็จจากเมนูขายหน้าร้าน',
             'แต่ละช่องทางแสดงจำนวนเอกสาร ค่าแรง ค่าอะไหล่/สินค้า ยอดรวม และสัดส่วน',
             'ตารางเดียวกันอยู่ในหน้าพิมพ์รายงาน และไฟล์ CSV มีคอลัมน์ ช่องทาง · ค่าแรง · ค่าอะไหล่/สินค้า'],
      note='', shot='10-sales-split', box=(1, 33, 99, 68)),
 dict(g='ตั้งค่า', t='ตั้งค่าฐานหัก ณ ที่จ่าย — เฉพาะค่าแรง หรือ ทั้งใบ',
      lead='เมนู 07 ตั้งค่าร้าน เลือกได้ว่าลูกค้านิติบุคคลหักภาษี ณ ที่จ่ายจากยอดไหน',
      steps=['เปิดเมนู ตั้งค่าร้าน เลื่อนไปที่ช่อง "ฐานที่หัก ณ ที่จ่าย"',
             'เลือก "เฉพาะค่าแรง" (ค่าเริ่มต้น) หรือ "ทั้งใบ (ค่าแรง + ค่าอะไหล่)"',
             'กดบันทึก เอกสารที่ออกหลังจากนี้คำนวณตามค่าที่เลือก เอกสารเดิมไม่เปลี่ยน'],
      note='ควรตั้งตามที่ตกลงกับผู้ทำบัญชีของร้าน',
      shot='11-settings-wht', box=(62, 60, 98, 80)),
 dict(g='Light Plus', t='Light Plus: เงินเดือนและพนักงาน',
      lead='เมนู 06 การเงิน → เงินเดือนพนักงาน (เฉพาะแพ็กเกจ Light Plus)',
      steps=['เพิ่มพนักงานที่ "ทะเบียนพนักงาน": ชื่อ ตำแหน่ง เงินเดือน ประกันสังคม และหัก ณ ที่จ่าย',
             'กด "เปิดงวดเงินเดือน" เลือกเดือน ระบบคำนวณเงินได้ ประกันสังคม และภาษีให้ทุกคน',
             'แก้ล่วงเวลาหรือรายการหักรายคนได้ แล้วกด "สลิป" เพื่อพิมพ์สลิปเงินเดือน'],
      note='เงินเดือนยังไม่ถูกนำไปลงรายงานกำไรขาดทุนให้อัตโนมัติ',
      shot='12-payroll', box=(1, 46, 99, 64)),
 dict(g='Light Plus', t='Light Plus: นัดหมายและแจ้งเตือนลูกค้า',
      lead='เมนู 02 ลูกค้า → นัดหมาย / แจ้งเตือนลูกค้า',
      steps=['กด "+ นัดเข้าซ่อม" เพื่อจองคิว หรือ "+ เตือนลูกค้า" เช่น ครบระยะเปลี่ยนน้ำมันเครื่อง ต่อภาษี',
             'เลือกลูกค้า รถ วันเวลา และเรื่องที่นัด แล้วบันทึก',
             'แท็บ วันนี้ · เลยกำหนด · เสร็จ/ยกเลิก ใช้ไล่งาน และทำเครื่องหมาย "แจ้งลูกค้าแล้ว" ได้'],
      note='ระบบไม่ส่ง LINE หรือ SMS ให้เอง ร้านเป็นผู้ติดต่อลูกค้าแล้วมาทำเครื่องหมาย',
      shot='14-appointments', box=(1, 17, 21, 28)),
 dict(g='Light Plus', t='Light Plus: เอกสารภาษี',
      lead='เมนู 06 การเงิน → เอกสารภาษี รวมรายงานที่ต้องใช้ยื่นภาษีรายเดือน',
      steps=['เลือกเดือนที่มุมขวา แล้วเลือกแท็บ: ภาษีขาย · ภาษีซื้อ · ภ.ง.ด.3 · ภ.ง.ด.53 · ภ.ง.ด.1 · ประกันสังคม',
             'ตรวจรายการในตาราง แล้วกด พิมพ์รายงาน หรือ ส่งออก CSV',
             'หนังสือรับรองการหักภาษี (50 ทวิ) ของพนักงาน ออกได้จากแท็บ ภ.ง.ด.1'],
      note='ใช้เป็นข้อมูลประกอบการยื่นแบบ ควรให้ผู้ทำบัญชีตรวจก่อนยื่นจริง',
      shot='15-tax', box=(1, 17, 47, 28)),
]

EXTRA = [
 ('กู้คืนข้อมูลทับของเดิม', 'ต้องเป็นเจ้าของร้านและกรอกรหัสผ่านยืนยันทุกครั้ง (เมนู ตั้งค่าร้าน → นำเข้า/สำรองข้อมูล)'),
 ('ไฟล์สำรองข้อมูล', 'รวมข้อมูล Light Plus แล้ว (นัดหมาย พนักงาน งวดเงินเดือน) — ข้อมูลเงินเดือนส่งออกเฉพาะผู้มีสิทธิ์เมนูเงินเดือน'),
 ('ถังขยะ', 'มีสิทธิ์ของตัวเองแยกจากเมนูอื่น กำหนดได้ว่าพนักงานคนใดเปิดดูได้'),
 ('เปิดใช้พนักงานอีกครั้ง', 'ระบบตรวจจำนวนที่นั่งของแพ็กเกจก่อน ถ้าเต็มจะเปิดไม่ได้'),
 ('ยกเลิกใบส่งมอบที่มีใบเสร็จ', 'ยกเลิกเดี่ยว ๆ ไม่ได้ ต้องยกเลิกใบเสร็จก่อนหรือเลือกยกเลิกทั้งสาย'),
 ('ตรวจนับสต็อก', 'ปิดใบตรวจนับได้แม้ยอดตรงทุกรายการ และปิดได้เมื่อกรอกจำนวนที่นับแล้วอย่างน้อย 1 รายการ'),
 ('กำไรขาดทุนรายเดือน', 'รวมต้นทุนของใบเคลมสินค้าแล้ว'),
 ('วันหมดอายุลิขสิทธิ์', 'นับวันตามเวลาประเทศไทย'),
]

def b64(name):
    with open(os.path.join(HERE, 'shots', name + '.jpg'), 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()

E = html.escape
FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">'
FF = "'IBM Plex Sans Thai','Leelawadee UI','Noto Sans Thai',Tahoma,sans-serif"

def shot_html(t, n):
    x1, y1, x2, y2 = t['box']
    return (f'<figure class="shot"><div class="frame"><img src="{{SRC:{t["shot"]}}}" alt="">'
            f'<i class="box" style="left:{x1}%;top:{y1}%;width:{x2-x1}%;height:{y2-y1}%"><b>{n}</b></i></div></figure>')

# ------------------------------------------------------------------ manual (PDF)
def manual():
    groups = []
    for t in T:
        if t['g'] not in groups: groups.append(t['g'])
    toc = ''.join(f'<li><span>{i+1}</span>{E(t["t"])}<em>{E(t["g"])}</em></li>' for i, t in enumerate(T))
    secs = ''
    for i, t in enumerate(T):
        steps = ''.join(f'<li>{E(s)}</li>' for s in t['steps'])
        note = f'<p class="note"><b>ข้อควรรู้</b> {E(t["note"])}</p>' if t['note'] else ''
        secs += (f'<section class="topic"><div class="tag">{E(t["g"])}</div><h2><span>{i+1}</span>{E(t["t"])}</h2>'
                 f'<p class="lead">{E(t["lead"])}</p>{shot_html(t, i+1)}<h3>วิธีใช้</h3><ol class="steps">{steps}</ol>{note}</section>')
    extra = ''.join(f'<tr><th>{E(a)}</th><td>{E(b)}</td></tr>' for a, b in EXTRA)
    s = f'''<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คู่มือสิ่งที่เพิ่มใหม่ DriveGoLight</title>{FONT}
<style>
@page {{ size: A4; margin: 14mm 14mm 16mm; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: {FF}; color: #14261d; font-size: 11pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.cover {{ height: 262mm; display: flex; flex-direction: column; justify-content: center; padding: 0 8mm; border-left: 6mm solid #0E5A3C; page-break-after: always; }}
.cover .brand {{ font-size: 15pt; font-weight: 700; color: #0E5A3C; letter-spacing: .02em; }}
.cover h1 {{ font-size: 32pt; line-height: 1.2; margin: 6mm 0 4mm; }}
.cover p {{ font-size: 13pt; color: #4a5d53; max-width: 130mm; margin: 0 0 3mm; }}
.cover .ver {{ margin-top: 14mm; font-size: 10.5pt; color: #6b7c73; }}
.plate {{ display: inline-block; border: 2px solid #111827; border-radius: 5px; padding: 0 8px; font-weight: 700; background: #fff; }}
.plate.hit {{ background: #FFE9A6; }}
h1.sec {{ font-size: 18pt; margin: 0 0 4mm; color: #0E5A3C; }}
ol.toc {{ list-style: none; padding: 0; margin: 0; }}
ol.toc li {{ display: flex; gap: 4mm; align-items: baseline; padding: 2.2mm 0; border-bottom: 1px solid #e3e9e5; }}
ol.toc li span {{ width: 7mm; font-weight: 700; color: #0E5A3C; text-align: right; }}
ol.toc li em {{ margin-left: auto; font-style: normal; font-size: 9.5pt; color: #6b7c73; white-space: nowrap; }}
.page {{ page-break-after: always; }}
.topic {{ page-break-after: always; }}
.tag {{ display: inline-block; font-size: 9.5pt; font-weight: 600; color: #0E5A3C; background: #E4F2EA; border-radius: 99px; padding: .5mm 3.5mm; }}
.topic h2 {{ font-size: 17pt; line-height: 1.3; margin: 2.5mm 0 2mm; display: flex; gap: 3.5mm; align-items: baseline; }}
.topic h2 span {{ flex: none; width: 9mm; height: 9mm; border-radius: 50%; background: #0E5A3C; color: #fff; font-size: 12pt; display: inline-grid; place-items: center; transform: translateY(-.5mm); }}
.lead {{ font-size: 12pt; color: #3d5046; margin: 0 0 4mm; }}
.shot {{ margin: 0 0 4.5mm; }}
.frame {{ position: relative; border: 1px solid #c9d4cd; border-radius: 3mm; overflow: hidden; aspect-ratio: 1708 / 930; }}
.frame img {{ display: block; width: 100%; }}
.box {{ position: absolute; border: 2.2px solid #E8590C; border-radius: 2mm; background: rgba(232,89,12,.07); }}
.box b {{ position: absolute; left: -1px; top: -1px; transform: translate(-35%,-45%); width: 6.5mm; height: 6.5mm; border-radius: 50%; background: #E8590C; color: #fff; font-size: 9.5pt; display: grid; place-items: center; font-style: normal; }}
.topic h3 {{ font-size: 12pt; margin: 0 0 1.5mm; color: #0E5A3C; }}
ol.steps {{ margin: 0; padding: 0; list-style: none; counter-reset: s; }}
ol.steps li {{ counter-increment: s; position: relative; padding: 1.8mm 0 1.8mm 10mm; border-bottom: 1px dashed #dbe3de; }}
ol.steps li::before {{ content: counter(s); position: absolute; left: 0; top: 1.9mm; width: 6.2mm; height: 6.2mm; border-radius: 50%; border: 1.5px solid #0E5A3C; color: #0E5A3C; font-weight: 700; font-size: 10pt; display: grid; place-items: center; }}
.note {{ margin: 4mm 0 0; padding: 2.5mm 4mm; background: #FFF6DB; border-left: 1.2mm solid #F2A900; border-radius: 1.5mm; font-size: 10.5pt; }}
.note b {{ color: #8a5a00; margin-right: 2mm; }}
table.extra {{ width: 100%; border-collapse: collapse; }}
table.extra th, table.extra td {{ text-align: left; vertical-align: top; padding: 2.6mm 3mm; border-bottom: 1px solid #e3e9e5; }}
table.extra th {{ width: 52mm; font-weight: 600; color: #0E5A3C; }}
.flow {{ display: flex; gap: 2mm; align-items: center; margin: 4mm 0 6mm; font-size: 10.5pt; }}
.flow div {{ flex: 1; text-align: center; padding: 3mm 2mm; border-radius: 2mm; background: #E4F2EA; font-weight: 600; }}
.flow i {{ font-style: normal; color: #0E5A3C; font-weight: 700; }}
.foot {{ margin-top: 8mm; font-size: 9.5pt; color: #6b7c73; }}
</style></head><body>
<div class="cover"><div class="brand">DriveGoLight! · Light Plus</div>
<h1>คู่มือการใช้งาน<br>สิ่งที่เพิ่มใหม่ในระบบ</h1>
<p>อธิบายเฉพาะส่วนที่เพิ่มหรือเปลี่ยนจากเดิม พร้อมภาพหน้าจอและขั้นตอนใช้งานทีละข้อ</p>
<p><span class="plate">บย 5572</span> &nbsp;<span class="plate hit">ขข 1446</span></p>
<div class="ver">{VERSION} · ภาพหน้าจอใช้ข้อมูลตัวอย่าง</div></div>

<div class="page"><h1 class="sec">สารบัญ</h1><ol class="toc">{toc}
<li><span>{len(T)+1}</span>การเปลี่ยนแปลงอื่นที่ควรทราบ<em>ทั่วไป</em></li></ol>
<h1 class="sec" style="margin-top:9mm">ชุดเอกสารรายรับ</h1>
<div class="flow"><div>A ใบเสนอราคา</div><i>→</i><div>B ใบส่งมอบงาน / ใบกำกับภาษี</div><i>→</i><div>C ใบเสร็จรับเงิน</div></div>
<p>ออกต่อกันเป็นชุดเดียว ข้ามขั้นได้ (เช่น ขายหน้าร้านออกใบเสร็จเลย) การแก้ไขและการยกเลิกทำจากใบปลายสายย้อนขึ้นมา</p></div>
{secs}
<div><h1 class="sec">{len(T)+1}. การเปลี่ยนแปลงอื่นที่ควรทราบ</h1><table class="extra">{extra}</table>
<p class="foot">ฟีเจอร์ในหมวด Light Plus ใช้ได้เฉพาะร้านที่ใช้แพ็กเกจ Light Plus ร้านแพ็กเกจ Light จะเห็นการ์ดแนะนำการอัปเกรดแทน</p></div>
</body></html>'''
    for t in T:
        s = s.replace('{SRC:%s}' % t['shot'], 'shots/%s.jpg' % t['shot'])
    io.open(os.path.join(HERE, 'manual.html'), 'w', encoding='utf-8', newline='').write(s)

# ------------------------------------------------------------------ slides
def slides():
    imgs = {}
    sl = ''
    groups = []
    for t in T:
        if t['g'] not in groups: groups.append(t['g'])
    chips = ''.join(f'<span class="chip a" style="--d:{.25+i*.12}s">{E(g)}</span>' for i, g in enumerate(groups))
    sl += (f'<section class="slide cover"><div class="a" style="--d:.05s"><div class="brand">DriveGoLight! · Light Plus</div></div>'
           f'<h1 class="a" style="--d:.2s">มีอะไรใหม่ในระบบ</h1><p class="a sub" style="--d:.4s">สไลด์แนะนำการใช้งานส่วนที่เพิ่มจากเดิม {len(T)} เรื่อง</p>'
           f'<div class="chips">{chips}</div><p class="a hint" style="--d:1.2s">กด → หรือคลิกเพื่อไปต่อ · กด P เพื่อเล่นอัตโนมัติ</p></section>')
    sl += ('<section class="slide flowslide"><div class="tag a" style="--d:.05s">ภาพรวม</div><h2 class="a" style="--d:.15s">ชุดเอกสารรายรับออกต่อเนื่องกัน</h2>'
           '<div class="flow"><div class="a n" style="--d:.4s"><b>A</b>ใบเสนอราคา</div><i class="a" style="--d:.7s">→</i>'
           '<div class="a n" style="--d:.9s"><b>B</b>ใบส่งมอบงาน / ใบกำกับภาษี</div><i class="a" style="--d:1.2s">→</i>'
           '<div class="a n" style="--d:1.4s"><b>C</b>ใบเสร็จรับเงิน</div></div>'
           '<p class="a sub" style="--d:1.8s">ออกใบถัดไปได้ทันทีหลังบันทึก · ข้ามขั้นได้ · แก้ไขและยกเลิกจากใบปลายสายย้อนขึ้นมา</p></section>')
    for i, t in enumerate(T):
        imgs[t['shot']] = None
        x1, y1, x2, y2 = t['box']
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        steps = ''.join(f'<li class="a" style="--d:{.55+k*.45}s"><span>{k+1}</span>{E(s)}</li>' for k, s in enumerate(t['steps']))
        note = f'<p class="note a" style="--d:{.55+len(t["steps"])*.45}s">{E(t["note"])}</p>' if t['note'] else ''
        sl += (f'<section class="slide topic"><div class="txt"><div class="tag a" style="--d:.05s">{E(t["g"])} · {i+1}/{len(T)}</div>'
               f'<h2 class="a" style="--d:.15s">{E(t["t"])}</h2><p class="lead a" style="--d:.3s">{E(t["lead"])}</p><ol>{steps}</ol>{note}</div>'
               f'<div class="vis a" style="--d:.25s"><div class="win"><div class="bar"><i></i><i></i><i></i></div>'
               f'<div class="frame" style="--ox:{cx}%;--oy:{cy}%"><img data-shot="{t["shot"]}" alt="">'
               f'<i class="box" style="left:{x1}%;top:{y1}%;width:{x2-x1}%;height:{y2-y1}%"></i></div></div></div></section>')
    rows = ''.join(f'<li class="a" style="--d:{.3+k*.18}s"><b>{E(a)}</b><span>{E(b)}</span></li>' for k, (a, b) in enumerate(EXTRA))
    sl += f'<section class="slide extra"><div class="tag a" style="--d:.05s">ทั่วไป</div><h2 class="a" style="--d:.15s">การเปลี่ยนแปลงอื่นที่ควรทราบ</h2><ul>{rows}</ul></section>'
    sl += ('<section class="slide cover end"><h1 class="a" style="--d:.1s">พร้อมใช้งาน</h1>'
           '<p class="a sub" style="--d:.35s">รายละเอียดทีละขั้นตอนอยู่ในคู่มือ PDF ที่แนบมาด้วยกัน</p>'
           '<p class="a hint" style="--d:.8s">กด Home เพื่อกลับไปสไลด์แรก</p></section>')
    data = ',\n'.join(f'"{k}":"{b64(k)}"' for k in imgs)
    s = f'''<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>มีอะไรใหม่ใน DriveGoLight</title>{FONT}
<style>
:root {{ --g:#0E5A3C; --g2:#0A3F2B; --soft:#E4F2EA; --ink:#14261d; --mut:#5a6d63; --amb:#F2A900; --hot:#E8590C; }}
* {{ box-sizing: border-box; }}
html, body {{ height: 100%; margin: 0; }}
body {{ font-family: {FF}; color: var(--ink); background: #EEF3F0; overflow: hidden; }}
.deck {{ position: fixed; inset: 0; }}
.slide {{ position: absolute; inset: 0; padding: clamp(1rem, 3.5vw, 3.5rem); padding-bottom: 4.25rem; display: none; }}
.slide.on {{ display: flex; }}
.a {{ opacity: 0; transform: translateY(1rem); }}
.slide.on .a {{ animation: up .6s cubic-bezier(.2,.7,.2,1) var(--d,0s) forwards; }}
@keyframes up {{ to {{ opacity: 1; transform: none; }} }}
.tag {{ display: inline-block; font-size: clamp(.875rem, 1.1vw, 1rem); font-weight: 600; color: var(--g); background: var(--soft); border-radius: 99px; padding: .2rem .9rem; }}
h1 {{ font-size: clamp(2.25rem, 6vw, 5rem); line-height: 1.15; margin: 1rem 0 .75rem; }}
h2 {{ font-size: clamp(1.5rem, 2.7vw, 2.5rem); line-height: 1.25; margin: .75rem 0 .5rem; text-wrap: balance; }}
.sub {{ font-size: clamp(1.0625rem, 1.7vw, 1.5rem); color: var(--mut); margin: 0; max-width: 46rem; }}
.hint {{ font-size: .9375rem; color: var(--mut); margin-top: 2.5rem; }}
.cover {{ flex-direction: column; justify-content: center; background: linear-gradient(135deg, var(--g2), var(--g) 60%, #16805a); color: #fff; }}
.cover .brand {{ font-weight: 700; font-size: clamp(1rem, 1.6vw, 1.375rem); color: #BFF0D6; }}
.cover .sub, .cover .hint {{ color: #CFE6DA; }}
.chips {{ display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1.75rem; }}
.chip {{ background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.3); border-radius: 99px; padding: .3rem 1rem; font-size: clamp(.9375rem, 1.3vw, 1.125rem); }}
.flowslide {{ flex-direction: column; justify-content: center; align-items: flex-start; }}
.flow {{ display: flex; align-items: center; gap: 1rem; margin: 2rem 0; width: 100%; flex-wrap: wrap; }}
.flow .n {{ flex: 1 1 12rem; background: #fff; border-radius: 1rem; padding: 1.5rem 1.25rem; font-size: clamp(1.0625rem, 1.6vw, 1.5rem); font-weight: 600; box-shadow: 0 .5rem 1.5rem -.75rem rgba(14,90,60,.45); border-top: .375rem solid var(--g); }}
.flow .n b {{ display: block; color: var(--g); font-size: 1.75em; line-height: 1; margin-bottom: .5rem; }}
.flow i {{ font-style: normal; font-size: 2rem; color: var(--g); font-weight: 700; }}
.topic {{ gap: clamp(1rem, 2.5vw, 2.5rem); align-items: center; }}
.topic .txt {{ flex: 0 0 36%; min-width: 0; }}
.topic .vis {{ flex: 1; min-width: 0; }}
.lead {{ font-size: clamp(1rem, 1.35vw, 1.25rem); color: var(--mut); margin: 0 0 1rem; }}
.topic ol {{ list-style: none; margin: 0; padding: 0; display: grid; gap: .625rem; }}
.topic li {{ display: flex; gap: .75rem; background: #fff; border-radius: .75rem; padding: .7rem .9rem; font-size: clamp(.9375rem, 1.2vw, 1.125rem); line-height: 1.45; box-shadow: 0 .25rem .75rem -.5rem rgba(20,38,29,.35); }}
.topic li span {{ flex: none; width: 1.75rem; height: 1.75rem; border-radius: 50%; background: var(--g); color: #fff; font-weight: 700; display: grid; place-items: center; font-size: .9375rem; }}
.note {{ margin: .75rem 0 0; padding: .6rem .9rem; background: #FFF6DB; border-left: .3rem solid var(--amb); border-radius: .5rem; font-size: clamp(.875rem, 1.05vw, 1rem); line-height: 1.45; }}
.win {{ background: #fff; border-radius: .875rem; overflow: hidden; box-shadow: 0 1.5rem 3rem -1.25rem rgba(14,60,40,.55); border: 1px solid #cfdad3; }}
.bar {{ height: 1.75rem; background: #E7EEEA; display: flex; align-items: center; gap: .375rem; padding: 0 .75rem; }}
.bar i {{ width: .625rem; height: .625rem; border-radius: 50%; background: #c3cfc8; }}
.frame {{ position: relative; overflow: hidden; aspect-ratio: 1708 / 930; }}
.frame img {{ display: block; width: 100%; transform-origin: var(--ox) var(--oy); }}
.slide.on .frame img {{ animation: zoom 9s ease-in-out 1.6s infinite alternate; }}
.slide.on .frame .box {{ animation: pop .5s ease-out 1.3s both, zoomBox 9s ease-in-out 1.6s infinite alternate, pulse 1.8s ease-in-out 1.8s infinite; }}
@keyframes zoom {{ to {{ transform: scale(1.22); }} }}
.box {{ position: absolute; border: 3px solid var(--hot); border-radius: .5rem; background: rgba(232,89,12,.08); transform-origin: center; opacity: 0; }}
@keyframes pop {{ from {{ opacity: 0; scale: 1.25; }} to {{ opacity: 1; scale: 1; }} }}
@keyframes zoomBox {{ to {{ transform: scale(1.22); }} }}
@keyframes pulse {{ 50% {{ box-shadow: 0 0 0 .5rem rgba(232,89,12,.18); }} }}
.extra {{ flex-direction: column; justify-content: center; }}
.extra .tag, .flowslide .tag {{ align-self: flex-start; }}
.extra ul {{ list-style: none; margin: 1rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: .75rem; }}
.extra li {{ background: #fff; border-radius: .75rem; padding: .8rem 1rem; border-left: .3rem solid var(--g); font-size: clamp(.9375rem, 1.15vw, 1.0625rem); line-height: 1.45; }}
.extra li b {{ display: block; color: var(--g); }}
.hud {{ position: fixed; left: 0; right: 0; bottom: 0; height: 3.25rem; display: flex; align-items: center; gap: .5rem; padding: 0 1rem; background: rgba(255,255,255,.92); border-top: 1px solid #d5dfd9; z-index: 5; }}
.hud button {{ font: inherit; font-size: .9375rem; min-height: 2.25rem; padding: 0 .9rem; border-radius: .5rem; border: 1px solid #c3cfc8; background: #fff; cursor: pointer; }}
.hud button.pri {{ background: var(--g); color: #fff; border-color: var(--g); }}
.hud .n {{ font-size: .9375rem; color: var(--mut); min-width: 4rem; text-align: center; font-variant-numeric: tabular-nums; }}
.prog {{ flex: 1; height: .375rem; background: #dbe5df; border-radius: 99px; overflow: hidden; }}
.prog i {{ display: block; height: 100%; width: 0; background: var(--g); transition: width .4s; }}
@media (max-width: 860px) {{
  body {{ overflow: auto; }} .slide {{ position: relative; min-height: 100vh; }}
  .topic {{ flex-direction: column; align-items: stretch; justify-content: center; }} .topic .txt {{ flex: none; }}
  .slide.on .frame img, .slide.on .frame .box {{ animation-name: pop, none, pulse; }}
  .slide.on .frame img {{ animation: none; }}
}}
@media (prefers-reduced-motion: reduce) {{
  .a {{ opacity: 1; transform: none; animation: none !important; }}
  .slide.on .frame img {{ animation: none; }} .slide.on .frame .box {{ animation: none; opacity: 1; }}
}}
</style></head><body>
<div class="deck" id="deck">{sl}</div>
<div class="hud"><button id="prev" aria-label="ก่อนหน้า">←</button><span class="n" id="num"></span><button id="next" class="pri" aria-label="ถัดไป">ถัดไป →</button>
<div class="prog"><i id="bar"></i></div><button id="play">▶ เล่นอัตโนมัติ</button></div>
<script>
const SHOTS = {{{data}}};
document.querySelectorAll('img[data-shot]').forEach(function (im) {{ im.src = SHOTS[im.dataset.shot]; }});
const S = [...document.querySelectorAll('.slide')]; let i = 0, timer = null;
function show(n) {{
  i = Math.max(0, Math.min(S.length - 1, n));
  S.forEach(function (s, k) {{ s.classList.toggle('on', k === i); }});
  document.getElementById('num').textContent = (i + 1) + ' / ' + S.length;
  document.getElementById('bar').style.width = ((i + 1) / S.length * 100) + '%';
  try {{ history.replaceState(null, '', '#' + (i + 1)); }} catch (e) {{}}
}}
function play(on) {{
  clearInterval(timer); timer = null;
  if (on) timer = setInterval(function () {{ if (i >= S.length - 1) play(false); else show(i + 1); }}, 9000);
  document.getElementById('play').textContent = timer ? '⏸ หยุด' : '▶ เล่นอัตโนมัติ';
}}
document.getElementById('next').onclick = function () {{ show(i + 1); }};
document.getElementById('prev').onclick = function () {{ show(i - 1); }};
document.getElementById('play').onclick = function () {{ play(!timer); }};
document.getElementById('deck').onclick = function () {{ show(i + 1); }};
addEventListener('keydown', function (e) {{
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {{ e.preventDefault(); show(i + 1); }}
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) show(i - 1);
  else if (e.key === 'Home') show(0); else if (e.key === 'End') show(S.length - 1);
  else if (e.key === 'p' || e.key === 'P') play(!timer);
}});
let tx = null;
addEventListener('touchstart', function (e) {{ tx = e.touches[0].clientX; }}, {{ passive: true }});
addEventListener('touchend', function (e) {{ if (tx === null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) show(i + (d < 0 ? 1 : -1)); tx = null; }});
show((parseInt(location.hash.slice(1), 10) || 1) - 1);
</script></body></html>'''
    io.open(os.path.join(HERE, 'slides.html'), 'w', encoding='utf-8', newline='').write(s)

manual(); slides(); print('built')
