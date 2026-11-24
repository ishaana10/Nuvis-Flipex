#!/usr/bin/env python3
"""Generates the free Flipex Studio template library (FDS v1.0 JSON) + manifest.
Pure stdlib. Output: backend/resources/studio/templates/**.json and manifest.json.
All imagery references the bundled original artwork (/api/v1/studio-stock/*.svg): no external assets.
Re-run after editing, then `php backend/bin/cache.php flush`."""
import json, os, datetime

ROOT = os.path.join(os.path.dirname(__file__), '..', 'backend', 'resources', 'studio', 'templates')
A4W, A4H = 595.28, 841.89
S = lambda n: f'/api/v1/studio-stock/{n}.svg'
_id = [0]

def nid(p='e'):
    _id[0] += 1
    return f'{p}{_id[0]}'

def el(t, x, y, w, h, **kw):
    style = kw.pop('style', {})
    e = {'id': nid(), 'type': t, 'frame': {'x': x, 'y': y, 'width': w, 'height': h}, 'x': x, 'y': y, 'w': w, 'h': h,
         'transform': {'rotation': kw.pop('rotation', 0), 'scaleX': 1, 'scaleY': 1, 'opacity': 1},
         'style': style, 'content': kw.pop('content', ''), 'locked': False, 'editable': True, 'zIndex': kw.pop('z', 1)}
    e.update(kw)
    return e

def text(x, y, w, h, content, size=14, color='#0f172a', weight='normal', align='left', family=None, ls=None, lh=None, italic=False, upper=False, **kw):
    st = {'fontSize': size, 'fontWeight': weight, 'color': color, 'textAlign': align}
    if family: st['fontFamily'] = family
    if ls: st['letterSpacing'] = ls
    if lh: st['lineHeight'] = lh
    if italic: st['fontStyle'] = 'italic'
    if upper: st['textTransform'] = 'uppercase'
    return el('text', x, y, w, h, content=content, style=st, **kw)

def image(x, y, w, h, art, radius=0, **kw):
    return el('imageFrame', x, y, w, h, style={'borderRadius': radius}, assetRef={'url': S(art)}, url=S(art), src=S(art), image=S(art), objectFit='cover', **kw)

def rect(x, y, w, h, fill, radius=0, **kw):
    return el('shape', x, y, w, h, shapeType='rect', style={'backgroundColor': fill, 'borderRadius': radius}, **kw)

def circle(x, y, d, fill, **kw):
    return el('shape', x, y, d, d, shapeType='circle', style={'backgroundColor': fill}, **kw)

def product(x, y, w, h, name, price, art, old=None, badge=None, sku=None, wa='6799991234', desc=''):
    e = el('productCard', x, y, w, h, name=name, price=price, image=S(art), src=S(art), url=S(art), whatsappNumber=wa, stockStatus='in_stock', description=desc, rating=5)
    if old: e['originalPrice'] = old
    if badge: e['badge'] = badge
    if sku: e['sku'] = sku
    return e

def student(x, y, w, h, name, art, award='', quote='', year='2026'):
    return el('studentCard', x, y, w, h, name=name, image=S(art), src=S(art), photoUrl=S(art), award=award, quote=quote, classYear=year)

def button(x, y, w, h, label, fill, url, color='#ffffff'):
    return el('button', x, y, w, h, content=label, style={'backgroundColor': fill, 'color': color, 'borderRadius': h / 2, 'fontWeight': 'bold', 'fontSize': 12, 'textAlign': 'center'}, linkUrl=url)

def folio(label, color='#94a3b8'):
    return el('folio', 36, A4H - 36, A4W - 72, 20, folioHeader=label, folioShowPage=True)

def toc(x, y, w, h, items, title='Contents'):
    return el('toc', x, y, w, h, content=title, tocItems=[{'title': t, 'page_number': p} for t, p in items])

