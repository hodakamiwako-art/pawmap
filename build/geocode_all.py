# -*- coding: utf-8 -*-
"""DiningCode で見つからなかった店を、住所から座標に変換する"""
import json, re, urllib.parse, urllib.request, time, os
OFF = json.load(open('official_all.json', encoding='utf-8'))
DC  = json.load(open('enrich_all.json', encoding='utf-8'))
OUT = 'geo_all.json'
done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
if os.path.exists('geo_fallback.json') and not done:
    done.update(json.load(open('geo_fallback.json', encoding='utf-8')))
    print('reused Seoul geocodes:', len(done), flush=True)

# 公式の広域名は実在の行政名と違うことがある（例：전남광주통합특별시）ので置き換える
FIX = {'전남광주통합특별시': '', '강원특별자치도': '강원도', '전북특별자치도': '전라북도',
       '제주특별자치도': '제주도'}

def clean(addr):
    a = re.sub(r'\(.*', '', addr).strip()
    for k, v in FIX.items():
        if a.startswith(k):
            a = (v + a[len(k):]).strip()
    return a

todo = [r for r in OFF if not DC.get(str(r['rnum'])) and str(r['rnum']) not in done]
print('to geocode', len(todo), flush=True)
for i, r in enumerate(todo):
    a = clean(r['siteAddr'])
    u = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {'q': a, 'format': 'json', 'limit': 1, 'countrycodes': 'kr'})
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(
            u, headers={'User-Agent': 'pawmap/1.0 (dog-friendly korea map)'}), timeout=25))
    except Exception as e:
        d = []
    done[str(r['rnum'])] = ({'lat': float(d[0]['lat']), 'lng': float(d[0]['lon']),
                             'precision': 'building' if d[0].get('addresstype') not in ('road', None) else 'street'}
                            if d else None)
    if i % 40 == 0:
        json.dump(done, open(OUT, 'w'), ensure_ascii=False)
        print(f'{i}/{len(todo)} ok={sum(1 for v in done.values() if v)}', flush=True)
    time.sleep(1.05)
json.dump(done, open(OUT, 'w'), ensure_ascii=False)
print('DONE geocoded', sum(1 for v in done.values() if v), '/', len(done))
