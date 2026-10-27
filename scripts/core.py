"""Conservative, evidence-based screen extraction. No AI or paid service."""
import re, hashlib, json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from xml.etree import ElementTree as ET
KST = ZoneInfo('Asia/Seoul')
DATE = r'(?:(20\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?'
PERIOD = re.compile(DATE+r'\s*(?:\d{1,2}:\d{2})?\s*(?:\(.*?\))?\s*[~～–—]\s*'+DATE)
DENY = re.compile(r'구매|결제|충전|동의|투표하기|투표권|응모하기|참여하기|광고보기|광고 보기|purchase|buy|submit|vote now',re.I)

def now(): return datetime.now(KST).isoformat(timespec='seconds')

def parse_period(text, reference=None):
    reference = reference or datetime.now(KST)
    m = PERIOD.search(text)
    if not m: return None
    y1, mo1, d1, y2, mo2, d2 = m.groups()
    # Never infer an arbitrary historical year; nearest year for an undated live screen.
    try:
        if y1: year = int(y1)
        elif y2: year = int(y2) - (int(mo1)>int(mo2))
        else:
            options = []
            for yr in (reference.year-1,reference.year,reference.year+1):
                try: options.append(datetime(yr,int(mo1),int(d1),tzinfo=KST))
                except ValueError: pass
            year = min(options,key=lambda x:abs((x-reference).days)).year
        start = datetime(year,int(mo1),int(d1),tzinfo=KST)
        end = datetime(int(y2) if y2 else year+(int(mo2)<int(mo1)),int(mo2),int(d2),tzinfo=KST)
        if end<start or (end-start).days>370: return None
        return start.date().isoformat(),end.date().isoformat(),not bool(y1 and y2)
    except (ValueError,TypeError): return None

def nodes(xml):
    root=ET.fromstring(xml)
    result=[]
    for el in root.iter('node'):
        text=(el.get('text') or el.get('content-desc') or '').strip()
        b=re.findall(r'\d+',el.get('bounds',''))
        if text and len(b)==4:
            result.append({'text':text,'bounds':list(map(int,b)), 'resource':el.get('resource-id',''), 'clickable':el.get('clickable')=='true'})
    return result

def text_of(xml): return '\n'.join(dict.fromkeys(n['text'] for n in nodes(xml)))

def cards(xml):
    """Find clickable containers with dates. Does not click vote/checkout controls."""
    root=ET.fromstring(xml); found=[]
    for el in root.iter('node'):
        if el.get('clickable')!='true': continue
        parts=[(n.get('text') or n.get('content-desc') or '').strip() for n in el.iter('node')]
        parts=list(dict.fromkeys(p for p in parts if p)); joined='\n'.join(parts)
        if not PERIOD.search(joined): continue
        if any(DENY.fullmatch(p) for p in parts): continue
        titles=[p for p in parts if len(p)>4 and not PERIOD.search(p) and not re.fullmatch(r'[\d,.%\s]+|D-\d+|진행\s*중|종료|투표',p)]
        b=re.findall(r'\d+',el.get('bounds',''))
        if titles and len(b)==4:
            title_node=next((n for n in el.iter('node') if (n.get('text') or n.get('content-desc') or '').strip()==titles[0]),None)
            tb=re.findall(r'\d+',title_node.get('bounds','')) if title_node is not None else []
            # Tap the title itself, never the center of a container with action buttons.
            if len(tb)==4: found.append({'title':titles[0], 'bounds':list(map(int,tb)), 'text':joined})
    # Prefer inner small containers over a giant parent list.
    found.sort(key=lambda c:(c['bounds'][2]-c['bounds'][0])*(c['bounds'][3]-c['bounds'][1]))
    out=[]
    for c in found:
        if c['title'] not in {v['title'] for v in out}: out.append(c)
    return out[:30]

def extract_candidates(text):
    # Only an explicit rank + name + votes block qualifies. No invented names from hashtags.
    p=re.compile(r'(?:^|\n)\s*(\d{1,3})\s*(?:위|등|[.)])?\s*\n([^\n]{1,90})\n(?:득표\s*)?([\d,]+)\s*(?:표|votes?)\b',re.I)
    out=[]
    for m in p.finditer(text):
        rank,name,votes=m.groups()
        if DENY.search(name): continue
        row={'rank':int(rank),'name':name.strip(),'votes':int(votes.replace(',',''))}
        if row not in out: out.append(row)
    return sorted(out,key=lambda x:x['rank'])

def event_from_screen(app,title,text,source='android',reference=None):
    dates=parse_period(text,reference)
    if not dates: return None
    title=title.strip()
    if not title or len(title)>200: return None
    start,end,inferred=dates
    candidates=extract_candidates(text)
    leader=next((c['name'] for c in candidates if c['rank']==1),'')
    # A closed screen is not itself proof of a final winner.
    final=bool(re.search(r'최종\s*(?:결과|순위)|최종\s*1위|final\s*results?',text,re.I))
    reward_lines=[l.strip() for l in text.splitlines() if re.search(r'리워드|혜택|특전|reward',l,re.I)]
    rid=hashlib.sha256((app['id']+'|'+title+'|'+start+'|'+end).encode()).hexdigest()[:20]
    return {'id':rid,'app':app['id'],'title':title,'start':start,'end':end,'date_precision':'date',
      'year_inferred':inferred,'leader':leader,'winner':leader if final else '',
      'candidates':candidates,'lineup_complete':False,'reward':' / '.join(reward_lines)[:600],
      'source':source,'source_url':app['url'],'collected_at':now(),'verification':'화면 추출 · 전체 후보 미검증',
      'evidence':'\n'.join([title, PERIOD.search(text).group(0), *[f"{c['rank']}위 {c['name']} {c['votes']}표" for c in candidates], *reward_lines])[:12000]}

def merge(previous,new):
    """Retain prior records, never erase known values on a failed/partial scrape."""
    byid={e['id']:e for e in previous}
    for item in new:
        old=byid.get(item['id'],{})
        combined={**old,**item}
        for key in ('winner','leader','reward','candidates'):
            if not item.get(key) and old.get(key):
                combined[key]=old[key]
                combined['verification']='일부 항목은 이전 수집값 · 원문 확인'
        byid[item['id']]=combined
    return sorted(byid.values(),key=lambda e:(e['start'],e['app'],e['title']))
