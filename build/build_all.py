# -*- coding: utf-8 -*-
import json, re, urllib.parse
import translit as T
import lexicon as L
from ja import JA          # 手書きした100軒の日本語名・ジャンル・エリア

E   = json.load(open('enriched2.json',   encoding='utf-8'))
GEO = json.load(open('geo_fallback.json',encoding='utf-8'))

LATIN = re.compile(r'^[A-Za-z0-9 .,&\'\-!?/()]+$')
HANGUL = re.compile(r'[가-힣]')

def strip_corp(s):
    return re.sub(r'\(\s*(주|유|재|사)\s*\)|주식회사|㈜', '', s).strip()

def latin_in(s):
    """公式名に括弧書きされているラテン文字表記を拾う"""
    for m in re.findall(r'\(([^)]*)\)', s):
        m = m.strip()
        if m and LATIN.match(m) and re.search(r'[A-Za-z]', m):
            return m
    body = re.sub(r'\([^)]*\)', '', s).strip()
    if body and LATIN.match(body) and re.search(r'[A-Za-z]', body):
        return body
    return None

LOAN_KEYS = sorted(L.LOAN, key=len, reverse=True)


def usable_at(name, i):
    """位置 i から始まる借用語を返す。1音節語は語境界のときだけ採る
    （북한산 の 북 を Book と読むような誤爆を防ぐ）"""
    for k in LOAN_KEYS:
        if not name.startswith(k, i):
            continue
        if len(k) >= 2:
            return k
        before_ok = i == 0 or not HANGUL.match(name[i - 1])
        after_ok = i + 1 >= len(name) or not HANGUL.match(name[i + 1])
        if before_ok and after_ok:
            return k
    return None

def segment(name):
    """ハングル名を借用語辞書で切りながら (カタカナ, English) にする"""
    ja, en, i = [], [], 0
    while i < len(name):
        ch = name[i]
        if not HANGUL.match(ch):
            ja.append(ch); en.append(ch); i += 1; continue
        hit = usable_at(name, i)
        if hit:
            ja.append(L.LOAN[hit][0]); en.append(' ' + L.LOAN[hit][1] + ' '); i += len(hit)
        else:
            j = i + 1          # 必ず1文字は進める（無限ループ防止）
            while j < len(name) and HANGUL.match(name[j]) and not usable_at(name, j):
                j += 1
            chunk = name[i:j]
            ja.append(T.katakana(chunk))
            en.append(' ' + T.title_en(T.romanize(chunk)) + ' ')
            i = j
    return ''.join(ja), re.sub(r'\s+', ' ', ''.join(en)).strip()

def area_romaji(ko):
    """논현동 → Nonhyeon-dong のように、行政区画の接尾辞をハイフンで切る"""
    if not ko or not HANGUL.search(ko):
        return ko
    m = re.match(r'^(.*?)(동|가|로|길|읍|면|리)(\d*가?)$', ko)
    if m:
        head = T.title_en(T.romanize(m.group(1)))
        tail = T.romanize(m.group(2))
        num = m.group(3)
        return f'{head}-{tail}{(" " + num) if num else ""}'.strip()
    return T.title_en(T.romanize(ko))


def dong_of(addr):
    m = re.findall(r'([가-힣]+동\d?가?)', addr or '')
    return m[-1] if m else ''

def gu_of(addr):
    m = re.search(r'서울특별시\s+(\S+구)', addr or '')
    return m.group(1) if m else ''

def genre_of(cat, name, induty):
    hay = (cat or '') + ' ' + (name or '')
    for rx, gj, ge in L.GENRE_RULES:
        if re.search(rx, hay):
            return gj, ge
    return L.FALLBACK.get(induty, ('レストラン', 'Restaurant'))

def detail_of(cat):
    toks = [t.strip() for t in re.split(r'\s*,\s*', cat or '') if t.strip()]
    ja, en = [], []
    for t in toks:
        if t in L.FOOD:
            ja.append(L.FOOD[t][0]); en.append(L.FOOD[t][1])
        else:
            j, e = segment(t)
            ja.append(j); en.append(e)
    return '・'.join(dict.fromkeys(ja)), ', '.join(dict.fromkeys(en))

