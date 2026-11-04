"""Collect publicly verified IdolChamp AAA 2026 votes from official organizer pages.
Only AAA finals (six boards), NOT all IdolChamp app votes. Read-only and no login.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import re
import urllib.request
from bs4 import BeautifulSoup

BOARDS = {
    "actor_male":"남자 배우", "actor_female":"여자 배우",
    "artist_group_male":"남자 그룹 가수", "artist_group_female":"여자 그룹 가수",
    "artist_solo_male":"남자 솔로 가수", "artist_solo_female":"여자 솔로 가수"
}
URL = "https://www.asiaartistawards.com/vote"
NOTICE = "https://www.asiaartistawards.com/notice?id=166"
KST = timezone(timedelta(hours=9))
VOTES = re.compile(r"(?<!\d)(\d{1,3}(?:,\d{3})*|\d+)\s*표")
ROW = re.compile(
    r"(?:^|\s)(?P<order>20|1\d|[1-9])\s+(?:(?:20|1\d|[1-9])\s+)?"
    r"(?P<name>[^\d]{1,65}?)\s+"
    r"(?P<votes>\d{1,3}(?:,\d{3})*|\d+)\s*표(?=\s|$)"
)

def image_rows(soup):
    rows=[]
    for img in soup.select("img"):
        src=str(img.get("src") or img.get("data-src") or "")
        if "image.idolchamp.com/" not in src: continue
        name=(img.get("alt") or "").strip()
        if not 1 <= len(name) <= 65: continue
        node=img
        for _ in range(7):
            node=node.parent
            if node is None or node.name in ("body","html"): break
            text=node.get_text(" ",strip=True)
            if len(text)>250: break
            if name in text:
                m=VOTES.search(text[text.find(name)+len(name):])
                if m:
                    if name not in [r[0] for r in rows]:
                        rows.append((name,int(m.group(1).replace(",","")),None))
                    break
    return rows

def text_rows(soup):
    plain=soup.get_text(" ",strip=True)
    marker="득표 수는 1분 마다 갱신됩니다."
    if marker not in plain: return []
    body=plain.split(marker,1)[1].split("Asia Artist Awards는",1)[0]
    tabs="남자 배우 여자 배우 남자 그룹 가수 여자 그룹 가수 남자 솔로 가수 여자 솔로 가수"
    if tabs in body: body=body.split(tabs,1)[-1]
    rows=[]
    for m in ROW.finditer(body):
        name=" ".join(m.group("name").split())
        if name and "투표" not in name and "Live" not in name:
            rows.append((name,int(m.group("votes").replace(",","")),int(m.group("order"))))
    return rows

def parse_aaa_board(html,board,observed_at=None):
    if board not in BOARDS: raise ValueError("UNKNOWN_BOARD")
    soup=BeautifulSoup(html,"html.parser")
    text=soup.get_text(" ",strip=True)
    if not all(k in text for k in ("AAA 2026 결선 투표","Live Standings","득표 수는")):
        raise ValueError("LIVE_STANDINGS_NOT_VISIBLE")
    pictures,labels=image_rows(soup),text_rows(soup)
    if pictures and labels and len(pictures)==len(labels):
        if [(n,v) for n,v,_ in pictures]!=[(n,v) for n,v,_ in labels]:
            raise ValueError("CANDIDATE_SOURCES_DISAGREE")
    rows=pictures if len(pictures)>=len(labels) else labels
    if not 3<=len(rows)<=100: raise ValueError("RANKINGS_MISSING")
    if len({name for name,_,_ in rows})!=len(rows): raise ValueError("DUPLICATE_CANDIDATES")
    if any(a[1]<b[1] for a,b in zip(rows,rows[1:])): raise ValueError("VOTES_NOT_SORTED")
    if any(displayed is not None and displayed!=position
           for position,(_,_,displayed) in enumerate(rows,1)):
        raise ValueError("VISIBLE_ORDER_MISMATCH")
    obs=observed_at or datetime.now(KST).isoformat(timespec="seconds")
    candidates=[{"rank":1+sum(other>votes for _,other,_ in rows),
                 "name":name,"votes":votes,"rank_observed_at":obs}
                for name,votes,_ in rows]
    top=rows[0][1]
    leader=", ".join(name for name,votes,_ in rows if votes==top) if top>0 else None
    return {
        "id":"idolchamp-aaa2026-final-"+board,"app":"idolchamp",
        "title":"AAA 2026 인기상 결선 · "+BOARDS[board],
        "start":"2026-10-08","end":"2026-11-04",
        "start_at":"2026-10-08T10:00:00+09:00",
        "end_at":"2026-11-04T23:59:00+09:00",
        "date_precision":"minute","year_inferred":False,
        "leader":leader,"winner":None,"result_status":"not_final",
        "candidates":candidates,"lineup_complete":False,
        "reward":"AAA 2026 인기상 트로피 (최종 1위)",
        "reward_lines":["각 부문 최종 1위에게 AAA 2026 인기상 트로피 수여"],
        "reward_entries":[],
        "source":"AAA 주최사 공식 공개 투표 현황 (아이돌챔프 투표)",
        "source_url":URL+"?board="+board,"collected_at":obs,
        "verification":"공식 순위·득표 확인 · 앱 전체 투표 목록 아님 · 최종 수상 미확정",
        "evidence":"AAA 공식 공개 현황\n"+"\n".join(
            f"{c['rank']}위 {c['name']}: {c['votes']:,}표" for c in candidates),
        "provider_status":"PUBLIC_ORGANIZER_LIVE",
        "reward_source_url":NOTICE
    }

def official_get(url):
    req=urllib.request.Request(url,headers={
        "User-Agent":"VoteAtlas/1.0 (public vote calendar; read-only)",
        "Accept-Language":"ko-KR,ko;q=0.9"})
    with urllib.request.urlopen(req,timeout=30) as response:
        if response.geturl().split("/")[2] not in ("www.asiaartistawards.com","asiaartistawards.com"):
            raise ValueError("UNEXPECTED_REDIRECT")
        return response.read(4_000_000).decode("utf-8")

def collect_idolchamp_aaa(previous,get=None):
    get=get or official_get
    successes,errors={},[]
    with ThreadPoolExecutor(max_workers=3) as executor:
        pending={executor.submit(get,URL+"?board="+board):board for board in BOARDS}
        for future in as_completed(pending):
            board=pending[future]
            try: successes[board]=parse_aaa_board(future.result(),board)
            except Exception as exc:
                errors.append(f"{board}: {type(exc).__name__}: {str(exc)[:160]}")
    events=[successes[b] for b in BOARDS if b in successes]
    if not events: raise ValueError("ALL_AAA_BOARDS_FAILED: "+"; ".join(errors))
    return events,errors,(f"AAA 2026 공식 결선 {len(events)}/6개 부문 · 후보/순위/득표 확인 · "
                          "아이돌챔프 전체 투표 목록 미수집")
