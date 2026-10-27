"""Read installed Android apps through ADB UIAutomator + local Tesseract OCR.
Requires initial APK installation. Unrecognized UI is reported, never fabricated.
"""
import argparse, csv, hashlib, io, json, os, re, subprocess, tempfile, time
from pathlib import Path
from core import nodes,text_of,cards,event_from_screen,merge,now,DENY
ROOT=Path(__file__).resolve().parents[1]

def adb(*args,binary=False,timeout=40):
    proc=subprocess.run(['adb',*args],capture_output=True,timeout=timeout)
    if proc.returncode: raise RuntimeError('ADB operation failed: '+str(args[:2]))
    return proc.stdout if binary else proc.stdout.decode('utf-8','replace')

def capture():
    adb('shell','uiautomator','dump','/sdcard/voteatlas-window.xml')
    xml=adb('shell','cat','/sdcard/voteatlas-window.xml')
    if '<hierarchy' not in xml: raise RuntimeError('UI hierarchy unavailable')
    xml=xml[xml.index('<?xml'):] if '<?xml' in xml else xml[xml.index('<hierarchy'):]
    return xml

def ocr_nodes():
    # Screenshots are temporary only; never committed or published.
    with tempfile.TemporaryDirectory() as td:
        png=Path(td)/'screen.png';png.write_bytes(adb('exec-out','screencap','-p',binary=True))
        proc=subprocess.run(['tesseract',str(png),'stdout','-l','kor+eng','--psm','11','tsv'],capture_output=True,text=True,timeout=45)
        if proc.returncode: return []
        groups={}
        for row in csv.DictReader(io.StringIO(proc.stdout),delimiter='\t'):
            if not row.get('text','').strip() or float(row['conf'])<45: continue
            key=tuple(row[k] for k in ('page_num','block_num','par_num','line_num'))
            groups.setdefault(key,[]).append(row)
        out=[]
        for rows in groups.values():
            x=min(int(r['left']) for r in rows);y=min(int(r['top']) for r in rows)
            right=max(int(r['left'])+int(r['width']) for r in rows);bottom=max(int(r['top'])+int(r['height']) for r in rows)
            out.append({'text':' '.join(r['text'] for r in rows),'bounds':[x,y,right,bottom]})
        return out

def tap(bounds):
    x1,y1,x2,y2=bounds;adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(1.6)

def screen_nodes(xml):
    result=nodes(xml)
    if sum(len(n['text']) for n in result)<40:
        result+=ocr_nodes()
    return result