def page(n, ptype, bg, elements, w=A4W, h=A4H):
    if isinstance(bg, (list, tuple)):
        b = {'type': 'gradient', 'value': f'linear-gradient(135deg, {bg[0]}, {bg[-1]})', 'stops': list(bg), 'angle': 135, 'stop1': bg[0], 'stop2': bg[len(bg) // 2], 'stop3': bg[-1]}
    else:
        b = {'type': 'solid', 'value': bg, 'stops': None, 'angle': None}
    return {'pageNumber': n, 'id': f'page_{n}', 'name': f'Page {n}', 'type': ptype, 'background': b, 'elements': elements}

def template(tid, slug, title, desc, cat, doctype, pages, tags, folder, w=A4W, h=A4H, orient='portrait'):
    return {'meta': {'id': tid, 'slug': slug, 'name': title, 'category': cat, 'docType': doctype, 'description': desc, 'pagesCount': len(pages), 'tags': tags,
                     'version': '2.0.0', 'file': f'{folder}/{slug}.json', 'thumbnailUrl': f'/api/v1/studio-template-thumb/{tid}.svg'},
            'doc': {'$schema': 'https://nuvis.flipex/schemas/fds-v1.json', 'schema': 'flipex.design', 'schemaVersion': '1.0.0', 'id': tid, 'title': title,
                    'description': desc, 'category': cat, 'docType': doctype, 'version': '2.0.0',
                    'document': {'width': w, 'height': h, 'unit': 'pt', 'orientation': orient, 'dpi': 300,
                                 'bleed': {'top': 9, 'right': 9, 'bottom': 9, 'left': 9}, 'safeMargins': {'top': 36, 'right': 36, 'bottom': 36, 'left': 36},
                                 'grid': {'columns': 12, 'rows': 8, 'gutter': 12}}, 'pages': pages}}

T = []
GOLD, NAVY, INK = '#f5c542', '#0a2a5e', '#0f172a'

def cover_dark(n, bg, kicker, title, sub, art, accent, y=470):
    return page(n, 'cover', bg, [
        image(0, 0, A4W, 430, art), rect(0, 400, A4W, 40, accent),
        text(40, y, 515, 40, kicker, 12, accent, 'bold', ls='3px', upper=True),
        text(40, y + 34, 515, 130, title, 40, '#ffffff', 'bold', lh=1.1),
        text(40, y + 170, 515, 70, sub, 14, '#cbd5e1', lh=1.45)])

# ---------------------------------------------------------------- 01 supermarket
_p = lambda *a, **k: product(*a, **k)
T.append(template('tpl_cat_supermarket_01', 'pacific-supermarket-weekly-specials', 'Pacific Supermarket Weekly Specials',
  'Promotional grocery catalogue with price tags, savings badges, product grids and one-tap WhatsApp ordering.', 'retail_catalogue', 'catalogue', [
  page(1, 'cover', '#0f172a', [
    image(0, 0, A4W, 400, 'stock_ret_06'), rect(0, 372, A4W, 56, '#f5c542'),
    text(40, 384, 515, 36, 'WEEKLY SPECIALS  -  VALID THIS WEEK ONLY', 15, '#0f172a', 'bold', 'center', ls='2px'),
    text(40, 460, 515, 90, 'Island Harvest Supermarket', 40, '#ffffff', 'bold', 'center', lh=1.1),
    text(60, 560, 475, 60, 'Fresh produce, pantry staples and household favourites at prices your whole family will love.', 15, '#cbd5e1', align='center', lh=1.5),
    button(180, 660, 235, 40, 'Order on WhatsApp', '#059669', 'https://wa.me/6799991234'),
    text(40, 770, 515, 20, 'Prices in FJD  -  while stocks last', 10, '#94a3b8', align='center')]),
  page(2, 'inside', '#f8fafc', [
    text(40, 36, 515, 40, 'Fresh & Pantry', 28, INK, 'bold'), text(40, 76, 515, 20, 'Hand-picked weekly savings', 12, '#64748b'),
    _p(40, 110, 235, 300, 'Premium Island Rice 10kg', 'FJ$22.50', 'stock_ret_01', old='FJ$26.00', badge='SAVE $3.50', sku='RC-10'),
    _p(320, 110, 235, 300, 'Sweet Yellow Bananas 1kg', 'FJ$2.99', 'stock_ret_02', old='FJ$3.80', badge='FRESH', sku='BN-01'),
    _p(40, 440, 235, 300, 'Pure Coconut Oil 2L', 'FJ$11.95', 'stock_ret_03', old='FJ$14.20', badge='HOT DEAL', sku='OL-02'),
    _p(320, 440, 235, 300, 'Organic Pineapples each', 'FJ$4.50', 'stock_ret_04', badge='LOCAL', sku='PN-01'), folio('Island Harvest - Weekly Specials')]),
  page(3, 'inside', '#fff7ed', [
    text(40, 36, 515, 40, 'Fruit & Veg Market', 28, '#9a3412', 'bold'), text(40, 76, 515, 20, 'Straight from the farm gate', 12, '#9a3412'),
    _p(40, 110, 235, 300, 'Vine-Ripened Tomatoes 1kg', 'FJ$3.80', 'stock_ret_05', badge='FARM FRESH'),
    _p(320, 110, 235, 300, 'Kokoda Seafood Pack', 'FJ$18.00', 'stock_din_01', old='FJ$21.00', badge='CHEF PICK'),
    rect(40, 440, 515, 150, '#ea580c', 16),
    text(70, 462, 455, 40, 'Bulk Buy Saver', 26, '#ffffff', 'bold'),
    text(70, 506, 455, 60, 'Buy any 3 pantry items and get FJ$5 off your basket. Show this page at the checkout.', 14, '#ffedd5', lh=1.45),
    rect(40, 620, 515, 110, '#ffffff', 14), text(60, 636, 475, 28, 'Store hours', 16, INK, 'bold'),
    text(60, 666, 475, 50, 'Mon-Sat 7:00am - 8:00pm   |   Sunday 8:00am - 4:00pm', 13, '#475569', lh=1.5), folio('Island Harvest - Weekly Specials')]),
  page(4, 'back_cover', '#0f172a', [
    image(0, 0, A4W, 300, 'stock_nat_02'),
    text(40, 340, 515, 60, 'Shop smarter, every week', 32, '#ffffff', 'bold', 'center'),
    text(60, 420, 475, 70, 'Message us your order and collect in store or choose home delivery in the greater Suva area.', 15, '#cbd5e1', align='center', lh=1.5),
    button(160, 520, 275, 44, 'Chat & Order on WhatsApp', '#059669', 'https://wa.me/6799991234'),
    text(40, 620, 515, 20, 'Island Harvest Supermarket  -  Suva, Fiji', 11, '#94a3b8', align='center')])
  ], ['retail', 'groceries', 'supermarket', 'weekly specials', 'fiji'], 'catalogue'))

# ---------------------------------------------------------------- 02 tech
T.append(template('tpl_cat_techpro_02', 'techpro-pacific-gadget-showcase', 'TechPro Pacific Gadget Showcase',
  'Electronics and gadget catalogue with feature spec cards, price drops and WhatsApp ordering.', 'electronics_tech', 'catalogue', [
  page(1, 'cover', ['#050b1a', '#0b2a63', '#0b5cad'], [
    text(40, 50, 515, 20, 'TECHPRO PACIFIC', 12, '#38bdf8', 'bold', ls='4px'),
    text(40, 90, 515, 150, 'Next-Gen Audio, Wearables & Laptops', 44, '#ffffff', 'bold', lh=1.1),
    image(60, 290, 475, 340, 'stock_tch_01', 24), text(40, 660, 515, 60, 'Authorised dealer  -  12 month warranty  -  free setup in store', 14, '#bfdbfe', lh=1.5),
    button(40, 740, 200, 40, 'Shop the range', GOLD, 'https://wa.me/6799991234', '#0a2a5e')]),
  page(2, 'inside', '#0b1220', [
    text(40, 36, 515, 36, 'Audio & Wearables', 26, '#ffffff', 'bold'), text(40, 72, 515, 20, 'Hear it. Track it. Wear it.', 12, '#7dd3fc'),
    product(40, 110, 515, 320, 'ANC Wireless Headphones Pro', 'FJ$399', 'stock_tch_01', old='FJ$469', badge='LAUNCH PRICE', sku='HP-ANC1', desc='40h battery, adaptive noise cancelling'),
    product(40, 460, 245, 290, 'GPS Multisport Watch', 'FJ$549', 'stock_tch_02', badge='NEW', sku='SW-GPS2'),
    product(310, 460, 245, 290, 'Slim Laptop 14"', 'FJ$1,799', 'stock_tch_03', old='FJ$1,999', badge='SAVE $200', sku='LP-14S'), folio('TechPro Pacific')]),
  page(3, 'inside', '#f1f5f9', [
    text(40, 36, 515, 36, 'Why buy local?', 26, INK, 'bold'),
    rect(40, 100, 245, 180, '#ffffff', 14), text(58, 118, 210, 26, 'Warranty in Fiji', 15, '#0b5cad', 'bold'), text(58, 148, 210, 120, 'Claims handled in store. No overseas shipping, no waiting.', 12, '#475569', lh=1.5),
    rect(310, 100, 245, 180, '#ffffff', 14), text(328, 118, 210, 26, 'Free setup', 15, '#0b5cad', 'bold'), text(328, 148, 210, 120, 'We configure your device and transfer your files before you leave.', 12, '#475569', lh=1.5),
    rect(40, 310, 245, 180, '#ffffff', 14), text(58, 328, 210, 26, 'Trade-in credit', 15, '#0b5cad', 'bold'), text(58, 358, 210, 120, 'Bring your old phone or laptop and get credit towards an upgrade.', 12, '#475569', lh=1.5),
    rect(310, 310, 245, 180, '#ffffff', 14), text(328, 328, 210, 26, 'Pay your way', 15, '#0b5cad', 'bold'), text(328, 358, 210, 120, 'Cash, card, mobile money or 12-month instalments.', 12, '#475569', lh=1.5),
    button(160, 540, 275, 44, 'Ask us on WhatsApp', '#059669', 'https://wa.me/6799991234'), folio('TechPro Pacific')])
  ], ['tech', 'electronics', 'gadgets', 'laptops', 'audio'], 'catalogue'))

# ---------------------------------------------------------------- 03 resort menu
T.append(template('tpl_cat_restaurant_03', 'coral-coast-luxury-resort-menu', 'Coral Coast Resort Menu & Wine List',
  'Elegant dining menu with signature dishes, drinks and a reservation button.', 'food_restaurant', 'catalogue', [
  cover_dark(1, '#1c1917', 'Fine dining by the lagoon', 'Navatu Ocean Dining', 'Seafood, island flavours and sunset cocktails on the water.', 'stock_din_01', GOLD),
  page(2, 'inside', '#1c1917', [
    text(40, 40, 515, 40, 'Signature Plates', 30, GOLD, 'bold', family='Georgia', ls='2px'),
    product(40, 100, 515, 230, 'Island Kokoda', 'FJ$28', 'stock_din_01', badge="CHEF'S PICK", desc='Fresh walu cured in lime and coconut cream'),
    product(40, 350, 245, 290, 'Coral Rock Lobster', 'FJ$85', 'stock_din_02', badge='SEASONAL'),
    product(310, 350, 245, 290, 'Lovo Slow-Roast Pork', 'FJ$42', 'stock_ret_06'), folio('Navatu Ocean Dining', '#a8a29e')]),
  page(3, 'inside', '#292524', [
    text(40, 40, 515, 40, 'Sunset Drinks', 30, GOLD, 'bold', family='Georgia', ls='2px'),
    product(40, 100, 245, 290, 'Pacific Sunset Cocktail', 'FJ$22', 'stock_din_03', badge='HAPPY HOUR'),
    product(310, 100, 245, 290, 'Botanical Gin & Tonic', 'FJ$24', 'stock_din_04'),
    rect(40, 430, 515, 270, '#1c1917', 16),
    text(70, 452, 455, 30, 'Wine by the glass', 20, GOLD, 'bold', family='Georgia'),
    text(70, 492, 455, 190, 'Marlborough Sauvignon Blanc  -  FJ$16\nBarossa Shiraz  -  FJ$18\nProsecco Brut  -  FJ$15\nFresh young coconut  -  FJ$6', 14, '#e7e5e4', lh=1.9), folio('Navatu Ocean Dining', '#a8a29e')]),
  page(4, 'back_cover', '#1c1917', [
    image(0, 0, A4W, 320, 'stock_nat_03'), text(40, 360, 515, 50, 'Reserve your table', 32, GOLD, 'bold', 'center', family='Georgia'),
    text(60, 420, 475, 60, 'Dinner service 5:30pm - 10:00pm daily. Sunset seating is popular, so please book ahead.', 14, '#d6d3d1', align='center', lh=1.5),
    button(170, 520, 255, 44, 'Book on WhatsApp', '#059669', 'https://wa.me/6799991234')])
  ], ['restaurant', 'menu', 'resort', 'dining', 'wine'], 'catalogue'))

# ---------------------------------------------------------------- 04 property
T.append(template('tpl_cat_realestate_04', 'suva-waterfront-villa-property', 'Waterfront Villa & Property Showcase',
  'Property brochure with hero imagery, key facts, floor highlights and an enquiry button.', 'real_estate', 'catalogue', [
  cover_dark(1, '#0b1f3a', 'For sale - freehold', 'Waterfront Villa, Denarau', '4 bedrooms  -  3 bathrooms  -  private pool  -  120m of beach frontage', 'stock_re_01', GOLD),
  page(2, 'inside', '#ffffff', [
    text(40, 36, 515, 36, 'The Residence', 28, NAVY, 'bold'),
    text(40, 84, 515, 110, 'A light-filled villa designed around the lagoon. Open-plan living flows onto a shaded deck and infinity pool, with every bedroom opening to garden or sea views.', 14, '#475569', lh=1.6),
    image(40, 210, 515, 280, 'stock_re_02', 14),
    rect(40, 520, 120, 100, '#f1f5f9', 12), text(40, 540, 120, 30, '4', 28, NAVY, 'bold', 'center'), text(40, 580, 120, 24, 'Bedrooms', 11, '#64748b', align='center'),
    rect(172, 520, 120, 100, '#f1f5f9', 12), text(172, 540, 120, 30, '3', 28, NAVY, 'bold', 'center'), text(172, 580, 120, 24, 'Bathrooms', 11, '#64748b', align='center'),
    rect(304, 520, 120, 100, '#f1f5f9', 12), text(304, 540, 120, 30, '520m2', 22, NAVY, 'bold', 'center'), text(304, 580, 120, 24, 'Living area', 11, '#64748b', align='center'),
    rect(436, 520, 119, 100, '#f1f5f9', 12), text(436, 540, 119, 30, '2', 28, NAVY, 'bold', 'center'), text(436, 580, 119, 24, 'Car bays', 11, '#64748b', align='center'),
    text(40, 650, 515, 90, 'Included: designer kitchen, solar hot water, air-conditioning throughout, security system and landscaped gardens.', 13, '#475569', lh=1.6), folio('Waterfront Villa, Denarau')]),
  page(3, 'back_cover', NAVY, [
    image(0, 0, A4W, 300, 'stock_nat_03'), text(40, 340, 515, 44, 'Arrange a private viewing', 30, '#ffffff', 'bold', 'center'),
    text(60, 400, 475, 70, 'Offers invited above FJ$2.4m. Foreign buyers welcome with approved consent.', 14, '#bfdbfe', align='center', lh=1.5),
    button(160, 500, 275, 44, 'Enquire on WhatsApp', '#059669', 'https://wa.me/6799991234')])
  ], ['real estate', 'property', 'villa', 'brochure'], 'catalogue'))

# ---------------------------------------------------------------- 05 yearbook
STU = [('Aisha Rahman', 'stock_prt_01', 'Dux', 'Dream big, work hard.'), ('Jone Tuilagi', 'stock_prt_02', 'Sports Captain', 'Play with heart.'),
       ('Mere Vakacegu', 'stock_prt_01', 'Arts Award', 'Create every day.'), ('Sami Prasad', 'stock_prt_02', 'Science Prize', 'Stay curious.'),
       ('Losana Nadan', 'stock_prt_01', 'Head Girl', 'Lead by example.'), ('Ravi Chand', 'stock_prt_02', 'Music Award', 'Let it ring.')]
def grid(n, bg, title):
    els = [text(40, 36, 515, 40, title, 26, '#ffffff', 'bold'), text(40, 76, 515, 22, 'Class of 2026', 12, '#7dd3fc')]
    for i, (nm, art, aw, q) in enumerate(STU):
        els.append(student(40 + (i % 3) * 180, 120 + (i // 3) * 220, 165, 200, nm, art, aw, q))
    els.append(text(40, 590, 515, 120, 'Memories made together last a lifetime. To every graduate: thank you for the laughs, the lessons and the legacy you leave behind.', 14, '#e0f2fe', lh=1.6, italic=True))
    els.append(folio('Pacific Heritage College - Class of 2026'))
    return page(n, 'inside', bg, els)
T.append(template('tpl_mag_yearbook_05', 'pacific-heritage-senior-graduate-yearbook', 'Pacific Heritage Senior Yearbook',
  'School yearbook with cover, principal message, graduate profile cards and awards.', 'school_yearbook', 'magazine', [
  page(1, 'cover', ['#0a2a5e', '#0b5cad', '#0ea5e9'], [image(60, 70, 475, 340, 'stock_edu_01', 20), text(40, 450, 515, 100, 'Class of 2026', 52, '#ffffff', 'bold', 'center'),
    text(40, 540, 515, 30, 'PACIFIC HERITAGE COLLEGE', 14, GOLD, 'bold', 'center', ls='4px'), text(60, 600, 475, 60, 'Senior Yearbook  -  Rooted in tradition, leading with excellence.', 14, '#bae6fd', align='center', lh=1.5)]),
  page(2, 'inside', ['#0a2a5e', '#0b5cad'], [text(40, 40, 515, 36, "Principal's Message", 26, '#ffffff', 'bold'),
    text(40, 100, 515, 400, 'To the graduating class of 2026,\n\nYou have shown resilience, leadership and remarkable academic curiosity across your years with us. As you venture into higher learning and your careers, remember the foundations forged on these shores: respect, service and community.\n\nCarry our school values wherever you go, and return often. This is your home.', 15, '#e0f2fe', lh=1.7),
    text(40, 520, 515, 24, 'Mrs. Litia Waqa, Principal', 14, GOLD, 'bold', italic=True), folio('Pacific Heritage College - Class of 2026')]),
  grid(3, ['#0a2a5e', '#0b5cad'], 'Our Graduates'), grid(4, ['#0b5cad', '#0a2a5e'], 'Awards & Honours')
  ], ['yearbook', 'school', 'graduation', 'students'], 'yearbook'))

# ---------------------------------------------------------------- 06 magazine
T.append(template('tpl_mag_lifestyle_06', 'island-horizon-lifestyle-travel', 'Island Horizon Lifestyle & Travel Magazine',
  'Editorial magazine with feature spread, pull quote, contents page and column text.', 'community_magazine', 'magazine', [
  page(1, 'cover', '#0c4a6e', [image(0, 0, A4W, A4H, 'stock_nat_02'), rect(0, 560, A4W, 282, '#0c4a6e', 0, z=2),
    text(36, 590, 520, 60, 'ISLAND HORIZON', 40, GOLD, 'bold', ls='6px', z=3), text(36, 650, 520, 80, 'The Slow Travel Issue: lagoons, lovo and local legends', 22, '#ffffff', 'bold', z=3, lh=1.25),
    text(36, 760, 520, 24, 'Summer 2026  -  FJ$9.95', 12, '#bae6fd', z=3)]),
  page(2, 'inside', '#ffffff', [text(40, 40, 515, 34, 'In this issue', 26, INK, 'bold'),
    toc(40, 90, 515, 260, [('Letter from the editor', 3), ('Lagoon hopping in the Yasawas', 4), ('Kitchen: the art of lovo', 5), ('Island playlist', 6)], 'Contents'),
    image(40, 390, 515, 300, 'stock_nat_03', 12), text(40, 710, 515, 60, 'On the cover: dusk over a Mamanuca cay, photographed from the water.', 11, '#64748b', italic=True), folio('Island Horizon - Summer 2026')]),
  page(3, 'inside', '#fffbeb', [text(40, 40, 515, 20, 'EDITOR', 10, '#d97706', 'bold', ls='3px'), text(40, 62, 515, 60, 'Slow down, you are on island time', 28, INK, 'bold', lh=1.15),
    el('article', 40, 150, 515, 380, content='There is a particular rhythm to life on the islands. Mornings start with kava and conversation, afternoons stretch out under the shade of a breadfruit tree, and evenings belong to the tide.\n\nThis issue is an invitation to travel that way: unhurried, curious and connected to the people who call these places home. We visit villages that welcome visitors with a sevusevu, taste recipes passed down through generations and find the quiet corners that guidebooks miss.\n\nWherever you read this, we hope it sends you somewhere beautiful.', columns=2, columnGutter=24, style={'fontSize': 12.5, 'color': '#334155', 'lineHeight': 1.55}),
    rect(40, 560, 515, 140, '#0c4a6e', 14), text(64, 580, 467, 100, '"The best journeys are the ones that change your pace."', 20, '#ffffff', 'bold', family='Georgia', italic=True, lh=1.35), folio('Island Horizon - Summer 2026')]),
  page(4, 'inside', '#ffffff', [image(0, 0, A4W, 380, 'stock_nat_01'), text(40, 410, 515, 30, 'FEATURE', 10, '#0284c7', 'bold', ls='3px'),
    text(40, 436, 515, 90, 'Lagoon hopping in the Yasawas', 30, INK, 'bold', lh=1.15),
    el('article', 40, 540, 515, 230, content='Seven days, six islands and not a single traffic light. Our route follows the Yasawa chain north from Nadi, trading resort comforts for village stays, snorkelling over living reef and evenings of string-band music.\n\nPack light, bring reef-safe sunscreen and leave room in your bag for the handwoven gifts you will not be able to resist.', columns=2, columnGutter=24, style={'fontSize': 12, 'color': '#334155', 'lineHeight': 1.55}), folio('Island Horizon - Summer 2026')])
  ], ['magazine', 'travel', 'lifestyle', 'editorial'], 'magazine'))

# ---------------------------------------------------------------- 07 wedding
T.append(template('tpl_alb_wedding_07', 'island-sanctuary-luxury-wedding-keepsake', 'Island Sanctuary Wedding Keepsake Album',
  'Romantic wedding album with cover, photo spreads, vows and thank-you page.', 'wedding_album', 'album', [
  page(1, 'cover', ['#fff1f2', '#ffe4e6'], [image(80, 90, 435, 330, 'stock_wed_01', 200), text(40, 470, 515, 70, 'Mere & Josefa', 44, '#9f1239', 'bold', 'center', family='Georgia', italic=True),
    text(40, 550, 515, 24, '12 . 09 . 2026', 14, '#be123c', 'bold', 'center', ls='6px'), text(60, 600, 475, 60, 'Together with our families, in the shelter of the palms.', 14, '#9f1239', align='center', lh=1.5, italic=True)]),
  page(2, 'inside', '#ffffff', [image(40, 40, 515, 330, 'stock_nat_03', 8), image(40, 390, 250, 250, 'stock_nat_02', 8), image(305, 390, 250, 250, 'stock_wed_01', 8),
    text(40, 670, 515, 60, 'Golden hour on the sand', 22, '#9f1239', 'bold', 'center', family='Georgia', italic=True), folio('Mere & Josefa', '#fda4af')]),
  page(3, 'inside', '#fff1f2', [text(40, 80, 515, 50, 'Our Vows', 34, '#9f1239', 'bold', 'center', family='Georgia', italic=True),
    text(70, 170, 455, 360, 'I promise to be your calm in the storm,\nyour laughter on ordinary days,\nand your home wherever we are.\n\nI promise to walk beside you,\nto choose you again each morning,\nand to love you with all that I am.', 17, '#881337', align='center', family='Georgia', lh=1.9, italic=True),
    folio('Mere & Josefa', '#fda4af')]),
  page(4, 'back_cover', '#9f1239', [text(40, 280, 515, 60, 'Vinaka vakalevu', 40, '#fff1f2', 'bold', 'center', family='Georgia', italic=True),
    text(70, 360, 455, 120, 'Thank you for celebrating with us. Your love made our day unforgettable.', 16, '#fecdd3', align='center', lh=1.6), circle(272, 520, 50, GOLD)])
  ], ['wedding', 'album', 'keepsake', 'photo book'], 'album'))

# ---------------------------------------------------------------- 08 annual report
def stat(x, y, big, small, accent):
    return [rect(x, y, 160, 110, '#f1f5f9', 12), text(x, y + 22, 160, 44, big, 30, accent, 'bold', 'center'), text(x + 10, y + 70, 140, 34, small, 11, '#64748b', align='center')]
T.append(template('tpl_rep_annual_08', 'pacific-enterprise-corporate-annual-report', 'Pacific Enterprise Annual Report',
  'Corporate annual report with highlights, key figures, chairman message and outlook.', 'annual_report', 'custom', [
  page(1, 'cover', ['#050f26', '#0a2a5e', '#0b5cad'], [text(40, 60, 515, 22, 'ANNUAL REPORT 2026', 13, GOLD, 'bold', ls='5px'), text(40, 100, 515, 200, 'Building a stronger Pacific together', 46, '#ffffff', 'bold', lh=1.1),
    image(40, 420, 515, 300, 'stock_biz_01', 16), text(40, 760, 515, 24, 'Pacific Enterprise Group  -  Suva, Fiji', 12, '#93c5fd')]),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 36, 'Year in numbers', 28, NAVY, 'bold'), *stat(40, 100, 'FJ$48m', 'Revenue, up 12%', '#0b5cad'), *stat(218, 100, '1,240', 'Team members', '#0b5cad'), *stat(396, 100, '9', 'Island offices', '#0b5cad'),
    *stat(40, 240, '94%', 'Customer satisfaction', '#059669'), *stat(218, 240, 'FJ$3.1m', 'Community investment', '#059669'), *stat(396, 240, '31%', 'Renewable energy', '#059669'),
    text(40, 390, 515, 24, 'Highlights', 18, NAVY, 'bold'),
    text(40, 424, 515, 300, 'Opened three new regional service centres in Labasa, Savusavu and Taveuni.\n\nLaunched a graduate programme that placed 64 young Fijians in full-time roles.\n\nCut operating emissions by 18% through fleet and facility upgrades.\n\nCompleted the digital migration of all customer records, reducing service times by 40%.', 13, '#334155', lh=1.7), folio('Pacific Enterprise - Annual Report 2026')]),
  page(3, 'inside', '#f8fafc', [text(40, 36, 515, 36, "Chairman's message", 28, NAVY, 'bold'),
    el('article', 40, 96, 515, 460, content='This was a year of disciplined growth. We invested in people, infrastructure and the communities we serve, and the results speak for themselves.\n\nOur strategy remains simple: be close to our customers, be responsible with our resources and be ambitious for the region. Thank you to our staff, partners and shareholders for your trust.\n\nLooking ahead, we will expand into new markets, deepen our local supply chains and keep investing in the skills that will carry the Pacific forward.', columns=2, columnGutter=24, style={'fontSize': 12.5, 'color': '#334155', 'lineHeight': 1.6}),
    text(40, 580, 515, 24, 'Ratu Epeli Naqica, Chairman', 14, '#0b5cad', 'bold', italic=True), folio('Pacific Enterprise - Annual Report 2026')]),
  page(4, 'back_cover', NAVY, [text(40, 300, 515, 60, 'Outlook 2027', 40, GOLD, 'bold', 'center'), text(70, 380, 455, 120, 'Growth in tourism, renewables and digital services positions us well. We will keep building responsibly.', 16, '#bfdbfe', align='center', lh=1.6)])
  ], ['annual report', 'corporate', 'finance'], 'custom'))

# ---------------------------------------------------------------- 09 tours
def tour(n, art, name, price, desc):
    return [image(40, 130 + n * 215, 200, 190, art, 12), text(260, 136 + n * 215, 295, 30, name, 18, '#14532d', 'bold'), text(260, 172 + n * 215, 295, 90, desc, 12, '#475569', lh=1.55),
            text(260, 268 + n * 215, 150, 28, price, 18, '#c2410c', 'bold'), button(420, 266 + n * 215, 135, 30, 'Book now', '#059669', 'https://wa.me/6799991234')]
T.append(template('tpl_mkt_adventure_09', 'viti-bula-tour-eco-adventure-guide', 'Viti Bula Eco-Adventure Guide',
  'Tourism brochure with featured tours, prices and booking buttons.', 'marketing_brochure', 'custom', [
  cover_dark(1, '#052e16', 'Fiji adventures', 'Viti Bula Eco Tours', 'Reefs, rainforest and village life with local guides.', 'stock_nat_04', GOLD),
  page(2, 'inside', '#f0fdf4', [text(40, 36, 515, 36, 'Featured Tours', 28, '#14532d', 'bold'), text(40, 76, 515, 20, 'Small groups, local guides, reef-safe operators', 12, '#166534'),
    *tour(0, 'stock_nat_01', 'Reef Snorkel Safari', 'FJ$89 pp', 'Half-day boat trip to three coral gardens with lunch on a sandbar.'),
    *tour(1, 'stock_nat_04', 'Highland Trail Trek', 'FJ$65 pp', 'Guided rainforest walk to a hidden waterfall and village sevusevu.'),
    *tour(2, 'stock_nat_03', 'Sunset Lagoon Cruise', 'FJ$75 pp', 'Two hours on the water with canapes, drinks and live ukulele.'), folio('Viti Bula Eco Tours')]),
  page(3, 'back_cover', '#14532d', [image(0, 0, A4W, 300, 'stock_nat_02'), text(40, 340, 515, 50, 'Plan your adventure', 32, '#ffffff', 'bold', 'center'),
    text(60, 400, 475, 70, 'Group discounts for 6 or more. Transfers from Nadi and Denarau hotels included.', 14, '#bbf7d0', align='center', lh=1.5), button(160, 500, 275, 44, 'Book on WhatsApp', '#059669', 'https://wa.me/6799991234')])
  ], ['tourism', 'brochure', 'adventure', 'travel'], 'custom'))

# ---------------------------------------------------------------- 10 portfolio
T.append(template('tpl_cre_portfolio_10', 'denarau-architecture-design-portfolio', 'Architecture & Design Portfolio',
  'Minimal studio portfolio with project pages, services and contact page.', 'creative_portfolio', 'custom', [
  page(1, 'cover', '#f5f5f4', [text(40, 60, 515, 20, 'STUDIO PORTFOLIO 2026', 12, '#78716c', 'bold', ls='5px'), text(40, 100, 515, 160, 'Tropical architecture, built to breathe', 44, INK, 'bold', lh=1.1),
    image(40, 320, 515, 400, 'stock_re_02', 6), text(40, 760, 515, 24, 'Lagoon & Co. Architects  -  Denarau Island', 12, '#78716c')]),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 36, 'Selected work', 28, INK, 'bold'), image(40, 96, 515, 300, 'stock_re_01', 6), text(40, 410, 515, 28, 'Waterfront Villa, Denarau', 18, INK, 'bold'),
    text(40, 442, 515, 60, 'Passive-cooled living around a lagoon-facing courtyard, with locally milled timber and no air-conditioning in the main living spaces.', 12.5, '#57534e', lh=1.6),
    image(40, 520, 250, 210, 'stock_biz_01', 6), image(305, 520, 250, 210, 'stock_re_02', 6), folio('Lagoon & Co. Architects', '#a8a29e')]),
  page(3, 'inside', '#fafaf9', [text(40, 36, 515, 36, 'Services', 28, INK, 'bold'),
    rect(40, 100, 515, 90, '#ffffff', 10), text(60, 116, 475, 26, 'Residential design', 16, INK, 'bold'), text(60, 144, 475, 40, 'Custom homes and renovations, from concept to completion.', 12, '#57534e', lh=1.5),
    rect(40, 205, 515, 90, '#ffffff', 10), text(60, 221, 475, 26, 'Resort & hospitality', 16, INK, 'bold'), text(60, 249, 475, 40, 'Bures, villas and guest facilities that respect the landscape.', 12, '#57534e', lh=1.5),
    rect(40, 310, 515, 90, '#ffffff', 10), text(60, 326, 475, 26, 'Project management', 16, INK, 'bold'), text(60, 354, 475, 40, 'Budget, programme and contractor coordination across the islands.', 12, '#57534e', lh=1.5), folio('Lagoon & Co. Architects', '#a8a29e')]),
  page(4, 'back_cover', INK, [text(40, 300, 515, 50, "Let's build something", 36, '#ffffff', 'bold', 'center'), text(60, 370, 475, 60, 'hello@lagoonco.example  -  +679 999 1234', 15, '#d6d3d1', align='center'), button(190, 450, 215, 42, 'Start a project', GOLD, 'https://wa.me/6799991234', INK)])
  ], ['portfolio', 'architecture', 'design', 'creative'], 'custom'))

