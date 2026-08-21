# -*- coding: utf-8 -*-
"""Kakao Map の公開検索から Instagram / 公式サイト / 電話番号を拾う"""
import urllib.request, urllib.parse, json, re, time, os, math

PLACES = json.load(open('../data/places.json', encoding='utf-8'))
OUT = 'kakao.json'
done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'

def search(q):
    u = "https://search.map.kakao.com/mapsearch/map.daum?" + urllib.parse.urlencode(
        {'q': q, 'msFlag': 'A', 'sort': 0})
    r = urllib.request.Request(u, headers={'User-Agent': UA, 'Referer': 'https://map.kakao.com/'})
    return json.loads(urllib.request.urlopen(r, timeout=20).read().decode('utf-8', 'ignore')).get('place') or []

def metres(a, b, c, d):
    R = 6371000; k = math.pi / 180
    dla = (c - a) * k; dlo = (d - b) * k
    s = math.sin(dla/2)**2 + math.cos(a*k)*math.cos(c*k)*math.sin(dlo/2)**2
    return 2 * R * math.asin(math.sqrt(s))

def norm(s):
    return re.sub(r'[\s\.\,\'\-\&()]', '', (s or '')).lower()

todo = [p for p in PLACES if str(p['id']) not in done]
print('to query:', len(todo), flush=True)
for i, p in enumerate(todo):
    base = re.sub(r'\s+', ' ', p['ko']).strip()
    tries = [base, re.sub(r'\s+\S+$', '', base) + ' ' + p['area']['ko']]
    best = None
    for q in tries:
        if not q.strip():
            continue
        try:
            res = search(q)
        except Exception:
            time.sleep(2)
            try: res = search(q)
            except Exception: res = []
        for r in res:
            try:
                d = metres(p['lat'], p['lng'], float(r['lat']), float(r['lon']))
            except Exception:
                continue
            nm_ok = norm(r.get('name')).startswith(norm(base.split(' ')[0])) or \
                    norm(base).startswith(norm(r.get('name')))
            if d <= 120 and nm_ok:
                best = r; break
            if d <= 40:
                best = r; break
        if best: break
        time.sleep(0.25)
    if best:
        hp = (best.get('homepage') or '').strip()
        done[str(p['id'])] = {
            'name': best.get('name'), 'tel': (best.get('tel') or '').strip(),
            'homepage': hp,
            'instagram': hp if 'instagram.com' in hp.lower() else '',
            'cid': best.get('confirmid'),
            'pet': best.get('addinfo_pet'),
        }
    else:
        done[str(p['id'])] = None
    if i % 25 == 0:
        json.dump(done, open(OUT, 'w'), ensure_ascii=False)
        got = sum(1 for v in done.values() if v)
        ig = sum(1 for v in done.values() if v and v['instagram'])
        print(f'{i}/{len(todo)} matched={got} instagram={ig}', flush=True)
    time.sleep(0.3)

json.dump(done, open(OUT, 'w'), ensure_ascii=False)
got = sum(1 for v in done.values() if v)
print('DONE matched', got, '/', len(done),
      'instagram', sum(1 for v in done.values() if v and v['instagram']),
      'tel', sum(1 for v in done.values() if v and v['tel']))
