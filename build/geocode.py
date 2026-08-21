import json,re,urllib.parse,urllib.request,time,os
E=json.load(open('enriched.json',encoding='utf-8'))
R=json.load(open('retry.json',encoding='utf-8'))
for k,v in R.items():
    if v['dc']: E[k]['dc']=v['dc']
json.dump(E,open('enriched2.json','w'),ensure_ascii=False)
todo=[k for k,v in E.items() if not v['dc']]
print('need geocoding',len(todo),flush=True)
OUT='geo_fallback.json'
done=json.load(open(OUT,encoding='utf-8')) if os.path.exists(OUT) else {}
def clean(a): return re.sub(r'\(.*','',a).strip()
for i,k in enumerate(todo):
    if k in done: continue
    addr=clean(E[k]['off']['siteAddr'])
    u="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode({'q':addr,'format':'json','limit':1,'countrycodes':'kr'})
    try:
        d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'pawmap/1.0 (dog-friendly seoul map)'}),timeout=25))
    except Exception as e:
        d=[]; print('ERR',e,flush=True)
    done[k]={'lat':float(d[0]['lat']),'lng':float(d[0]['lon']),'precision':('building' if d[0].get('addresstype') not in ('road',None) else 'street')} if d else None
    if i%15==0:
        json.dump(done,open(OUT,'w'),ensure_ascii=False); print(i,addr[:40],done[k],flush=True)
    time.sleep(1.1)
json.dump(done,open(OUT,'w'),ensure_ascii=False)
ok=sum(1 for v in done.values() if v)
print('geocoded',ok,'/',len(done))