# ---------------------------------------------------------------- 11 cafe
T.append(template('tpl_cat_menu_cafe_11', 'harbour-cafe-menu', 'Harbour Cafe Menu',
  'Casual cafe menu with breakfast, mains and drinks and a pickup order button.', 'food_restaurant', 'catalogue', [
  page(1, 'cover', '#fef3c7', [image(40, 40, 515, 360, 'stock_din_01', 24), text(40, 440, 515, 80, 'Harbour Cafe', 52, '#92400e', 'bold', 'center', family='Georgia'),
    text(40, 530, 515, 30, 'COFFEE  -  BRUNCH  -  ISLAND PLATES', 13, '#b45309', 'bold', 'center', ls='3px'), button(180, 620, 235, 44, 'Order for pickup', '#b45309', 'https://wa.me/6799991234')]),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 36, 'Brunch', 28, '#92400e', 'bold', family='Georgia'),
    product(40, 100, 245, 290, 'Kokoda Bowl', 'FJ$16', 'stock_din_01', badge='POPULAR'), product(310, 100, 245, 290, 'Banana Pancake Stack', 'FJ$14', 'stock_ret_02'),
    rect(40, 420, 515, 300, '#fffbeb', 14), text(64, 440, 467, 28, 'Drinks', 20, '#92400e', 'bold', family='Georgia'),
    text(64, 478, 467, 220, 'Flat white  -  FJ$6\nIced coconut latte  -  FJ$8\nFresh pineapple juice  -  FJ$7\nGinger and lemon tea  -  FJ$5', 14, '#78350f', lh=2), folio('Harbour Cafe', '#d6b88a')])
  ], ['cafe', 'menu', 'brunch', 'coffee'], 'catalogue'))

