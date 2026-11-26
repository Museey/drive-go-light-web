# -*- coding: utf-8 -*-
"""ประกอบ demo.html จาก demo-data.json (หน้าจอจริงที่เก็บจากระบบ)  รัน: python -I build-demo.py"""
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(io.open(os.path.join(HERE, 'demo-data.json'), encoding='utf-8'))
steps = d['steps']
HOT = {'qt-page': '.tag-row button.btn:not(.danger)', 'qt-locked': '.edit-gate .note', 'list': 'table.hist tbody tr:nth-child(-n+3)'}
for s_ in steps:
    if s_['id'] in HOT: s_['hot'] = HOT[s_['id']]
data = json.dumps(steps, ensure_ascii=False).replace('</', '<\\/')
css = d['css'].replace('</style', '<\\/style')

GUIDE_CSS = r'''
#demo-stage { display: contents; }
#demo-guide { position: fixed; left: 12px; bottom: 12px; z-index: 2147483000;
  width: min(780px, calc(100vw - 24px)); background: #10261C; color: #fff; border-radius: 14px;
  box-shadow: 0 18px 44px -12px rgba(0,0,0,.6); font: 15px/1.45 'Leelawadee UI', Tahoma, sans-serif;
  display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; }
#demo-guide.min { width: auto; grid-template-columns: auto; padding: 6px; }
#demo-guide.min > :not(#dg-toggle) { display: none; }
#demo-guide button, #demo-guide select { font: inherit; color: #fff; background: #1E3B2E; border: 1px solid #3C5E4E;
  border-radius: 9px; min-height: 36px; padding: 0 12px; cursor: pointer; }
#demo-guide button.pri { background: #F2A900; border-color: #F2A900; color: #1c1300; font-weight: 700; }
#demo-guide button:disabled { opacity: .4; cursor: default; }
#demo-guide .nav { display: flex; gap: 6px; align-items: center; }
#demo-guide .num { font-variant-numeric: tabular-nums; color: #A9C7B8; min-width: 52px; text-align: center; }
#demo-guide .txt b { display: block; font-size: 16px; }
#demo-guide .txt span { color: #CFE3D8; font-size: 14px; }
#demo-guide select { max-width: 190px; }
#demo-toast { position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 2147483001; background: #10261C; color: #fff;
  font: 15px/1.4 'Leelawadee UI', Tahoma, sans-serif; padding: 9px 16px; border-radius: 10px; opacity: 0; transition: opacity .25s; pointer-events: none; }
#demo-toast.on { opacity: 1; }
.demo-hot { outline: 3px solid #E8590C !important; outline-offset: 3px; border-radius: 6px; animation: demoHot 1.5s ease-in-out infinite; cursor: pointer; }
@keyframes demoHot { 50% { outline-color: rgba(232,89,12,.35); } }
body { padding-bottom: 96px; }
@media print { #demo-guide, #demo-toast { display: none; } }
'''