def swipe():
    size=re.search(r'(\d+)x(\d+)',adb('shell','wm','size'))
    w,h=map(int,size.groups())
    adb('shell','input','swipe',str(w//2),str(int(h*.77)),str(w//2),str(int(h*.30)),'450');time.sleep(1.4)

def launch(app):
    adb('shell','am','force-stop',app['package'])
    adb('shell','monkey','-p',app['package'],'-c','android.intent.category.LAUNCHER','1')
    time.sleep(5)

def enter_votes(app):
    launch(app)
    for _ in range(4):
        xml=capture();ns=screen_nodes(xml)
        # Only dismiss optional screens. Never accept consent or submit a vote.
        close=next((n for n in ns if n['text'] in ['나중에','닫기','건너뛰기','나중에 하기','Skip','Not now']),None)
        if close: tap(close['bounds']);continue
        choices=[n for n in ns if n['text'].strip() in app['nav']]
        if choices:
            tap(max(choices,key=lambda n:n['bounds'][1])['bounds']);return capture()
        if cards(xml): return xml
        if any(re.search(r'로그인|sign in|log in',n['text'],re.I) for n in ns):
            raise RuntimeError('LOGIN_REQUIRED: 로그인한 실제 기기에서 실행 필요')
        break
    raise RuntimeError('NAV_UNVERIFIED: 현재 앱 화면에서 투표 탭을 식별하지 못함')

def ocr_cards(ns):
    """For image-only lists, associate a date line with the immediately preceding title."""
    from core import PERIOD
    out=[]
    for i,n in enumerate(ns):
        if not PERIOD.search(n['text']) or i==0: continue
        previous=ns[i-1]
        if len(previous['text'])<5 or DENY.search(previous['text']): continue
        out.append({'title':previous['text'],'bounds':previous['bounds'],'text':previous['text']+'\n'+n['text']})
    return out

def collect(app,max_pages=6,max_details=20):
    enter_votes(app);events=[];visited=set();detail_count=0
    # Tabs are read only when visibly present. No blind coordinates.
    sections=[None]+app.get('tabs',[])
    for section in sections:
        if detail_count>=max_details: break
        if section:
            enter_votes(app);xml=capture()
            tab=next((n for n in screen_nodes(xml) if n['text']==section),None)
            if not tab: continue
            tap(tab['bounds'])
        seen_pages=set()
        for page in range(max_pages):
            xml=capture();ns=screen_nodes(xml)
            signature=hashlib.sha256('\n'.join(n['text'] for n in ns).encode()).hexdigest()
            if signature in seen_pages: break
            seen_pages.add(signature)
            listings=cards(xml) or ocr_cards(ns)
            for card in listings:
                key=card['title']+'|'+card['text']
                if key in visited or detail_count>=max_details: continue
                visited.add(key)
                # Refresh the screen to avoid clicking stale coordinates.
                current=capture();available=cards(current) or ocr_cards(screen_nodes(current))
                target=next((c for c in available if c['title']==card['title']),None)
                if not target: continue
                tap(target['bounds']);detail_count+=1
                chunks=[];detail_seen=set()
                for _ in range(max_pages):
                    dx=capture();dns=screen_nodes(dx)
                    if any(re.search(r'로그인.*필요|로그인.*해주세요',n['text']) for n in dns): break
                    text='\n'.join(dict.fromkeys(n['text'] for n in dns))
                    if text in detail_seen: break
                    detail_seen.add(text);chunks.append(text);swipe()
                event=event_from_screen(app,card['title'],card['text']+'\n'+'\n'.join(chunks))
                if event: events.append(event)
                adb('shell','input','keyevent','4');time.sleep(1.5)
            if detail_count>=max_details: break
            swipe()
    if not events: raise RuntimeError('LAYOUT_UNVERIFIED: 날짜가 확인되는 투표 상세를 찾지 못함')
    return events

def run(args):
    apps=json.loads((ROOT/'config/apps.json').read_text())
    output=ROOT/'dist/data/events.json'
    data=json.loads(output.read_text()) if output.exists() else {'events':[],'sources':[]}
    statuses={s['id']:s for s in data.get('sources',[])};fresh=[]
    try:
        installed=adb('shell','pm','list','packages')
    except Exception:
        installed='';device=False
    else: device=True
    for app in apps:
        if args.app and app['id']!=args.app: continue
        status={**app,'attempted_at':now(),'method':'Android UI + OCR','verified':False}
        try:
            if not device: raise RuntimeError('DEVICE_MISSING: 연결된 Android 기기 없음')
            if 'package:'+app['package']+'\n' not in installed: raise RuntimeError('APK_MISSING: 앱 설치 파일 연결 필요')
            result=collect(app,args.max_pages,args.max_details);fresh+=result
            status.update(state='partial',message=f'{len(result)}개 화면 추출 · 전체 후보 및 탐색 범위 검증 필요',count=len(result),last_success=now())
        except Exception as ex:
            status.update(state='blocked',message=str(ex)[:220],count=0)
            if statuses.get(app['id'],{}).get('last_success'):status['last_success']=statuses[app['id']]['last_success']
        statuses[app['id']]=status
        print(app['name']+': '+status['message'],flush=True)
    data.update(updated_at=now(),events=merge(data.get('events',[]),fresh),sources=list(statuses.values()))
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(data,ensure_ascii=False,indent=2))
    if not fresh: print('No newly verified screen records. Prior records preserved.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--app');p.add_argument('--max-pages',type=int,default=6);p.add_argument('--max-details',type=int,default=20)
    run(p.parse_args())