# ---------------------------------------------------------------- 12 price list
def row(y, a, b, c):
    return [text(48, y, 300, 22, a, 12, INK), text(350, y, 90, 22, b, 12, '#64748b'), text(450, y, 95, 22, c, 12, '#0b5cad', 'bold', 'right')]
T.append(template('tpl_cat_pricelist_12', 'hardware-building-supplies-price-list', 'Hardware & Building Supplies Price List',
  'Clear trade price list with sections, units and a quote request button.', 'retail_catalogue', 'catalogue', [
  page(1, 'cover', '#0a2a5e', [text(40, 60, 515, 20, 'TRADE PRICE LIST - 2026', 12, GOLD, 'bold', ls='4px'), text(40, 100, 515, 150, 'Pacific Hardware & Building Supplies', 40, '#ffffff', 'bold', lh=1.1),
    image(40, 300, 515, 340, 'stock_biz_01', 14), text(40, 670, 515, 60, 'Prices exclude VAT and are valid until 31 March. Bulk and contractor rates on request.', 13, '#bfdbfe', lh=1.5),
    button(40, 750, 220, 40, 'Request a quote', GOLD, 'https://wa.me/6799991234', NAVY)]),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 36, 'Timber & Boards', 26, NAVY, 'bold'), rect(40, 84, 515, 34, NAVY, 6),
    text(48, 92, 300, 20, 'Item', 11, '#ffffff', 'bold'), text(350, 92, 90, 20, 'Unit', 11, '#ffffff', 'bold'), text(450, 92, 95, 20, 'Price', 11, '#ffffff', 'bold', 'right'),
    *row(130, 'Treated pine 100x50 (2.4m)', 'each', 'FJ$14.50'), *row(162, 'Treated pine 150x50 (3.0m)', 'each', 'FJ$26.80'), *row(194, 'Plywood 12mm (2400x1200)', 'sheet', 'FJ$68.00'),
    *row(226, 'Hardboard 6mm (2400x1200)', 'sheet', 'FJ$34.50'), *row(258, 'Roofing iron 0.42 (3.0m)', 'sheet', 'FJ$46.90'),
    text(40, 320, 515, 36, 'Fasteners & Paint', 26, NAVY, 'bold'), rect(40, 368, 515, 34, NAVY, 6), text(48, 376, 300, 20, 'Item', 11, '#ffffff', 'bold'), text(350, 376, 90, 20, 'Unit', 11, '#ffffff', 'bold'), text(450, 376, 95, 20, 'Price', 11, '#ffffff', 'bold', 'right'),
    *row(414, 'Galvanised nails 75mm', '1kg', 'FJ$8.90'), *row(446, 'Roofing screws 65mm', 'box 100', 'FJ$19.00'), *row(478, 'Exterior acrylic paint', '10L', 'FJ$149.00'), *row(510, 'Undercoat primer', '4L', 'FJ$62.00'), folio('Pacific Hardware - Trade Price List')])
  ], ['price list', 'hardware', 'trade', 'building'], 'catalogue'))

