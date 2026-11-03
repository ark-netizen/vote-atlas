"""Read provider-confirmed official X posts when public HTML allows it.

No unauthenticated X API bypass, proxy mirror, or speculative identity matching.
If X returns only a login shell, status is blocked, NOT 'collected'.
Image OCR is performed only on image-only reward/schedule notices from an
article containing a source-linked official status permalink.
"""
import hashlib
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

OFFICIAL = [
    {"app":"mubeat","handle":"MubeatOfficial","url":"https://x.com/MubeatOfficial",
     "evidence":"https://info.mubeat.tv/board/606/?language=en"},
    {"app":"coogoong","handle":"coogoong","url":"https://x.com/coogoong",
     "evidence":"https://apps.apple.com/kr/app/coogoong-%EC%BF%A0%EA%B6%81/id1641638840"},
]
CONTEXT = re.compile(r'투표|리워드|혜택|광고|송출|당첨|방청권|vote|reward|winner|billboard|ticket',re.I)
SOURCE_STATUS = re.compile(r'^/(?:[^/]+/)?status/(\d{6,25})$')

def ocr_official_image(url):
    """Optional OCR; no OCR claim when binary/tesseract is unavailable."""
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.netloc not in {'pbs.twimg.com','video.twimg.com'}:
        return '', 'untrusted_image_host'
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'VoteAtlas/1.0 official public post'})
        with urllib.request.urlopen(req,timeout=14) as response:
            if response.status!=200: return '', 'http_error'
            raw=response.read(3_000_001)
            if len(raw)>3_000_000:return '', 'image_too_large'
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'official_notice.png'
            path.write_bytes(raw)
            result=subprocess.run(['tesseract',str(path),'stdout','-l','kor+eng'],
                                  capture_output=True,text=True,timeout=25)
            if result.returncode!=0:return '', 'ocr_unavailable'
            text=re.sub(r'\s+',' ',result.stdout).strip()
            return text[:4500], 'ocr_complete' if text else 'ocr_no_text'
    except FileNotFoundError:
        return '', 'ocr_unavailable'
    except Exception as exc:
        return '', type(exc).__name__

def extract_official_posts(html, handle, checked_at):
    soup=BeautifulSoup(html,'html.parser')
    results=[]
    for article in soup.select('article'):
        link=None
        for a in article.select('a[href*="/status/"]'):
            url=urllib.parse.urljoin('https://x.com',a.get('href',''))
            parsed=urllib.parse.urlparse(url)
            seg=parsed.path.strip('/').split('/')
            if parsed.hostname in {'x.com','twitter.com'} and len(seg)>=3 and seg[0].casefold()==handle.casefold() and seg[1]=='status' and seg[2].isdigit():
                link='https://x.com/'+seg[0]+'/status/'+seg[2]
                break
        if not link:continue
        body=article.get_text(' ',strip=True)
        time_node=article.select_one('time[datetime]')
        when=time_node.get('datetime') if time_node else None
        images=[img.get('src') for img in article.select('img[src]') if 'pbs.twimg.com/media/' in img.get('src','')]
        ocr_parts=[];ocr_states=[]
        # OCR only when original post lacks explicit schedule/reward text and images exist.
        if images and not CONTEXT.search(body):
            for uri in images[:2]:
                text,state=ocr_official_image(uri)
                ocr_states.append(state)
                if text:ocr_parts.append(text)
        body=(' '.join([body]+ocr_parts)).strip()
        if not CONTEXT.search(body):continue
        results.append({
            'id':'official-social-'+hashlib.sha256(link.encode()).hexdigest()[:18],
            'source_url':link,'source_kind':'official_sns','body':body[:8000],
            'published_at':when,'checked_at':checked_at,
            'image_urls':images[:4],'ocr_status':ocr_states,
            'verified_account_handle':handle,
        })
    return results

def collect_official_sns(get, previous, stamp):
    retained={p['id']:dict(p) for p in previous if p.get('id')}
    states={}
    for account in OFFICIAL:
        try:
            html=get(account['url'])
            posts=extract_official_posts(html,account['handle'],stamp)
            if not posts:raise ValueError('No publicly accessible status permalink/article; login wall or empty feed')
            for post in posts:
                post['app']=account['app']
                post['account_evidence_url']=account['evidence']
                retained[post['id']]=post
            states[account['app']]={'state':'verified_posts','count':len(posts),
                                    'account':account['url'],'checked_at':stamp}
        except Exception as exc:
            states[account['app']]={'state':'blocked','count':0,'account':account['url'],
                                    'checked_at':stamp,'error':f'{type(exc).__name__}: {str(exc)[:160]}'}
    return sorted(retained.values(),key=lambda p:p.get('published_at') or '',reverse=True),states
