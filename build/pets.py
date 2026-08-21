# -*- coding: utf-8 -*-
"""カカオマップから、ソウルの動物病院とペットショップを区ごとに集める"""
import urllib.request, urllib.parse, json, time, os, re

GU = ['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구','강북구','도봉구',
      '노원구','은평구','서대문구','마포구','양천구','강서구','구로구','금천구','영등포구',
      '동작구','관악구','서초구','강남구','송파구','강동구']
VET_Q  = ['{g} 동물병원']
SHOP_Q = ['{g} 애견용품', '{g} 펫샵', '{g} 반려동물용품', '{g} 펫마트', '{g} 반려동물분양']
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
OUT = 'pets_raw.json'
found = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

def search(q, page=1):
    u = "https://search.map.kakao.com/mapsearch/map.daum?" + urllib.parse.urlencode(
        {'q': q, 'msFlag': 'A', 'sort': 0, 'page': page})
    r = urllib.request.Request(u, headers={'User-Agent': UA, 'Referer': 'https://map.kakao.com/'})
    return json.loads(urllib.request.urlopen(r, timeout=20).read().decode('utf-8', 'ignore')).get('place') or []

def collect(q, gu, maxpage=14):
    added = 0
    for pg in range(1, maxpage + 1):
        try:
            res = search(q, pg)
        except Exception:
            time.sleep(2)
            try: res = search(q, pg)
            except Exception: break
        if not res:
            break
        fresh = 0
        for p in res:
            cid = p.get('confirmid')
            addr = p.get('new_address') or p.get('address') or ''
            if not cid or cid in found:
                continue
            if p.get('cate_name_depth2') != '반려동물':
                continue
            if not addr.startswith('서울') or gu not in addr:
                continue
            found[cid] = {
                'cid': cid, 'name': p.get('name'), 'tel': (p.get('tel') or '').strip(),
                'addr': addr, 'lat': float(p['lat']), 'lng': float(p['lon']),
                'cate': p.get('last_cate_name'), 'gu': gu,
                'homepage': (p.get('homepage') or '').strip(),
                'rating': p.get('rating_average'), 'reviews': p.get('reviewCount'),
            }
            fresh += 1; added += 1
        if fresh == 0 and pg > 2:
            break
        time.sleep(0.28)
    return added

for i, g in enumerate(GU):
    n = 0
    for tpl in VET_Q + SHOP_Q:
        n += collect(tpl.format(g=g), g)
    json.dump(found, open(OUT, 'w'), ensure_ascii=False)
    print(f'{i+1:2}/25 {g:6} +{n:4}  total={len(found)}', flush=True)

json.dump(found, open(OUT, 'w'), ensure_ascii=False)
from collections import Counter
print('TOTAL', len(found))
print(Counter(v['cate'] for v in found.values()).most_common(12))
