"""Discover award announcements from free public news RSS, without guessing official voting partners."""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
DB = Path(__file__).resolve().parents[1] / "dist" / "data" / "awards.json"
SEARCHES = [
    '"어워즈" "투표" "플랫폼" when:3d',
    '"시상식" "인기상" "팬" when:3d',
    '"뮤직 어워즈" "투표" when:3d',
    '"드라마" "시상식" "투표" when:3d',
    '"영화상" "온라인 투표" when:3d',
    '"브랜드 대상" "소비자 투표" when:3d',
    '"월드 웹툰 어워즈" 독자투표 when:7d',
    '"웹툰 어워즈" "투표" when:7d',
    '"웹소설" "어워즈" when:7d',
    '"만화대상" "독자인기상" when:7d',
    '"애니메이션" "관객상" "투표" when:7d',
    '"게임대상" "인기게임상" when:7d',
    '"캐릭터" "시상식" "투표" when:7d',
    '"코스프레" "챔피언십" "투표" when:7d',
    '"애니메이션 어워즈" 팬 투표 when:7d',
    '"리디 어워즈" 투표 when:7d',
]
AWARD = re.compile(r"어워즈|시상식|음악상|영화상|연기대상|연예대상|가요대상|브랜드 대상|만화대상|웹툰대상|게임대상|콘텐츠대상|애니메이션상|관객상|국제애니메이션|코스프레(?:대회|챔피언십|페스티벌)|\bawards?\b", re.I)
RELEVANT = re.compile(r"투표|선정|인기상|독자인기상|관객상|팬덤|후보|개최|신설|진행|론칭|공식|시상|국민심사", re.I)
ENTERTAINMENT = re.compile(r"가수|배우|연예|드라마|음악|음원|영화|방송|아이돌|K.?POP|팬덤|뮤직|콘텐츠|모델|브랜드|어워즈|시상식|웹툰|웹소설|만화|애니메이션|게임|캐릭터|코스프레|성우|awards?", re.I)
PLATFORMS = {
    "아이돌챔프": ["아이돌챔프", "IDOLCHAMP"],
    "셀럽챔프": ["셀럽챔프", "CELEBCHAMP"],
    "마이원픽": ["마이원픽", "my1pick"],
    "유픽": ["유픽", "UPICK"],
    "쿠궁": ["쿠궁", "coogoong"],
    "베리즈": ["베리즈", "Berriz"],
    "팬앤스타": ["팬앤스타", "FANNSTAR"],
    "스타폴": ["스타폴", "starpoll"],
    "프리즘": ["프리즘", "PRIZM"],
    "뮤빗": ["뮤빗", "Mubeat"],
    "후즈팬": ["후즈팬", "Whosfan"],
    "팬캐스트": ["팬캐스트", "Fancast"],
    "팬더원": ["팬더원"],
    "엠넷플러스": ["엠넷플러스", "Mnet Plus"],
    "멜론": ["멜론", "Melon"],
    "네이버": ["네이버", "Naver"],
}
QUOTE = re.compile(r"[‘'“\"]([^’'”\"]{3,45})[’'”\"]")
TITLE_NAME = re.compile(r"((?:20\d{2}\s*)?(?:[가-힣A-Za-z0-9\-·& ]{2,32})(?:어워즈|뮤직어워드|영화상|연기대상|연예대상|가요대상|게임대상|만화대상|콘텐츠대상|시상식|브랜드 대상|애니메이션영화제|애니페스트))", re.I)

def compact(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9가-힣]", "", value).casefold()

