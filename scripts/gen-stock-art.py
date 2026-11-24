#!/usr/bin/env python3
"""Generates the bundled, original vector artwork used by Flipex Studio templates and the stock library.
Output: backend/resources/studio/stock/*.svg + stock.json (manifest). Pure stdlib; re-run to regenerate.
Everything is original geometric artwork (CC0) so there are no hotlinks, licences or external requests."""
import json, math, os, random

OUT = os.path.join(os.path.dirname(__file__), '..', 'backend', 'resources', 'studio', 'stock')
os.makedirs(OUT, exist_ok=True)

def svg(w, h, body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid slice"><defs>{defs}</defs>{body}</svg>'

def lg(i, c1, c2, c3=None, x2=0, y2=1):
    s = f'<stop offset="0" stop-color="{c1}"/>'
    if c3: s += f'<stop offset=".55" stop-color="{c2}"/><stop offset="1" stop-color="{c3}"/>'
    else: s += f'<stop offset="1" stop-color="{c2}"/>'
    return f'<linearGradient id="{i}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'

def waves(y, w, amp, col, op=1, n=4, phase=0):
    d = f'M0 {y}'
    step = w / (n * 2)
    for k in range(n * 2):
        d += f' q {step/2:.1f} {-amp if (k + phase) % 2 == 0 else amp} {step:.1f} 0'
    d += f' V 700 H0 Z'
    return f'<path d="{d}" fill="{col}" opacity="{op}"/>'

def palm(x, y, s=1, col='#0b3d2e'):
    leaves = ''
    for a in (-150, -120, -90, -60, -30, 0, 20):
        r = math.radians(a)
        ex, ey = x + math.cos(r) * 110 * s, y - 130 * s + math.sin(r) * 60 * s
        leaves += f'<path d="M{x} {y-130*s} Q{(x+ex)/2:.0f} {y-190*s+math.sin(r)*30*s:.0f} {ex:.0f} {ey:.0f} Q{(x+ex)/2:.0f} {y-150*s:.0f} {x} {y-130*s}Z" fill="{col}"/>'
    return f'<path d="M{x} {y} q{12*s} {-70*s} {-4*s} {-130*s}" stroke="#5b3a1e" stroke-width="{7*s}" fill="none" stroke-linecap="round"/>{leaves}'

def sun(cx, cy, r, c1='#fff3b0', c2='#ffb703'):
    return f'<circle cx="{cx}" cy="{cy}" r="{r*1.8}" fill="{c2}" opacity=".18"/><circle cx="{cx}" cy="{cy}" r="{r*1.35}" fill="{c2}" opacity=".3"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="{c1}"/>'

def scene_beach(p):
    c = p
    b = f'<rect width="800" height="600" fill="url(#sky)"/>' + sun(560, 230, 52, c[3], c[4])
    b += waves(330, 800, 10, c[5], .9, 5) + waves(380, 800, 12, c[6], 1, 4, 1) + waves(430, 800, 14, c[5], .9, 3)
    b += f'<path d="M0 470 Q300 430 800 485 V600 H0Z" fill="{c[7]}"/>' + palm(160, 500, 1.3) + palm(250, 520, .9)
    return svg(800, 600, b, lg('sky', c[0], c[1], c[2]))

def scene_reef(p):
    b = '<rect width="800" height="600" fill="url(#sea)"/>'
    for i in range(7): b += f'<path d="M{-50+i*130} 0 L{i*130+40} 600" stroke="#ffffff" opacity=".05" stroke-width="40"/>'
    rnd = random.Random(7)
    for i in range(9):
        x = 40 + i * 85; h = rnd.randint(80, 190); col = p[3 + i % 3]
        b += f'<g fill="{col}"><rect x="{x}" y="{600-h}" width="16" height="{h}" rx="8"/><rect x="{x-24}" y="{600-h*0.7:.0f}" width="14" height="{h*0.5:.0f}" rx="7"/><rect x="{x+26}" y="{600-h*0.8:.0f}" width="14" height="{h*0.55:.0f}" rx="7"/></g>'
    for i in range(6):
        x, y = 120 + i * 110, 120 + (i * 53) % 260
        b += f'<g transform="translate({x} {y})"><ellipse rx="26" ry="13" fill="{p[6]}"/><path d="M24 0 l22 -14 v28Z" fill="{p[6]}"/><circle cx="-12" cy="-3" r="3" fill="#fff"/></g>'
    b += f'<path d="M0 560 Q200 520 400 560 T800 555 V600 H0Z" fill="{p[7]}"/>'
    return svg(800, 600, b, lg('sea', p[0], p[1], p[2]))

def scene_sunset(p):
    b = '<rect width="800" height="600" fill="url(#sky)"/>' + sun(400, 320, 70, p[3], p[4])
    b += f'<rect y="350" width="800" height="250" fill="url(#water)"/>'
    for i in range(7): b += f'<rect x="{300+i*4}" y="{370+i*26}" width="{200-i*8}" height="5" rx="2.5" fill="{p[3]}" opacity="{.7-i*.08:.2f}"/>'
    b += f'<path d="M0 350 L90 300 L170 340 L260 280 L340 350Z" fill="{p[5]}"/><path d="M460 350 L560 290 L650 335 L740 275 L800 330 V350Z" fill="{p[5]}"/>'
    return svg(800, 600, b, lg('sky', p[0], p[1], p[2]) + lg('water', p[6], p[7]))

def scene_villa(p):
    b = f'<rect width="800" height="600" fill="url(#sky)"/>' + sun(640, 130, 34, p[3], p[4])
    b += f'<rect y="400" width="800" height="200" fill="{p[5]}"/><rect x="60" y="440" width="680" height="120" rx="14" fill="url(#pool)"/>'
    b += f'<rect x="130" y="210" width="540" height="190" fill="{p[6]}"/><rect x="100" y="190" width="600" height="28" fill="{p[7]}"/>'
    for i in range(5): b += f'<rect x="{160+i*100}" y="250" width="70" height="120" rx="4" fill="url(#glass)"/>'
    b += palm(90, 420, 1) + palm(730, 425, 1.1)
    return svg(800, 600, b, lg('sky', p[0], p[1]) + lg('pool', '#7fe7f5', '#0aa3c2') + lg('glass', '#cdeeff', '#4aa3d9'))

def scene_food(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/><ellipse cx="400" cy="360" rx="290" ry="200" fill="#000" opacity=".15"/>'
    b += f'<circle cx="400" cy="310" r="240" fill="#fff"/><circle cx="400" cy="310" r="205" fill="{p[3]}" opacity=".35"/>'
    rnd = random.Random(3)
    for i in range(34):
        a = rnd.random() * 6.283; r = rnd.random() * 170
        b += f'<circle cx="{400+math.cos(a)*r:.0f}" cy="{310+math.sin(a)*r:.0f}" r="{rnd.randint(10,26)}" fill="{p[4+i%3]}"/>'
    b += f'<path d="M290 300 q110 -90 220 0" stroke="#fff" stroke-width="5" fill="none" opacity=".5"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]))

def scene_drink(p):
    b = f'<rect width="800" height="800" fill="url(#bg)"/>' + sun(620, 160, 46, p[3], p[4])
    b += f'<path d="M280 260 H520 L470 640 Q400 680 330 640Z" fill="url(#liq)" stroke="#fff" stroke-opacity=".6" stroke-width="6"/>'
    b += f'<rect x="265" y="244" width="270" height="24" rx="12" fill="#fff" opacity=".85"/><circle cx="500" cy="236" r="40" fill="{p[5]}"/><path d="M500 196 v80 M460 236 h80" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>'
    b += f'<path d="M420 150 L450 60" stroke="{p[6]}" stroke-width="10" stroke-linecap="round"/><ellipse cx="400" cy="680" rx="190" ry="26" fill="#000" opacity=".15"/>'
    return svg(800, 800, b, lg('bg', p[0], p[1]) + lg('liq', p[2], p[7]))

def scene_headphones(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/><path d="M230 360 C230 120 570 120 570 360" stroke="#1e293b" stroke-width="40" fill="none" stroke-linecap="round"/>'
    for x in (215, 585): b += f'<rect x="{x-60}" y="330" width="120" height="190" rx="52" fill="#0f172a"/><rect x="{x-38}" y="352" width="76" height="146" rx="38" fill="{p[3]}"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]))

def scene_watch(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/><rect x="340" y="40" width="120" height="520" rx="40" fill="#1e293b"/><circle cx="400" cy="300" r="170" fill="#0f172a"/><circle cx="400" cy="300" r="148" fill="{p[3]}"/>'
    for i in range(12):
        a = i * 30 * math.pi / 180; b += f'<line x1="{400+math.cos(a)*128:.0f}" y1="{300+math.sin(a)*128:.0f}" x2="{400+math.cos(a)*140:.0f}" y2="{300+math.sin(a)*140:.0f}" stroke="#fff" stroke-width="4"/>'
    b += f'<line x1="400" y1="300" x2="400" y2="205" stroke="#fff" stroke-width="8" stroke-linecap="round"/><line x1="400" y1="300" x2="462" y2="330" stroke="{p[4]}" stroke-width="6" stroke-linecap="round"/><circle cx="400" cy="300" r="9" fill="{p[4]}"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]))

def scene_laptop(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/><rect x="170" y="110" width="460" height="300" rx="18" fill="#0f172a"/><rect x="190" y="130" width="420" height="260" rx="6" fill="url(#scr)"/>'
    b += f'<path d="M110 420 H690 L720 470 Q400 500 80 470Z" fill="#cbd5e1"/><rect x="330" y="436" width="140" height="14" rx="7" fill="#94a3b8"/>'
    for i in range(5): b += f'<rect x="{215+i*8}" y="{160+i*38}" width="{240-i*20}" height="12" rx="6" fill="#fff" opacity=".7"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]) + lg('scr', p[3], p[4], p[5]))

def scene_product(p, kind):
    b = f'<rect width="800" height="800" fill="url(#bg)"/><ellipse cx="400" cy="690" rx="230" ry="28" fill="#000" opacity=".15"/>'
    if kind == 'rice':
        b += f'<path d="M230 190 Q400 140 570 190 L600 650 Q400 700 200 650Z" fill="{p[3]}"/><rect x="270" y="300" width="260" height="190" rx="18" fill="#fff" opacity=".92"/><circle cx="400" cy="395" r="48" fill="{p[4]}"/><rect x="310" y="520" width="180" height="16" rx="8" fill="{p[4]}" opacity=".6"/>'
    elif kind == 'banana':
        for i in range(4): b += f'<path d="M{250+i*38} 200 Q{210+i*38} 520 {470+i*10} 640 Q{330+i*38} 520 {320+i*38} 200Z" fill="{p[3] if i%2 else p[4]}"/>'
        b += f'<rect x="270" y="170" width="150" height="46" rx="12" fill="#6b4423"/>'
    elif kind == 'oil':
        b += f'<rect x="330" y="120" width="140" height="90" rx="12" fill="{p[4]}"/><path d="M310 210 H490 Q540 260 540 330 V640 Q540 680 500 680 H300 Q260 680 260 640 V330 Q260 260 310 210Z" fill="url(#liq)"/><rect x="290" y="380" width="220" height="190" rx="14" fill="#fff" opacity=".92"/><circle cx="400" cy="475" r="40" fill="{p[4]}"/>'
    elif kind == 'pineapple':
        for i, a in enumerate((-40, -20, 0, 20, 40)): b += f'<path d="M400 260 Q{400+a*5} 120 {400+a*3} 60 Q{410+a*3} 140 400 260Z" fill="{p[5]}" transform="rotate({a} 400 260)"/>'
        b += f'<ellipse cx="400" cy="470" rx="160" ry="215" fill="{p[3]}"/>'
        for i in range(5):
            for j in range(6): b += f'<path d="M{290+i*55} {330+j*50} l27 -22 l27 22 l-27 22Z" fill="{p[4]}" opacity=".75"/>'
    else:  # tomato
        b += f'<circle cx="400" cy="440" r="210" fill="{p[3]}"/><path d="M400 245 l-40 -50 l40 22 l40 -22Z" fill="{p[5]}"/><ellipse cx="330" cy="370" rx="46" ry="26" fill="#fff" opacity=".28" transform="rotate(-30 330 370)"/>'
    return svg(800, 800, b, lg('bg', p[0], p[1]) + lg('liq', p[3], p[2]))

def scene_portrait(p):
    b = f'<rect width="600" height="800" fill="url(#bg)"/><path d="M60 800 Q60 560 300 540 Q540 560 540 800Z" fill="{p[3]}"/><rect x="262" y="450" width="76" height="110" rx="30" fill="{p[4]}"/>'
    b += f'<ellipse cx="300" cy="360" rx="112" ry="135" fill="{p[4]}"/><path d="M178 340 Q190 200 300 205 Q412 200 424 340 Q380 270 300 268 Q220 270 178 340Z" fill="{p[5]}"/>'
    b += f'<circle cx="260" cy="365" r="9" fill="#1e293b"/><circle cx="340" cy="365" r="9" fill="#1e293b"/><path d="M262 420 Q300 450 338 420" stroke="#9b4a3a" stroke-width="7" fill="none" stroke-linecap="round"/>'
    return svg(600, 800, b, lg('bg', p[0], p[1]))

def scene_badge(p):
    b = f'<rect width="400" height="400" fill="none"/><circle cx="200" cy="200" r="180" fill="{p[3]}"/><circle cx="200" cy="200" r="150" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="4 8"/><circle cx="200" cy="200" r="120" fill="{p[4]}"/>'
    b += f'<path d="M200 130 l22 46 50 7 -36 35 9 50 -45 -24 -45 24 9 -50 -36 -35 50 -7Z" fill="#fff"/>'
    return svg(400, 400, b)

def scene_market(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/><rect x="80" y="260" width="640" height="280" fill="{p[3]}"/>'
    for i in range(8): b += f'<path d="M{80+i*80} 190 h80 l-10 80 h-60Z" fill="{p[4] if i%2 else "#fff"}"/>'
    b += f'<rect x="120" y="340" width="150" height="200" fill="url(#bg)" opacity=".5"/><rect x="330" y="330" width="360" height="130" rx="10" fill="#fff" opacity=".9"/>'
    for i in range(6): b += f'<circle cx="{370+i*56}" cy="395" r="20" fill="{p[5 + i%3]}"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]))

def scene_graduation(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/><path d="M400 150 L660 260 L400 370 L140 260Z" fill="#0f172a"/><path d="M250 320 V420 Q400 480 550 420 V320 L400 385Z" fill="#1e293b"/><path d="M660 260 V380" stroke="{p[3]}" stroke-width="6"/><circle cx="660" cy="395" r="16" fill="{p[3]}"/>'
    b += f'<rect x="200" y="470" width="400" height="22" rx="11" fill="#fff" opacity=".85"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]))

def scene_wedding(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/>' + sun(400, 210, 60, '#ffffff', p[3])
    b += f'<circle cx="340" cy="320" r="95" fill="none" stroke="{p[4]}" stroke-width="22"/><circle cx="460" cy="320" r="95" fill="none" stroke="{p[3]}" stroke-width="22"/>'
    for i in range(14):
        a = i * .45; b += f'<ellipse cx="{400+math.cos(a)*300:.0f}" cy="{470+math.sin(a)*70:.0f}" rx="20" ry="11" fill="{p[5]}" opacity=".8" transform="rotate({i*25} {400+math.cos(a)*300:.0f} {470+math.sin(a)*70:.0f})"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]))

def scene_adventure(p):
    b = f'<rect width="800" height="600" fill="url(#sky)"/>' + sun(150, 130, 40, p[3], p[4])
    b += f'<path d="M0 420 L170 210 L290 340 L430 150 L600 360 L700 260 L800 380 V600 H0Z" fill="{p[5]}"/><path d="M430 150 L380 235 L430 215 L470 240Z" fill="#fff" opacity=".9"/>'
    b += f'<path d="M0 470 Q250 400 520 480 T800 450 V600 H0Z" fill="{p[6]}"/><path d="M0 540 Q300 480 800 550 V600 H0Z" fill="{p[7]}"/>'
    return svg(800, 600, b, lg('sky', p[0], p[1], p[2]))

def scene_office(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/>'
    for i in range(6):
        h = 120 + (i * 67) % 220; b += f'<rect x="{90+i*105}" y="{520-h}" width="70" height="{h}" rx="6" fill="{p[3 + i%3]}"/>'
        for j in range(int(h / 34)): b += f'<rect x="{102+i*105}" y="{540-h+j*34-24}" width="14" height="14" fill="#fff" opacity=".6"/><rect x="{130+i*105}" y="{540-h+j*34-24}" width="14" height="14" fill="#fff" opacity=".6"/>'
    b += f'<rect y="520" width="800" height="80" fill="{p[6]}"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1]))

def scene_abstract(p):
    b = f'<rect width="800" height="600" fill="url(#bg)"/>'
    rnd = random.Random(11)
    for i in range(9): b += f'<circle cx="{rnd.randint(0,800)}" cy="{rnd.randint(0,600)}" r="{rnd.randint(40,170)}" fill="{p[3 + i%4]}" opacity=".22"/>'
    return svg(800, 600, b, lg('bg', p[0], p[1], p[2]))

# palette order: sky/top, mid, bottom, light, accent, c5, c6, c7
P = {
 'tropic':  ['#0b3a63', '#1d7bb8', '#8fd3f4', '#fff3b0', '#ffb703', '#2bb3c0', '#0e7490', '#f2d9a5'],
 'dusk':    ['#2b1055', '#c2417a', '#ff9e4a', '#fff0b8', '#ff7a1a', '#3a1c5e', '#7a2d6e', '#1a1040'],
 'lagoon':  ['#06324d', '#0a6c93', '#18a7c9', '#ffd166', '#ef476f', '#06d6a0', '#ff9f1c', '#c9a66b'],
 'villa':   ['#7ec8f2', '#d6f0ff', '#ffffff', '#fff3b0', '#ffd23f', '#b9e0a5', '#f8f4ec', '#1e3a5f'],
 'food':    ['#fbd38d', '#f6ad55', '#c05621', '#7bc47f', '#e63946', '#f4a261', '#2a9d8f', '#e9c46a'],
 'drink':   ['#ff9e7a', '#ffd6a5', '#ffb703', '#fff3b0', '#ff8c42', '#7bc47f', '#3a7d44', '#d62828'],
 'tech':    ['#0f172a', '#1e3a8a', '#38bdf8', '#38bdf8', '#f59e0b', '#a78bfa', '#0ea5e9', '#6366f1'],
 'rice':    ['#fde68a', '#fcd9a8', '#f59e0b', '#fef3c7', '#b45309', '#ffffff', '#92400e', '#78350f'],
 'banana':  ['#bbf7d0', '#fef9c3', '#facc15', '#fde047', '#eab308', '#65a30d', '#14532d', '#ca8a04'],
 'oil':     ['#fef3c7', '#fde68a', '#d97706', '#fbbf24', '#15803d', '#ffffff', '#92400e', '#78350f'],
 'pine':    ['#fef9c3', '#fed7aa', '#f59e0b', '#fbbf24', '#d97706', '#16a34a', '#14532d', '#78350f'],
 'tomato':  ['#fee2e2', '#fecaca', '#ef4444', '#dc2626', '#b91c1c', '#16a34a', '#14532d', '#7f1d1d'],
 'portf':   ['#dbeafe', '#bfdbfe', '#60a5fa', '#1e40af', '#f1c9a5', '#3b2314', '#ffffff', '#000000'],
 'portm':   ['#fce7f3', '#fbcfe8', '#f472b6', '#0f766e', '#d9a679', '#1c1917', '#ffffff', '#000000'],
 'badge':   ['#000', '#000', '#000', '#b45309', '#f59e0b', '#fff', '#fff', '#fff'],
 'market':  ['#fef3c7', '#fde68a', '#f59e0b', '#1d4ed8', '#dc2626', '#16a34a', '#f59e0b', '#2563eb'],
 'grad':    ['#e0e7ff', '#c7d2fe', '#818cf8', '#fbbf24', '#0f172a', '#fff', '#fff', '#fff'],
 'wed':     ['#fff1f2', '#fecdd3', '#fda4af', '#f5c542', '#e5c07b', '#fb7185', '#fff', '#fff'],
 'adv':     ['#0c4a6e', '#38bdf8', '#e0f2fe', '#fff7ae', '#fbbf24', '#475569', '#166534', '#14532d'],
 'office':  ['#e2e8f0', '#cbd5e1', '#94a3b8', '#1e3a8a', '#0b5cad', '#d99a0b', '#334155', '#fff'],
 'abs':     ['#0a2a5e', '#0b5cad', '#38bdf8', '#f5c542', '#ffffff', '#38bdf8', '#d99a0b', '#fff'],
}

# (name, title, category, tags, builder, palette, w, h)
ART = [
 ('stock_ret_01', 'Premium Island Rice 10kg', 'retail', 'retail,groceries,rice,food,staple', lambda p: scene_product(p, 'rice'), 'rice', 800, 800),
 ('stock_ret_02', 'Fresh Yellow Island Bananas', 'retail', 'retail,bananas,fruit,market,fresh', lambda p: scene_product(p, 'banana'), 'banana', 800, 800),
 ('stock_ret_03', 'Cold-Pressed Coconut & Island Oil', 'retail', 'retail,oil,cooking,fmcg', lambda p: scene_product(p, 'oil'), 'oil', 800, 800),
 ('stock_ret_04', 'Organic Sweet Pineapples', 'retail', 'retail,fruit,pineapple,market', lambda p: scene_product(p, 'pineapple'), 'pine', 800, 800),
 ('stock_ret_05', 'Vine-Ripened Field Tomatoes', 'retail', 'retail,vegetables,tomatoes,fresh', lambda p: scene_product(p, 'tomato'), 'tomato', 800, 800),
 ('stock_ret_06', 'Neighbourhood Market Storefront', 'retail', 'retail,store,market,shop', scene_market, 'market', 800, 600),
 ('stock_din_01', 'Island Kokoda Ceviche Bowl', 'dining', 'dining,seafood,kokoda,fiji,restaurant', scene_food, 'food', 800, 600),
 ('stock_din_02', 'Grilled Coral Rock Lobster Platter', 'dining', 'dining,lobster,seafood,fine dining', scene_food, 'lagoon', 800, 600),
 ('stock_din_03', 'Pacific Sunset Tropical Cocktail', 'dining', 'dining,cocktail,drinks,bar,resort', scene_drink, 'drink', 800, 800),
 ('stock_din_04', 'Botanical Gin & Tonic', 'dining', 'dining,cocktail,beverage,tonic', scene_drink, 'lagoon', 800, 800),
 ('stock_tch_01', 'ANC Wireless Headphones Pro', 'tech', 'tech,audio,headphones,gadgets', scene_headphones, 'tech', 800, 600),
 ('stock_tch_02', 'GPS Multisport Smartwatch', 'tech', 'tech,smartwatch,wearables,fitness', scene_watch, 'tech', 800, 600),
 ('stock_tch_03', 'Ultra-Slim Laptop', 'tech', 'tech,laptop,computer,workstation', scene_laptop, 'tech', 800, 600),
 ('stock_re_01', 'Waterfront Luxury Villa', 'realestate', 'realestate,villa,luxury,waterfront', scene_villa, 'villa', 800, 600),
 ('stock_re_02', 'Tropical Pavilion with Pool', 'realestate', 'realestate,pool,architecture,residence', scene_villa, 'lagoon', 800, 600),
 ('stock_nat_01', 'Barrier Reef Coral Lagoon', 'nature', 'nature,ocean,coral,reef,diving,marine', scene_reef, 'lagoon', 800, 600),
 ('stock_nat_02', 'Turquoise Ocean & White Sand Cay', 'nature', 'nature,beach,pacific,tropical,sand', scene_beach, 'tropic', 800, 600),
 ('stock_nat_03', 'Island Sunset over the Lagoon', 'nature', 'nature,sunset,evening,ocean', scene_sunset, 'dusk', 800, 600),
 ('stock_nat_04', 'Highland Adventure Trail', 'nature', 'nature,mountain,hiking,adventure,eco', scene_adventure, 'adv', 800, 600),
 ('stock_prt_01', 'Student Portrait (illustration)', 'people', 'people,student,portrait,yearbook', scene_portrait, 'portf', 600, 800),
 ('stock_prt_02', 'Graduate Portrait (illustration)', 'people', 'people,graduate,portrait,student', scene_portrait, 'portm', 600, 800),
 ('stock_edu_01', 'Graduation Cap', 'people', 'education,graduation,school,yearbook', scene_graduation, 'grad', 800, 600),
 ('stock_wed_01', 'Wedding Rings & Blooms', 'people', 'wedding,rings,album,celebration', scene_wedding, 'wed', 800, 600),
 ('stock_biz_01', 'Business District Skyline', 'business', 'business,office,city,corporate', scene_office, 'office', 800, 600),
 ('stock_abs_01', 'Abstract Ocean Gradient', 'business', 'abstract,background,gradient,blue', scene_abstract, 'abs', 800, 600),
 ('stock_bdg_01', 'Fiji Grown & Crafted Badge', 'badges', 'badge,fiji made,seal,local,organic', scene_badge, 'badge', 400, 400),
]
manifest = []
for name, title, cat, tags, fn, pal, w, h in ART:
    s = fn(P[pal])
    with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8') as f: f.write(s)
    manifest.append({'id': name, 'name': title, 'category': cat, 'tags': tags, 'width': w, 'height': h, 'assetType': 'badge' if cat == 'badges' else 'image'})

# Unsplash photo id -> bundled art (used once to migrate legacy templates; kept for reference/regeneration)
LEGACY = {
 '1534528741775-53994a69daeb': 'stock_prt_01', '1544551763-46a013bb70d5': 'stock_nat_01', '1507525428034-b723cf961d3e': 'stock_nat_02',
 '1519741497674-611481863552': 'stock_wed_01', '1600585154340-be6161a56a0c': 'stock_re_01', '1505740420928-5e560c06d30e': 'stock_tch_01',
 '1542838132-92c53300491e': 'stock_ret_06', '1511285560929-80b456fea0bc': 'stock_nat_03', '1474979266404-7eaacbcd87c5': 'stock_ret_03',
 '1586201375761-83865001e31c': 'stock_ret_01', '1544025162-d76694265947': 'stock_din_01', '1507003211169-0a1dd7228f2d': 'stock_prt_02',
 '1600596542815-ffad4c1539a9': 'stock_re_02', '1587049352846-4a222e784d38': 'stock_ret_02', '1551024709-8f23befc6f87': 'stock_din_04',
 '1550583724-b2692b85b150': 'stock_ret_06', '1523240795612-9a054b0db644': 'stock_edu_01', '1517841905240-472988babdf9': 'stock_prt_01',
 '1509440159596-0249088772ff': 'stock_ret_06', '1500648767791-00dcc994a43e': 'stock_prt_02', '1494790108377-be9c29b29330': 'stock_prt_01',
 '1486406146926-c627a92ad1ab': 'stock_biz_01', '1618005182384-a83a8bd57fbe': 'stock_bdg_01', '1610832958506-aa56368176cf': 'stock_ret_02',
 '1593642632823-8f785ba67e45': 'stock_tch_03', '1589985270826-4b7bb135bc9d': 'stock_din_02', '1585771724684-38269d6639fd': 'stock_ret_05',
 '1571771894821-ce9b6c11b08e': 'stock_ret_02', '1559056199-641a0ac8b55e': 'stock_din_01', '1558317374-067fb5f30001': 'stock_nat_04',
 '1550258987-190a2d41a8ba': 'stock_ret_04', '1549007994-cb92caebd54b': 'stock_din_03', '1546470427-e26264be0b11': 'stock_ret_05',
 '1539571696357-5a69c17a67c6': 'stock_prt_01', '1534483509719-3feaee7c30da': 'stock_abs_01', '1533777857889-4be7c70b33f7': 'stock_din_02',
 '1526947425960-945c6e72858f': 'stock_ret_06', '1524504388940-b1c1722653e1': 'stock_prt_01', '1523275335684-37898b6baf30': 'stock_tch_02',
 '1522337360788-8b13dee7a37e': 'stock_edu_01', '1518110925495-5fe2fda0442c': 'stock_nat_04', '1517336714731-489689fd1ca8': 'stock_tch_03',
 '1517282009859-f000ec3b26fe': 'stock_nat_03', '1514362545857-3bc16c4c7d1b': 'stock_din_03', '1496181133206-80ce9b88a853': 'stock_tch_03',
}
with open(os.path.join(OUT, 'stock.json'), 'w', encoding='utf-8') as f:
    json.dump({'items': manifest, 'legacyUnsplash': LEGACY}, f, indent=1)
print(f'wrote {len(ART)} svgs')