# ---------------------------------------------------------------- 13 newsletter
T.append(template('tpl_mag_newsletter_13', 'community-newsletter', 'Community Newsletter',
  'Two-page newsletter for clubs, councils and churches with notices and events.', 'community_magazine', 'magazine', [
  page(1, 'cover', '#ffffff', [rect(0, 0, A4W, 150, NAVY), text(40, 40, 515, 50, 'The Village Voice', 38, GOLD, 'bold', family='Georgia'), text(40, 100, 515, 24, 'Community newsletter  -  Issue 12  -  November', 12, '#bfdbfe'),
    image(40, 180, 515, 260, 'stock_nat_02', 10), text(40, 460, 515, 36, 'Fundraiser raises FJ$12,000 for the new hall', 22, INK, 'bold', lh=1.2),
    el('article', 40, 520, 515, 240, content='Thanks to the generosity of more than 300 families, the annual fundraiser has smashed its target. Funds will go towards a new roof and kitchen for the community hall.\n\nVolunteers are needed this month to help with painting and landscaping. Bring a brush and a smile on Saturday morning.', columns=2, columnGutter=22, style={'fontSize': 12, 'color': '#334155', 'lineHeight': 1.55}), folio('The Village Voice')]),
  page(2, 'inside', '#f8fafc', [text(40, 36, 515, 34, 'Diary dates', 26, NAVY, 'bold'),
    rect(40, 90, 515, 70, '#ffffff', 10), text(60, 104, 100, 40, '14 Nov', 18, '#0b5cad', 'bold'), text(170, 104, 370, 44, 'Working bee at the hall, 8am. Morning tea provided.', 13, '#475569', lh=1.4),
    rect(40, 175, 515, 70, '#ffffff', 10), text(60, 189, 100, 40, '21 Nov', 18, '#0b5cad', 'bold'), text(170, 189, 370, 44, 'Youth rugby fixtures at the village ground.', 13, '#475569', lh=1.4),
    rect(40, 260, 515, 70, '#ffffff', 10), text(60, 274, 100, 40, '5 Dec', 18, '#0b5cad', 'bold'), text(170, 274, 370, 44, 'Christmas carols and lovo night, bring a plate to share.', 13, '#475569', lh=1.4),
    text(40, 360, 515, 30, 'Notices', 22, NAVY, 'bold'), text(40, 396, 515, 200, 'Water supply maintenance on Tuesday, expect low pressure from 9am to 1pm.\n\nLost: a blue school bag near the bus stop. Please contact the office.\n\nNew members are always welcome. Speak to any committee member.', 13, '#475569', lh=1.7), folio('The Village Voice')])
  ], ['newsletter', 'community', 'club', 'church'], 'magazine'))