rows, skipped = [], []
for key, v in E.items():
    off, dc = v['off'], v['dc']
    rn = off['rnum']
    addr_off = off['siteAddr']
    gu_ko = gu_of(addr_off)
    if not gu_ko:
        skipped.append(off['bsshNm']); continue

    # --- 位置 ---
    if dc:
        lat, lng, prec = dc['lat'], dc['lng'], 'shop'
    else:
        g = GEO.get(key)
        if not g:
            skipped.append(off['bsshNm']); continue
        lat, lng, prec = g['lat'], g['lng'], g['precision']

    # --- 名前 ---
    if dc:
        base = dc['nm']
        branch = (dc.get('branch') or '').strip()
        ko = (base + ' ' + branch).strip() if branch and branch not in base else base
    else:
        ko = re.sub(r'\([^)]*\)', '', strip_corp(off['bsshNm'])).strip() or strip_corp(off['bsshNm'])

    seg_ja, seg_en = segment(ko)
    en_paren = latin_in(off['bsshNm'])
    name_en = en_paren or (ko if LATIN.match(ko) else seg_en)
    name_ja = ko if LATIN.match(ko) else seg_ja

    cat = re.sub(r'<[^>]+>', '', (dc or {}).get('category') or '')
    gj, ge = genre_of(cat, ko, off['indutyNm'])
    dj, de = detail_of(cat)

    hand = JA.get(rn)
    if hand:                                    # 手書きの100軒は上書き
        name_ja = hand[0]
        gj = hand[1]
        if gj in L.NORMALISE:
            gj, ge = L.NORMALISE[gj]
        else:
            ge = next((r[2] for r in L.GENRE_RULES if r[1] == gj), ge)
        dj = hand[2] or dj
        # 手書きの漢字表記は活かしつつ、読みはハングルから作り直して揃える
        area_ko = hand[4]
        kanji = re.sub(r'（.*', '', hand[3]).strip()
        reading = T.katakana(area_ko) if HANGUL.search(area_ko) else ''
        area_ja = f'{kanji}（{reading}）' if (kanji and reading and kanji != reading) else (reading or kanji)
        area_en = area_romaji(area_ko)
    else:
        d = dong_of(dc['addr'] if dc else addr_off) or dong_of(addr_off)
        area_ko = d
        area_ja = T.katakana(d)
        area_en = area_romaji(d)

    kw = [x['term'] for x in ((dc or {}).get('keyword') or [])]
    terrace = any(t in ' '.join(kw) for t in ['테라스', '야외', '정원', '루프탑', '야장'])
    road = re.sub(r'\(.*', '', (dc or {}).get('road_addr') or addr_off).strip()
    q = urllib.parse.quote(f"{ko} {road}")

    rows.append({
        'id': rn,
        'kind': 'meal' if gj in L.MEAL_GENRES else 'cafe',
        'ko': ko,
        'ja': name_ja,
        'en': name_en,
        'genre': {'ja': gj, 'en': ge},
        'detail': {'ja': dj, 'en': de},
        'cat_ko': cat,
        'area': {'ja': area_ja, 'en': area_en, 'ko': area_ko},
        'gu': {'ja': L.GU[gu_ko][0], 'en': L.GU[gu_ko][1], 'ko': gu_ko},
        'addr': road,
        'lat': lat, 'lng': lng, 'prec': prec,
        'terrace': terrace,
        'induty': {'ja': L.INDUTY[off['indutyNm']][0], 'en': L.INDUTY[off['indutyNm']][1]},
        'rating': (dc or {}).get('user_score') or None,
        'reviews': (dc or {}).get('review_cnt') or 0,
        'gmap': f"https://www.google.com/maps/search/?api=1&query={lat}%2C{lng}",
        'naver': f"https://map.naver.com/p/search/{q}",
        'dc': f"https://www.diningcode.com/profile.php?rid={dc['v_rid']}" if dc else None,
    })

rows.sort(key=lambda r: (r['gu']['ko'], r['area']['ko'], r['ko']))
json.dump(rows, open('../data/places.json', 'w'), ensure_ascii=False, separators=(',', ':'))

from collections import Counter
print('places:', len(rows), ' skipped:', len(skipped), skipped[:5])
print('kind:', Counter(r['kind'] for r in rows))
print('terrace:', sum(1 for r in rows if r['terrace']))
print('genres:', len(set(r['genre']['ja'] for r in rows)))
print(Counter(r['genre']['ja'] for r in rows).most_common())
print('precision:', Counter(r['prec'] for r in rows))
