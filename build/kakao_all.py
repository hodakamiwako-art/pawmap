# -*- coding: utf-8 -*-
"""全国2,597軒の Instagram / 公式サイト / 電話番号をカカオマップから拾う"""
import urllib.request, urllib.parse, json, re, time, os, math

OFF = json.load(open('official_all.json', encoding='utf-8'))
DC  = json.load(open('enrich_all.json', encoding='utf-8')) if os.path.exists('enrich_all.json') else {}
OUT = 'kakao_all.json'
done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

# ソウル分は取得済みなので使い回す
if os.path.exists('kakao.json') and not done:
    prev = json.load(open('kakao.json', encoding='utf-8'))
    for k, v in prev.items():
        done[k] = v
    print('reused Seoul:', len(done), flush=True)

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'

def search(q):
    u = "https://search.map.kakao.com/mapsearch/map.daum?" + urllib.parse.urlencode(
        {'q': q, 'msFlag': 'A', 'sort': 0})
    r = urllib.request.Request(u, headers={'User-Agent': UA, 'Referer': 'https://map.kakao.com/'})
    return json.loads(urllib.request.urlopen(r, timeout=20).read().decode('utf-8', 'ignore')).get('place') or []

def roadkey(a):
    m = re.search(r'([가-힣A-Za-z0-9]+(?:로|길)\d*(?:번길|안길|가길|나길|다길|길)?)\s*(\d+(?:-\d+)?)', a or '')
    return (m.group(1), m.group(2)) if m else None

def metres(a, b, c, d):
    R = 6371000.0; k = math.pi / 180
    dla = (c - a) * k; dlo = (d - b) * k
    x = math.sin(dla/2)**2 + math.cos(a*k)*math.cos(c*k)*math.sin(dlo/2)**2
    return 2 * R * math.asin(math.sqrt(x))

def norm(s):
    return re.sub(r'[\s\.\,\'\-\&()]', '', (s or '')).lower()

todo = [r for r in OFF if str(r['rnum']) not in done]
print('todo', len(todo), flush=True)
for i, r in enumerate(todo):
    key = str(r['rnum'])
    dc = DC.get(key)
    ko = dc['nm'] if dc else re.sub(r'\([^)]*\)', '', r['bsshNm']).strip()
    parts = r['siteAddr'].split()
    region = parts[1] if len(parts) > 1 else ''
    rk = roadkey(r['siteAddr'])
    best = None
    for q in [f'{ko} {region}'.strip(), ko]:
        if not q or len(q) < 2: continue
        try:
            res = search(q)
        except Exception:
            time.sleep(1.5)
            try: res = search(q)
            except Exception: res = []
        for c in res:
            ck = roadkey(c.get('new_address') or c.get('address') or '')
            hit = rk and ck and ck[0] == rk[0] and ck[1] == rk[1]
            if not hit and dc:
                try:
                    hit = metres(dc['lat'], dc['lng'], float(c['lat']), float(c['lon'])) <= 120 and \
                          (norm(c.get('name')).startswith(norm(ko.split(' ')[0])) or
                           norm(ko).startswith(norm(c.get('name'))))
                except Exception:
                    hit = False
            if hit:
                best = c; break
        if best: break
        time.sleep(0.25)
    if best:
        hp = (best.get('homepage') or '').strip()
        done[key] = {'name': best.get('name'), 'tel': (best.get('tel') or '').strip(),
                     'homepage': hp, 'instagram': hp if 'instagram.com' in hp.lower() else '',
                     'cid': best.get('confirmid')}
    else:
        done[key] = None
    if i % 50 == 0:
        json.dump(done, open(OUT, 'w'), ensure_ascii=False)
        print(f"{i}/{len(todo)} matched={sum(1 for v in done.values() if v)} "
              f"ig={sum(1 for v in done.values() if v and v['instagram'])}", flush=True)
    time.sleep(0.3)

json.dump(done, open(OUT, 'w'), ensure_ascii=False)
print('DONE matched', sum(1 for v in done.values() if v),
      'instagram', sum(1 for v in done.values() if v and v['instagram']),
      'tel', sum(1 for v in done.values() if v and v['tel']))