JS = r'''
var STEPS = __DATA__;
var stage = document.getElementById('demo-stage'), cur = 0, hints = true;
var ROUTES = [
  [/^\/income\/new\?kind=(IV|IVT)&from=/, 'iv-form'], [/^\/income\/new\?kind=RC&from=/, 'rc-form'],
  [/^\/income\/[0-9a-f-]{36}$/, 'qt-page'], [/^\/income\?.*hist=1/, 'list'], [/^\/income(\?kind=QT.*)?$/, 'qt-blank'],
  [/^\/customers\/appointments/, 'appointments'], [/^\/customers(\?kind=customer.*)?$/, 'customers'],
  [/^\/finance\/sales/, 'split'], [/^\/finance\/payroll\/employees/, 'employees'], [/^\/finance\/payroll$/, 'payroll'],
  [/^\/finance\/tax/, 'tax'], [/^\/settings$/, 'settings'], [/^\/$/, 'home']
];
function idx(id) { for (var k = 0; k < STEPS.length; k++) if (STEPS[k].id === id) return k; return -1; }
function toast(t) { var el = document.getElementById('demo-toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2200); }
function mark() {
  stage.querySelectorAll('.demo-hot').forEach(function (e) { e.classList.remove('demo-hot'); });
  var s = STEPS[cur]; if (!hints || !s.hot) return;
  try { var els = stage.querySelectorAll(s.hot); for (var k = 0; k < Math.min(els.length, 3); k++) els[k].classList.add('demo-hot'); } catch (e) {}
}
function show(n) {
  cur = Math.max(0, Math.min(STEPS.length - 1, n));
  var s = STEPS[cur];
  stage.innerHTML = s.html;
  window.scrollTo(0, s.scroll || 0);
  document.getElementById('dg-num').textContent = (cur + 1) + ' / ' + STEPS.length;
  document.getElementById('dg-title').textContent = s.title;
  document.getElementById('dg-desc').textContent = s.desc;
  document.getElementById('dg-prev').disabled = cur === 0;
  document.getElementById('dg-next').disabled = cur === STEPS.length - 1;
  document.getElementById('dg-list').value = String(cur);
  mark();
  try { history.replaceState(null, '', '#' + s.id); } catch (e) {}
}
var list = document.getElementById('dg-list');
STEPS.forEach(function (s, k) { var o = document.createElement('option'); o.value = String(k); o.textContent = (k + 1) + '. ' + s.title; list.appendChild(o); });
list.onchange = function () { show(parseInt(list.value, 10)); };
document.getElementById('dg-prev').onclick = function () { show(cur - 1); };
document.getElementById('dg-next').onclick = function () { show(cur + 1); };
document.getElementById('dg-hint').onclick = function () { hints = !hints; this.textContent = hints ? 'ซ่อนกรอบชี้' : 'แสดงกรอบชี้'; mark(); };
document.getElementById('dg-toggle').onclick = function () { var g = document.getElementById('demo-guide'); g.classList.toggle('min'); this.textContent = g.classList.contains('min') ? 'คำอธิบาย ▲' : '▼'; };
/* ลิงก์และปุ่มในหน้าจอตัวอย่าง: ไม่ออกจากไฟล์นี้ — พาไปขั้นตอนที่ตรงกัน หรือบอกว่าไม่มีในตัวอย่าง */
stage.addEventListener('click', function (e) {
  var t = e.target;
  if (t.closest('.demo-hot') && cur < STEPS.length - 1 && !t.closest('input, select, textarea')) { e.preventDefault(); e.stopPropagation(); show(cur + 1); return; }
  var a = t.closest('a[href]');
  if (a) {
    e.preventDefault();
    var href = a.getAttribute('href') || '';
    for (var k = 0; k < ROUTES.length; k++) if (ROUTES[k][0].test(href)) { var n = idx(ROUTES[k][1]); if (n >= 0) { show(n); return; } }
    toast('หน้านี้ไม่ได้อยู่ในไฟล์ตัวอย่าง');
    return;
  }
  var b = t.closest('button');
  if (b) {
    var label = (b.textContent || '').trim();
    if (/^บันทึก/.test(label) && cur < STEPS.length - 1) { e.preventDefault(); show(cur + 1); return; }
    if (label === 'ปิด' || b.classList.contains('saved-scrim') || b.classList.contains('scrim')) {
      e.preventDefault();
      stage.querySelectorAll('.saved-card, .saved-scrim, .confirm.open, .scrim.on').forEach(function (x) { x.remove(); });
      return;
    }
    if (b.type === 'submit') { e.preventDefault(); toast('ไฟล์ตัวอย่าง — ปุ่มนี้ไม่ทำงานจริง'); }
  }
}, true);
stage.addEventListener('input', function (e) {
  /* กรอบชี้ที่เป็นช่องกรอก: พิมพ์ครบ 2 ตัวแล้วไปขั้นถัดไป (ผลค้นหาที่เก็บไว้) */
  if (e.target.closest('.demo-hot') && (e.target.value || '').length >= 2 && cur < STEPS.length - 1) setTimeout(function () { show(cur + 1); }, 500);
}, true);
stage.addEventListener('submit', function (e) { e.preventDefault(); }, true);
addEventListener('keydown', function (e) {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') show(cur + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(cur - 1);
});
var start = idx(location.hash.slice(1));
show(start >= 0 ? start : 0);
'''.replace('__DATA__', data)

page = f'''<!doctype html>
<html lang="th" class="{d['htmlClass']}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DriveGoLight — ตัวอย่างหน้าจอจริงทีละขั้นตอน</title>
<style>{css}</style>
<style>{GUIDE_CSS}</style>
</head>
<body class="{d['bodyClass']}">
<div id="demo-stage"></div>
<div id="demo-toast" role="status"></div>
<div id="demo-guide">
  <div class="nav"><button id="dg-prev" aria-label="ขั้นก่อนหน้า">←</button><span class="num" id="dg-num"></span><button id="dg-next" class="pri">ถัดไป →</button></div>
  <div class="txt"><b id="dg-title"></b><span id="dg-desc"></span></div>
  <div class="nav"><select id="dg-list" aria-label="ไปที่ขั้นตอน"></select><button id="dg-hint">ซ่อนกรอบชี้</button><button id="dg-toggle" aria-label="ย่อคำอธิบาย">▼</button></div>
</div>
<script>{JS}</script>
</body></html>'''
io.open(os.path.join(HERE, 'demo.html'), 'w', encoding='utf-8', newline='').write(page)
print('demo.html', round(len(page.encode('utf-8')) / 1024), 'KB', len(steps), 'steps')
