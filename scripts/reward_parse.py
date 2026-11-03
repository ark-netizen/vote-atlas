"""Separate each vote's explicit reward benefits and keep period semantics distinct."""
import hashlib
import re

REWARD_PHRASE = re.compile(
    r"광고\s*(?:송출|게재|노출|제공)|전광판|영상\s*송출|트로피\s*수여|상패\s*수여|실물\s*트로피|"
    r"방청권|초대권|폴라로이드|포토카드|사인\s*앨범|싸인\s*앨범|"
    r"행사\s*초대|기념품|리워드\s*제공", re.I)
DISCLAMER = re.compile(r"변경될\s*수|예시|유의\s*사항|추첨\s*방법|수상자\s*발표|다음\s*내용|참고해", re.I)
DATE_RANGE = re.compile(
    r"(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})\s*(?:~|부터|–|-)\s*"
    r"(?:(20\d{2})[./-]\s*)?(\d{1,2})[./-]\s*(\d{1,2})")
DURATION = re.compile(r"(\d{1,3})\s*(?:일간|일\s*동안|days?\b)", re.I)
ORDINAL = re.compile(r"(?:최종\s*)?([1-9])\s*(?:위|등)|([1-9])\ufe0f?\u20e3", re.I)
PENDING = re.compile(r"추후\s*(?:공지|안내)|월\s*중\s*(?:예정|안내)|예정|별도\s*(?:공지|안내)", re.I)

def normalized(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()

def parse_period(text):
    """Only parse *fully specified* dates explicitly in a reward line."""
    item = normalized(text)
    exact = DATE_RANGE.search(item)
    start = end = None
    if exact:
        try:
            import datetime as dt
            year, sm, sd, ey, em, ed = exact.groups()
            first = dt.date(int(year), int(sm), int(sd))
            last = dt.date(int(ey or year), int(em), int(ed))
            if first <= last:
                start, end = first.isoformat(), last.isoformat()
        except ValueError:
            pass
    duration = DURATION.search(item)
    if duration:
        rule = f"{int(duration.group(1))}일간"
    elif "촬영일" in item:
        rule = "방송 촬영일 (실제 집행일 별도 확인)"
    elif PENDING.search(item):
        rule = PENDING.search(item).group(0)
    else:
        rule = None
    return rule, start, end

def classify(text):
    if re.search(r"실내\s*전광판", text): return "advertising", "MBC 본사 초대형 실내 전광판"
    if re.search(r"옥외\s*전광판", text): return "advertising", "MBC 본사 옥외 전광판"
    if re.search(r"전광판|광고\s*(?:송출|노출|게재|제공)|영상\s*송출", text): return "advertising", None
    if re.search(r"트로피|상패", text): return "trophy", None
    if re.search(r"포토카드|폴라로이드|앨범|기념품", text): return "goods", None
    if re.search(r"방청권|초대권|공연\s*초대", text): return "experience", None
    return "other", None

def extract_entries(lines, source_url, checked_at, source_kind="official_web"):
    """One entry per distinct concrete benefit, not a heading or an illustrative example."""
    items = []
    for raw in lines or []:
        line = normalized(raw)
        if not line or DISCLAMER.search(line) or not REWARD_PHRASE.search(line):
            continue
        # Skip summary banner when a concrete venue/reward line exists.
        if ("1등 리워드" in line or "1위 리워드" in line) and len(lines or []) > 1:
            continue
        kind, place = classify(line)
        rank = ORDINAL.search(line)
        condition = f"{rank.group(1) or rank.group(2)}위" if rank else None
        period_rule, start, end = parse_period(line)
        if "촬영일" in line and not period_rule:
            period_rule = "쇼! 음악중심 촬영일 (정확한 날짜 미확인)"
        if "트로피" in line and any(item["kind"]=="trophy" and item["condition"]==condition for item in items):
            if len(line) > len(items[-1]["text"]):
                items[-1]["text"] = line
            continue
        entry = {
            "id": hashlib.sha256((line+str(place)+str(condition)).encode()).hexdigest()[:16],
            "text": line, "kind": kind, "place": place, "condition": condition,
            "period_rule": period_rule, "period_text": PENDING.search(line).group(0) if PENDING.search(line) else None,
            "execution_start_at": start, "execution_end_at": end,
            "source_kind": source_kind, "source_url": source_url, "checked_at": checked_at,
        }
        items.append(entry)
    return items
