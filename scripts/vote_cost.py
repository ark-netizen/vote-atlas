"""Conservative extraction of 'per vote' currency cost on official vote pages.

We do not infer cost from other votes, paid bundles, or app-wide policies.
Multiple prices/icons in one official vote are recorded as alternatives
without guessing which currency type each icon represents.
"""
import re
from bs4 import BeautifulSoup

NUMBER = re.compile(r"^(?:\d{1,5}|\d{1,3}(?:,\d{3}){1,2})$")
PER_VOTE = re.compile(r"(?:표\s*당|1\s*표\s*(?:당|에)|per\s*vote)", re.I)
STOP = re.compile(r"^(?:상세\s*정보|후보|리워드|투표\s*결과|투표하기|투표|투표\s*기간|결과|VOTE|RESULT|CANDIDATES?)$", re.I)

def official_vote_cost(html, url, timestamp):
    """Only return an observed per-vote cost directly associated with this vote page."""
    if not isinstance(html, str) or not html.strip() or "/votes/" not in url:
        return None
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    if re.search(r"무료\s*투표|FREE\s*VOTE", soup.get_text(" ", strip=True), re.I):
        # Free label is explicit, but a mixed paid/free notice should not be reduced to zero.
        # Only treat as free if no paid per-vote badge exists in the visible page.
        if not any(PER_VOTE.search(x) for x in soup.stripped_strings):
            return {
                "currency": "무료", "units_per_vote": 0, "cost_options": [0],
                "status": "verified", "source_kind": "official_web",
                "source_url": url, "checked_at": timestamp,
                "evidence": "무료 투표",
            }
    badges = [x for x in soup.find_all(string=PER_VOTE) if x.parent is not None]
    for badge in badges:
        label = " ".join(str(badge).split())
        immediate = re.search(r"(?:표\s*당|1\s*표\s*(?:당|에)|per\s*vote)\s*(\d{1,5})", label, re.I)
        prices = [int(immediate.group(1))] if immediate else []
        # Walk forward in document order, stopping at adjacent vote action/tabs.
        strings = badge.parent.next_elements
        examined = 0
        for item in strings:
            if not isinstance(item, str):
                continue
            word = " ".join(item.split())
            if not word or word == label:
                continue
            if STOP.fullmatch(word):
                break
            examined += 1
            if examined > 12:
                break
            if NUMBER.fullmatch(word):
                value = int(word.replace(",", ""))
                if 0 <= value <= 1000:
                    prices.append(value)
        options = list(dict.fromkeys(prices))
        if not options:
            continue
        if len(options) > 3:
            continue
        return {
            "currency": "루미", "units_per_vote": options[0] if len(options) == 1 else None,
            "cost_options": options,
            "status": "verified" if len(options) == 1 else "multiple_options",
            "source_kind": "official_web",
            "source_url": url, "checked_at": timestamp,
            "evidence": ("표 당 " + " / ".join(str(x) for x in options))[:120],
            "note": "여러 재화 아이콘의 개별 종류는 미확인" if len(options) > 1 else None,
        }
    return None


def muniverse_listing_costs(html, events, stamp):
    """Match the exact public listing title before extracting that card's '표 당' badges.

    A card with multiple unlabelled currency icons keeps all quantities as
    unidentified alternatives. Missing active-vote badges remain unknown.
    """
    soup=BeautifulSoup(html or "", "html.parser")
    for node in soup(["script","style","noscript","svg"]):
        node.decompose()
    lines=[re.sub(r"\s+"," ",x).strip() for x in soup.get_text("\n",strip=True).splitlines()]
    lines=[x for x in lines if x]
    out={}
    for event in events:
        title=re.sub(r"\s+"," ",str(event.get("title") or "")).strip()
        if not title:continue
        choices=[]
        for i,line in enumerate(lines):
            if title not in line:continue
            # Distinct title followed by its period and '표 당' badges, stopping
            # at '투표 결과/투표' action before the next card begins.
            segment=lines[i+1:i+22]
            marker=None
            for j,item in enumerate(segment):
                if item in ("투표 결과","투표","투표하기","상세 정보"):
                    break
                if "표 당" in item or "표당" in item:
                    marker=j;break
                if j>=3 and any("기간" in nextline for nextline in segment[j:j+1]):
                    break
            if marker is None:continue
            values=[]
            badge=segment[marker].split("표 당",1)[-1].strip()
            if re.fullmatch(r"\d{1,3}",badge):
                values.append(int(badge))
            for item in segment[marker+1:marker+5]:
                if not re.fullmatch(r"\d{1,3}",item):break
                values.append(int(item))
            values=list(dict.fromkeys(values))
            if 1<=len(values)<=3 and all(1<=x<=1000 for x in values):
                choices.append(values)
        if not choices:continue
        # If different duplicates disagree, do not assert a single requirement.
        unique={tuple(c) for c in choices}
        if len(unique)!=1:continue
        numbers=list(next(iter(unique)))
        out[event["id"]]={
            "status":"verified_vote_page" if len(numbers)==1 else "multiple_options",
            "scope":"vote","currency":"루미",
            "options":[{"currency":"루미 (세부 종류 미확인)","units_per_vote":x} for x in numbers],
            "cost_options":numbers,
            "units_per_vote":numbers[0] if len(numbers)==1 else None,
            "source_kind":"official_web","source_url":"https://www.muniverse.io/votes",
            "checked_at":stamp,"evidence":"표 당 "+" / ".join(str(x) for x in numbers),
            "note":"표시된 재화 아이콘의 종류는 텍스트만으로 확인되지 않음" if len(numbers)>1 else "공식 투표 목록에서 1표당 수량 확인",
        }
    return out


def muniverse_api_cost(detail, stamp):
    """Exact per-vote source values from the official public vote-detail API.

    Muniverse documents Gold Lumy (purchase), Free Lumy (attendance/referral)
    and Ad Lumy (ad/missions) as distinct currencies. The official vote
    endpoint exposes costPaid, costFree and costAd plus enabled flags.
    Never replace one cost by a site-wide default.
    """
    if not isinstance(detail, dict) or not detail.get("voteCode"):
        return None
    currencies=(
        ("costPaidEnabled","costPaid","골드루미"),
        ("costFreeEnabled","costFree","프리루미"),
        ("costAdEnabled","costAd","애드루미"),
    )
    options=[]
    for enable_field,cost_field,label in currencies:
        cost=detail.get(cost_field)
        if detail.get(enable_field) is not True:
            continue
        if isinstance(cost,bool) or not isinstance(cost,int) or not (1<=cost<=1000000):
            continue
        options.append({
            "currency":label,
            "units_per_vote":cost,
            "source_field":cost_field,
        })
    if not options:
        return None
    url="https://api.muniverse.io/api/v2/votes/"+detail["voteCode"]
    return {
        "status":"verified_vote_api","verified":True,
        "scope":"vote","app":"muniverse",
        "currency":"루미",
        "options":options,
        "cost_options":[item["units_per_vote"] for item in options],
        "units_per_vote":options[0]["units_per_vote"] if len(options)==1 else None,
        "source_kind":"official_api","source_url":url,
        "currency_definition_url":"https://www.muniverse.io/notices/45",
        "checked_at":stamp,
        "evidence":" / ".join(
            item["source_field"]+"="+str(item["units_per_vote"]) for item in options
        ),
        "free_vote_available":detail.get("freeVoteFlag") is True,
        "note":"골드·프리·애드루미는 공식 API에서 사용 가능 여부와 투표당 수량이 각각 확인됨",
    }