def strip_markup(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()

def recognize_award(title: str, awards: list[dict]) -> dict | None:
    normalized = compact(title)
    matches = []
    for award in awards:
        names = [award.get("name", ""), *(award.get("aliases") or [])]
        for name in names:
            alias = compact(name)
            # Very short abbreviations (e.g. 'KMA') can occur inside unrelated words.
            if len(alias) >= 4 and alias in normalized:
                matches.append((len(alias), award))
    return max(matches, key=lambda t: t[0])[1] if matches else None

def candidate_name(title: str) -> str:
    for value in QUOTE.findall(title):
        if AWARD.search(value):
            return value.strip()
    m = TITLE_NAME.search(title)
    if m:
        return m.group(1).strip()
    return title[:90]

def platform_mentions(text: str) -> list[str]:
    return [name for name,aliases in PLATFORMS.items() if any(re.search(
        r"(?<![A-Za-z])" + re.escape(alias) + r"(?![A-Za-z])" if re.fullmatch(r"[A-Za-z ]+", alias) else re.escape(alias),
        text, re.I) for alias in aliases)]

def parse_feed(xml: bytes, now: datetime) -> list[dict]:
    root = ET.fromstring(xml)
    out = []
    for item in root.findall(".//item")[:40]:
        title = strip_markup(item.findtext("title") or "")
        # Google News appends source after the last dash.
        headline = title.rsplit(" - ", 1)[0].strip()
        link = (item.findtext("link") or "").strip()
        description = strip_markup(item.findtext("description") or "")
        date_text = item.findtext("pubDate") or ""
        try:
            published_dt = parsedate_to_datetime(date_text).astimezone(KST)
        except (ValueError, TypeError, OverflowError):
            continue
        if published_dt < now - timedelta(days=4) or published_dt > now + timedelta(hours=6):
            continue
        if not link.startswith("https://"):
            continue
        if not (AWARD.search(headline) and RELEVANT.search(headline+" "+description) and ENTERTAINMENT.search(headline+" "+description)):
            continue
        key = hashlib.sha256((compact(headline)+published_dt.date().isoformat()).encode()).hexdigest()[:18]
        out.append({"id":key,"title":headline,"url":link,"published":published_dt.isoformat(timespec="seconds"),
                    "platform_mentions":platform_mentions(headline+" "+description)})
    return out

def feed_url(query: str) -> str:
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q":query,"hl":"ko","gl":"KR","ceid":"KR:ko"
    })

def fetch_rss(query: str) -> bytes:
    request=urllib.request.Request(feed_url(query),headers={
        "User-Agent":"Mozilla/5.0 (compatible; VoteAtlasPublicAwardMonitor/1.0)",
        "Accept":"application/rss+xml, application/xml;q=0.9"
    })
    with urllib.request.urlopen(request,timeout=15) as response:
        data=response.read(2_000_000)
    return data

def merge_results(data: dict, articles: list[dict], now: datetime, success: int, errors: list[str]) -> dict:
    known = {x["id"]: x for x in data.get("discovered", []) if x.get("id")}
    news = {x["id"]: x for x in data.get("latest_news", []) if x.get("id")}
    fresh = 0
    for article in articles:
        matched = recognize_award(article["title"],data.get("awards",[]))
        if matched:
            # Retain only articles about voting / platform announcements; not generic awards coverage.
            if not (re.search(r"투표|인기상|플랫폼|팬덤", article["title"], re.I) or article["platform_mentions"]):
                continue
            article["award_id"] = matched["id"]
            article["award_name"] = matched["name"]
            news.setdefault(article["id"],article)
        else:
            article["award_name"] = candidate_name(article["title"])
            if article["id"] not in known:
                known[article["id"]] = article
                fresh += 1
    data["discovered"] = sorted(known.values(),key=lambda x:x.get("published",""),reverse=True)[:250]
    data["latest_news"] = sorted(news.values(),key=lambda x:x.get("published",""),reverse=True)[:250]
    data["updated_at"]=now.isoformat(timespec="seconds")
    state = "정상" if success == len(SEARCHES) else ("부분 성공" if success else "검색 실패")
    if errors: state += " · 오류 "+str(len(errors))+"개"
    data["discovery_status"] = {
        "last_checked_at":now.isoformat(timespec="seconds"),
        "feed_status":state,
        "feeds_checked":success,
        "items_scanned":len(articles),
        "new_candidates":fresh,
        "errors":errors[:8],
    }
    return data

def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--dry-run",action="store_true")
    args=parser.parse_args()
    with DB.open(encoding="utf-8") as fp:
        data=json.load(fp)
    now=datetime.now(KST)
    articles=[]; errors=[]; successes=0
    for query in SEARCHES:
        try:
            articles.extend(parse_feed(fetch_rss(query),now))
            successes+=1
        except (OSError,ET.ParseError,ValueError) as exc:
            errors.append(query+": "+str(exc)[:150])
    unique={article["id"]:article for article in articles}
    # Don't overwrite a healthy previous scan when all feeds are inaccessible.
    if not successes:
        print("All RSS feeds unavailable. Previous awards data kept intact.",file=sys.stderr)
        for error in errors: print(error,file=sys.stderr)
        return 1
    updated=merge_results(data,list(unique.values()),now,successes,errors)
    if not args.dry_run:
        DB.write_text(json.dumps(updated,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Feeds {successes}/{len(SEARCHES)}, articles {len(unique)}, new candidates {updated['discovery_status']['new_candidates']}, tracking {len(updated['awards'])} awards.")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