# ---------------------------------------------------------------- 14 school prospectus
T.append(template('tpl_mag_school_14', 'primary-school-prospectus', 'Primary School Prospectus',
  'Welcoming school prospectus with values, facilities and an enrolment enquiry button.', 'school_yearbook', 'magazine', [
  cover_dark(1, '#0b5cad', 'Enrolments open', 'Sunrise Primary School', 'Where every child is known, valued and inspired to learn.', 'stock_edu_01', GOLD),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 36, 'Our values', 28, NAVY, 'bold'),
    rect(40, 96, 160, 150, '#eff6ff', 12), text(50, 116, 140, 28, 'Respect', 18, '#0b5cad', 'bold', 'center'), text(52, 152, 136, 80, 'For ourselves, each other and our environment.', 11.5, '#475569', align='center', lh=1.45),
    rect(218, 96, 160, 150, '#eff6ff', 12), text(228, 116, 140, 28, 'Curiosity', 18, '#0b5cad', 'bold', 'center'), text(230, 152, 136, 80, 'We ask questions and love finding the answers.', 11.5, '#475569', align='center', lh=1.45),
    rect(396, 96, 159, 150, '#eff6ff', 12), text(406, 116, 139, 28, 'Service', 18, '#0b5cad', 'bold', 'center'), text(408, 152, 135, 80, 'We contribute to our families and community.', 11.5, '#475569', align='center', lh=1.45),
    image(40, 280, 515, 260, 'stock_prt_01', 12), text(40, 560, 515, 24, 'Facilities', 20, NAVY, 'bold'),
    text(40, 592, 515, 150, 'Modern classrooms with learning technology  -  library and reading garden  -  sports field and covered court  -  music and arts studio  -  breakfast and after-school care.', 13, '#475569', lh=1.7), folio('Sunrise Primary School')]),
  page(3, 'back_cover', NAVY, [text(40, 280, 515, 60, 'Visit us', 40, GOLD, 'bold', 'center'), text(70, 360, 455, 100, 'Open mornings every second Saturday. Tour the school, meet teachers and ask us anything.', 15, '#bfdbfe', align='center', lh=1.6), button(160, 500, 275, 44, 'Enquire on WhatsApp', '#059669', 'https://wa.me/6799991234')])
  ], ['school', 'prospectus', 'education', 'enrolment'], 'yearbook'))

