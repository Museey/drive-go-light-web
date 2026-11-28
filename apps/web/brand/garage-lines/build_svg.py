import json, math
T = json.load(open('trace.json'))
VB = (0, 108, 1024, 652)   # crop the empty top / bottom of the sketch

def center(s):
    xs = [p[0] for p in s]; ys = [p[1] for p in s]
    return (min(xs)+max(xs))/2, (min(ys)+max(ys))/2
def which(s):
    x, y = center(s)
    if 336 <= x <= 497 and 538 <= y <= 660: return 'car1'
    if 580 <= x <= 834 and 540 <= y <= 702 and not (x < 616 and y < 578) and not (x > 798 and y < 586): return 'car2'
    return 'garage'
def d_of(s):
    out = 'M%s %s' % (fmt(s[0][0]), fmt(s[0][1]))
    px, py = s[0]
    for x, y in s[1:]:
        out += 'l%s %s' % (fmt(x-px), fmt(y-py)); px, py = round(px + round(x-px, 1), 1), round(py + round(y-py, 1), 1)
    return out
def fmt(v):
    v = round(v, 1)
    return ('%g' % v)

buckets = {'garage': [], 'car1': [], 'car2': []}
for s in T['strokes']: buckets[which(s)].append(s)

def groups(strokes, n, key):
    strokes = sorted(strokes, key=key)
    per = math.ceil(len(strokes) / n)
    return [strokes[i:i+per] for i in range(0, len(strokes), per)]

# garage: drawn outward from the middle of the opening, like a door lifting to show the room
gar = groups(buckets['garage'], 18, lambda s: abs(center(s)[0] - 512) * 0.6 + abs(center(s)[1] - 430))
car1 = groups(buckets['car1'], 5, lambda s: center(s)[1])
car2 = groups(buckets['car2'], 6, lambda s: center(s)[1])

def paths(gs, t0, step, dur, cls):
    out = []
    for i, g in enumerate(gs):
        g = sorted(g, key=lambda s: (round(center(s)[1] / 14), center(s)[0]))
        d = ''.join(d_of(s) for s in g)
        out.append('<path class="s %s" pathLength="1" style="--t:%.2fs;--d:%.2fs" d="%s"/>' % (cls, t0 + i*step, dur, d))
    return '\n'.join(out)

def fill_paths(region):
    out = []
    for f in T['fills']:
        if which(f) != region: continue
        out.append('M' + 'L'.join('%s %s' % (fmt(x), fmt(y)) for x, y in f) + 'Z')
    return ''.join(out)

CAR_T = 1.5   # cars start once the room is mostly in
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB[0]} {VB[1]} {VB[2]} {VB[3]}" role="img" aria-label="ภาพลายเส้นอู่ซ่อมรถที่มีรถสองคันจอดอยู่">
<style>
.s{{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:draw var(--d) cubic-bezier(.55,.05,.2,1) var(--t) forwards}}
.g{{stroke:#43E6A5;stroke-width:1.5;opacity:.78}}
.c{{stroke:#D6FFE9;stroke-width:1.9}}
.f{{opacity:0;animation:ink .9s ease-out forwards}}
.fg{{fill:#43E6A5;animation-delay:2.2s;--o:.24}}
.fc{{fill:#D6FFE9;animation-delay:3.4s;--o:.2}}
.lamp{{opacity:0;animation:on .5s steps(3,jump-none) 4s forwards,glow 2s linear 4.6s infinite}}
.beam{{opacity:0;animation:beam 1.4s ease-out 4.1s forwards,flash 2s linear 5.6s infinite}}
.sweep{{transform-box:fill-box;animation:sweep 7s cubic-bezier(.4,0,.2,1) 5.2s infinite}}
.car{{transform-box:fill-box;animation:idle 5s ease-in-out 5s infinite}}
.car.b{{animation-delay:5.8s;animation-duration:6.2s}}
@keyframes draw{{to{{stroke-dashoffset:0}}}}
@keyframes ink{{to{{opacity:var(--o)}}}}
@keyframes on{{0%{{opacity:0}}40%{{opacity:1}}60%{{opacity:.25}}100%{{opacity:1}}}}
@keyframes glow{{0%,68%,100%{{opacity:1}}76%{{opacity:.12}}84%{{opacity:1}}90%{{opacity:.3}}96%{{opacity:1}}}}
@keyframes flash{{0%,68%,100%{{opacity:1}}76%{{opacity:.15}}84%{{opacity:1}}90%{{opacity:.35}}96%{{opacity:1}}}}
@keyframes beam{{to{{opacity:1}}}}
@keyframes sweep{{0%{{transform:translateX(-140%)}}55%,100%{{transform:translateX(440%)}}}}
@keyframes idle{{0%,100%{{transform:translateY(0)}}50%{{transform:translateY(-1%)}}}}
@media (prefers-reduced-motion:reduce){{
.s{{animation:none;stroke-dashoffset:0}}.f{{animation:none;opacity:var(--o)}}
.lamp,.beam{{animation:none;opacity:1}}.sweep{{display:none}}.car{{animation:none}}
}}
</style>
<defs>
<radialGradient id="lg"><stop offset="0" stop-color="#FFF6C9"/><stop offset=".22" stop-color="#FFD23F"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient>
<radialGradient id="bg"><stop offset="0" stop-color="#FFD23F" stop-opacity=".3"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient>
<linearGradient id="sw" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#F4FFB8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="0" y="{VB[1]}" width="1024" height="{VB[3]}"><use href="#art" style="filter:brightness(4)"/></mask>
</defs>
<g class="beam">
<ellipse cx="411" cy="676" rx="150" ry="66" fill="url(#bg)"/>
<ellipse cx="729" cy="706" rx="210" ry="60" fill="url(#bg)"/>
</g>
<g id="art">
<g><path class="f fg" d="{fill_paths('garage')}"/>
{paths(gar, 0.15, 0.085, 1.9, 'g')}</g>
<g class="car"><path class="f fc" d="{fill_paths('car1')}"/>
{paths(car1, CAR_T, 0.22, 1.7, 'c')}</g>
<g class="car b"><path class="f fc" d="{fill_paths('car2')}"/>
{paths(car2, CAR_T + 0.45, 0.2, 1.8, 'c')}</g>
</g>
<g mask="url(#m)"><rect class="sweep" x="0" y="{VB[1]}" width="300" height="{VB[3]}" fill="url(#sw)"/></g>
<g class="lamp">
<circle cx="353" cy="597" r="26" fill="url(#lg)"/><circle cx="469" cy="597" r="26" fill="url(#lg)"/>
<circle cx="653" cy="611" r="30" fill="url(#lg)"/><circle cx="806" cy="611" r="24" fill="url(#lg)"/>
</g>
</svg>'''
open('garage-lines.svg', 'w').write(svg)
print(len(svg), {k: len(v) for k, v in buckets.items()})
html = '''<!doctype html><body style="margin:0;background:linear-gradient(#0A4D34,#05291C)"><img src="garage-lines.svg" style="width:100%;display:block"></body>'''
open('preview.html', 'w').write(html)
