# -*- coding: utf-8 -*-
"""外国語対応の再調査。取得できたかどうかも記録し、判定条件も広げる。"""
import json, re, urllib.request, os
from concurrent.futures import ThreadPoolExecutor

PETS = json.load(open('../data/pets.json', encoding='utf-8'))
VETS = [p for p in PETS if p['type'] == 'vet' and (p['web'] or p['insta'])]
OUT = 'vet_lang2.json'

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
KANA = re.compile(r'[぀-ゟ゠-ヿ]')
JA_ANY = re.compile(r'日本語|日本人|にほんご|일본어')
EN_NAV = re.compile(r'>\s*(?:ENGLISH|English)\s*<|href=["\'][^"\']*(?:/en/|/en\b|/english|lang=en|=eng\b)', re.I)
EN_CLAIM = re.compile(r'english\s*(?:speaking|available|consultation|service|ok|clinic)'
                      r'|we\s+speak\s+english|영어\s*(?:진료|상담|가능|응대|possible)'
                      r'|english\s*진료|foreigner|외국인\s*(?:진료|상담|환영)', re.I)
JA_CLAIM = re.compile(r'일본어\s*(?:진료|상담|가능|응대)|japanese\s*(?:speaking|available)', re.I)

def fetch(url):
    try:
        r = urllib.request.Request(url, headers={'User-Agent': UA,
                                                 'Accept-Language': 'ja,en;q=0.8,ko;q=0.6'})
        return urllib.request.urlopen(r, timeout=14).read()[:500000].decode('utf-8', 'ignore')
    except Exception:
        return ''

def strip(h):
    h = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', h)
    return re.sub(r'<[^>]+>', ' ', h)

def check(p):
    got = False
    ja = en = None
    for u in [x for x in (p['web'], p['insta']) if x]:
        html = fetch(u)
        if not html:
            continue
        got = True
        text = strip(html)
        if not ja:
            if JA_CLAIM.search(text) or JA_CLAIM.search(html): ja = 'claim'
            elif JA_ANY.search(text):                          ja = 'mention'
            elif len(KANA.findall(text)) >= 20:                ja = 'page'
        if not en:
            if EN_CLAIM.search(text) or EN_CLAIM.search(html): en = 'claim'
            elif EN_NAV.search(html):                          en = 'page'
    return {'fetched': got, 'ja': ja, 'en': en}

print('checking', len(VETS), flush=True)
res = {}
with ThreadPoolExecutor(max_workers=8) as ex:
    for i, (p, r) in enumerate(zip(VETS, ex.map(check, VETS))):
        res[p['id']] = r
        if i % 60 == 0:
            print(f"{i} fetched={sum(1 for v in res.values() if v['fetched'])} "
                  f"ja={sum(1 for v in res.values() if v['ja'])} "
                  f"en={sum(1 for v in res.values() if v['en'])}", flush=True)
json.dump(res, open(OUT, 'w'), ensure_ascii=False)
from collections import Counter
print('DONE', len(res))
print(' fetched  :', sum(1 for v in res.values() if v['fetched']), '/', len(res))
print(' japanese :', Counter(v['ja'] for v in res.values()))
print(' english  :', Counter(v['en'] for v in res.values()))
print(' ja or en :', sum(1 for v in res.values() if v['ja'] or v['en']))