# ---------------------------------------------------------------- 15 family album
T.append(template('tpl_alb_family_15', 'family-memories-photo-album', 'Family Memories Photo Album',
  'Warm family album with captioned photo pages for holidays and milestones.', 'family_album', 'album', [
  page(1, 'cover', ['#fef3c7', '#fde68a'], [image(70, 80, 455, 360, 'stock_nat_02', 18), text(40, 480, 515, 70, 'Our Family Album', 44, '#92400e', 'bold', 'center', family='Georgia', italic=True), text(40, 560, 515, 26, 'Summer in the islands  -  2026', 14, '#b45309', align='center', ls='3px')]),
  page(2, 'inside', '#ffffff', [image(40, 40, 515, 340, 'stock_nat_03', 8), text(40, 392, 515, 26, 'Sunset on the first evening', 14, '#92400e', align='center', italic=True, family='Georgia'),
    image(40, 440, 250, 240, 'stock_nat_01', 8), image(305, 440, 250, 240, 'stock_nat_04', 8), text(40, 692, 250, 22, 'Snorkelling with the kids', 12, '#92400e', align='center', italic=True, family='Georgia'), text(305, 692, 250, 22, 'The hike to the waterfall', 12, '#92400e', align='center', italic=True, family='Georgia'), folio('Our Family Album', '#d6b88a')]),
  page(3, 'inside', '#fffbeb', [text(40, 60, 515, 40, 'Little moments', 30, '#92400e', 'bold', 'center', family='Georgia', italic=True),
    image(40, 130, 160, 200, 'stock_prt_01', 10, rotation=-3), image(218, 150, 160, 200, 'stock_prt_02', 10, rotation=2), image(396, 130, 160, 200, 'stock_prt_01', 10, rotation=-2),
    text(60, 400, 475, 200, 'Missing teeth and sandy toes. Late-night card games and early-morning swims. The days we want to remember forever, written down so we never forget.', 16, '#78350f', align='center', lh=1.8, family='Georgia', italic=True), folio('Our Family Album', '#d6b88a')])
  ], ['family', 'album', 'photo book', 'holiday'], 'album'))

