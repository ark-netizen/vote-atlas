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