# ---------------------------------------------------------------- 16 travel journal
T.append(template('tpl_alb_travel_16', 'travel-journal-photo-book', 'Travel Journal Photo Book',
  'Landscape-friendly travel photo book with day-by-day entries.', 'travel_album', 'album', [
  cover_dark(1, '#0c4a6e', 'Travel journal', 'Seven Days in the Yasawas', 'Salt, sun and the slow pace of the outer islands.', 'stock_nat_01', GOLD),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 20, 'DAY ONE', 11, '#0284c7', 'bold', ls='4px'), text(40, 60, 515, 40, 'Arrival in paradise', 28, INK, 'bold'), image(40, 120, 515, 320, 'stock_nat_02', 10),
    el('article', 40, 460, 515, 260, content='The boat from Nadi took four hours, long enough to watch the mainland shrink and the water turn from green to impossible blue. A welcome song greeted us at the beach, and by sunset our bags were unpacked and our shoes forgotten.\n\nDinner was grilled fish, cassava and a cold coconut, eaten with our feet in the sand.', columns=2, columnGutter=22, style={'fontSize': 12, 'color': '#334155', 'lineHeight': 1.55}), folio('Seven Days in the Yasawas')]),
  page(3, 'inside', '#f0f9ff', [text(40, 36, 515, 20, 'DAY THREE', 11, '#0284c7', 'bold', ls='4px'), text(40, 60, 515, 40, 'Into the reef', 28, INK, 'bold'), image(40, 120, 250, 250, 'stock_nat_01', 10), image(305, 120, 250, 250, 'stock_nat_04', 10),
    text(40, 400, 515, 300, 'Turtles, parrotfish and a ray gliding beneath us. We spent the morning in the water and the afternoon asleep in the shade, which felt exactly right.', 15, '#334155', lh=1.7), folio('Seven Days in the Yasawas')])
  ], ['travel', 'journal', 'photo book', 'album'], 'album'))

# ---------------------------------------------------------------- 17 event programme
T.append(template('tpl_mkt_event_17', 'event-programme', 'Event Programme',
  'Conference or festival programme with schedule, speakers and venue info.', 'event', 'custom', [
  page(1, 'cover', ['#2e1065', '#6d28d9', '#c026d3'], [text(40, 60, 515, 20, 'SAVE THE DATE', 12, GOLD, 'bold', ls='5px'), text(40, 100, 515, 200, 'Pacific Innovation Summit 2026', 50, '#ffffff', 'bold', lh=1.08), image(40, 340, 515, 300, 'stock_abs_01', 18),
    text(40, 670, 515, 60, '18-19 March  -  Grand Pacific Hotel, Suva', 16, '#f5d0fe', 'bold'), button(40, 740, 200, 40, 'Register now', GOLD, 'https://wa.me/6799991234', '#2e1065')]),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 36, 'Day one schedule', 26, '#6d28d9', 'bold'),
    rect(40, 96, 515, 56, '#faf5ff', 8), text(56, 110, 90, 28, '9:00', 15, '#6d28d9', 'bold'), text(150, 110, 395, 28, 'Welcome and opening keynote', 14, INK),
    rect(40, 164, 515, 56, '#faf5ff', 8), text(56, 178, 90, 28, '10:30', 15, '#6d28d9', 'bold'), text(150, 178, 395, 28, 'Panel: building for the islands', 14, INK),
    rect(40, 232, 515, 56, '#faf5ff', 8), text(56, 246, 90, 28, '12:30', 15, '#6d28d9', 'bold'), text(150, 246, 395, 28, 'Lunch and networking', 14, INK),
    rect(40, 300, 515, 56, '#faf5ff', 8), text(56, 314, 90, 28, '2:00', 15, '#6d28d9', 'bold'), text(150, 314, 395, 28, 'Workshops: data, design and delivery', 14, INK),
    text(40, 400, 515, 30, 'Speakers', 22, '#6d28d9', 'bold'),
    student(40, 440, 165, 200, 'Dr. Ana Tui', 'stock_prt_01', 'Keynote', 'Technology for people.', ''), student(218, 440, 165, 200, 'Peni Bola', 'stock_prt_02', 'Panel chair', 'Build local.', ''), student(396, 440, 159, 200, 'Salote Ram', 'stock_prt_01', 'Workshop lead', 'Learn by doing.', ''), folio('Pacific Innovation Summit 2026')])
  ], ['event', 'programme', 'conference', 'festival'], 'custom'))

# ---------------------------------------------------------------- 18 lookbook
T.append(template('tpl_cat_lookbook_18', 'island-wear-lookbook', 'Island Wear Lookbook',
  'Fashion lookbook with featured pieces, prices and shop-the-look buttons.', 'retail_catalogue', 'catalogue', [
  cover_dark(1, '#164e63', 'Spring / Summer', 'Island Wear Lookbook', 'Linen, sulu prints and breezy cuts made for the tropics.', 'stock_nat_02', GOLD),
  page(2, 'inside', '#ffffff', [text(40, 36, 515, 36, 'Shop the look', 28, '#164e63', 'bold'),
    product(40, 100, 245, 300, 'Sulu Print Shirt', 'FJ$79', 'stock_prt_02', badge='NEW'), product(310, 100, 245, 300, 'Linen Wrap Dress', 'FJ$129', 'stock_prt_01', old='FJ$159', badge='SAVE $30'),
    product(40, 430, 245, 300, 'Woven Sun Hat', 'FJ$45', 'stock_ret_06'), product(310, 430, 245, 300, 'Pearl Shell Necklace', 'FJ$59', 'stock_bdg_01'), folio('Island Wear Lookbook')])
  ], ['fashion', 'lookbook', 'clothing', 'retail'], 'catalogue'))

# ---------------------------------------------------------------- write
manifest = {'schema': 'flipex.template.manifest', 'version': '2.0.0', 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'templatesCount': len(T), 'templates': []}
for t in T:
    m = t['meta']
    d = os.path.join(ROOT, m['file'].split('/')[0]); os.makedirs(d, exist_ok=True)
    with open(os.path.join(ROOT, m['file']), 'w', encoding='utf-8') as f: json.dump(t['doc'], f, indent=1, ensure_ascii=False)
    manifest['templates'].append(m)
with open(os.path.join(ROOT, 'manifest.json'), 'w', encoding='utf-8') as f: json.dump(manifest, f, indent=2, ensure_ascii=False)
print(len(T), 'templates written')
