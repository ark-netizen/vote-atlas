"""Conservative structured extraction from real Android UI text.

No guessed dates, percentages, winner, group membership, ad placements or reward
periods. Raw phrases and evidence path are preserved for manual review.
This module must never write to the integrated dist/data/events.json file.
"""
from __future__ import annotations
import re
from datetime import datetime
from typing import Any

FULL_DATE = re.compile(
    r"(?<!\d)(20\d{2})\s*(?:[./-]|년)\s*(\d{1,2})\s*(?:[./-]|월)\s*"
    r"(\d{1,2})\s*(?:일)?(?:\s+|[T])?"
    r"(?:(\d{1,2}):(\d{2}))?(?!\d)"
)
DATE_ONLY = re.compile(
    r"(?<!\d)(?:(20\d{2})\s*(?:[./-]|년)\s*)?(\d{1,2})"
    r"\s*(?:[./-]|월)\s*(\d{1,2})(?:일)?(?!\d)"
)
REWARD_MARKER = re.compile(r"(?:리워드|상품|특전|reward|혜택|보상)", re.I)
ACTUAL_BENEFIT = re.compile(
    r"(?:옥외|전광판|광고|배너|포스터|사이니지|포토존|쿠폰|굿즈|앨범|기프트|"
    r"영상|메시지|서포트|광고판|디스플레이|LED|지하철|버스쉘터)", re.I
)
AD_CONTEXT = re.compile(r"(?:광고|전광판|사이니지|지하철|버스쉘터|옥외|LED)", re.I)
EXECUTION_MARKER = re.compile(r"(?:광고\s*)?(?:집행|게재|노출)\s*(?:기간|일정|일자)", re.I)
DELIVERY_MARKER = re.compile(r"(?:리워드|보상|혜택|제공)\s*(?:기간|일정|일자)", re.I)
CONDITION_MARKER = re.compile(
    r"(?:최종\s*)?(?:1위|2위|3위|TOP\s*\d+|우승|상위\s*\d+명|당첨자)", re.I
)
RELATIVE_DATE = re.compile(
    r"(?:\d+\s*(?:일|주|개월)\s*(?:간|동안)|생일\s*(?:당일|주간)|"
    r"추후\s*공지|별도\s*안내|TBA|미정|예정)", re.I
)
RANGE_SEP = re.compile(r"[~～–—]|\s-\s")
PERCENT = re.compile(r"(?<!\d)(\d{1,3}(?:\.\d{1,3})?)\s*%")


def _date_values(match: re.Match[str]) -> dict[str, str | None]:
    year, month, day, hour, minute = match.groups()
    try:
        value = datetime(int(year), int(month), int(day),
                         int(hour or 0), int(minute or 0))
    except (ValueError, TypeError):
        return {"date": None, "datetime": None, "precision": "unknown"}
    explicit_clock = hour is not None and minute is not None
    return {
        "date": value.date().isoformat(),
        "datetime": value.strftime("%Y-%m-%dT%H:%M") if explicit_clock else None,
        "precision": "minute" if explicit_clock else "date",
    }


def _explicit_period(raw: str) -> dict[str, Any] | None:
    """Requires two complete YYYY-MM-DD dates and a literal range separator."""
    matches = list(FULL_DATE.finditer(raw))
    for left, right in zip(matches, matches[1:]):
        between = raw[left.end():right.start()]
        if len(between) > 40 or not RANGE_SEP.search(between):
            continue
        start = _date_values(left)
        end = _date_values(right)
        if not start["date"] or not end["date"]:
            continue
        return {
            "start_date": start["date"], "end_date": end["date"],
            "start_datetime": start["datetime"], "end_datetime": end["datetime"],
            "precision": "minute" if start["datetime"] and end["datetime"] else "date",
            "raw": raw[left.start():right.end()].strip()
        }
    return None


def _lines(raw: str) -> list[str]:
    return [line.strip() for line in raw.splitlines() if line.strip()]


def _period_with_context(lines: list[str], *, exclude_reward: bool = False,
                         keyword: re.Pattern[str] | None = None) -> dict | None:
    for i, line in enumerate(lines):
        # A reward time is accepted only when its own heading introduces the
        # dates. Do not assign dates from a preceding vote/ad period.
        if keyword:
            if not keyword.search(line):
                continue
            match = _explicit_period(line)
            if match:
                return match
            if i + 1 < len(lines) and not (
                EXECUTION_MARKER.search(lines[i+1]) or
                DELIVERY_MARKER.search(lines[i+1])
            ):
                match = _explicit_period(lines[i+1])
                if match:
                    return match
            continue
        # Vote periods may be described on a heading + following date line.
        if exclude_reward and REWARD_MARKER.search(line):
            continue
        for span in (1, 2):
            blob = " ".join(lines[i:i+span])
            if exclude_reward and REWARD_MARKER.search(blob):
                continue
            match = _explicit_period(blob)
            if match:
                return match
    return None


def _reward_records(lines: list[str], evidence_file: str) -> list[dict]:
    records: list[dict] = []
    seen: set[str] = set()
    for i, line in enumerate(lines):
        if not REWARD_MARKER.search(line):
            continue
        if re.fullmatch(r"(?:리워드|reward|보상|상품|혜택|특전)(?:\s*안내)?[:：]?", line, re.I):
            continue
        # Segregate named reward blocks. Do not combine multiple awards.
        text_block = [line]
        for following in lines[i+1:i+5]:
            if REWARD_MARKER.search(following) and ACTUAL_BENEFIT.search(following):
                break
            text_block.append(following)
        block = " ".join(text_block)
        if not ACTUAL_BENEFIT.search(block):
            continue
        if line in seen:
            continue
        seen.add(line)
        explicit_execution = _period_with_context(
            text_block, keyword=EXECUTION_MARKER
        )
        delivery = _period_with_context(text_block, keyword=DELIVERY_MARKER)
        # A reward may be described as 'for 7 days'; preserve text without inventing dates.
        relative = RELATIVE_DATE.search(block)
        condition = CONDITION_MARKER.search(block)
        location_match = re.search(
            r"(?:광고\s*(?:장소|위치)|집행\s*장소|게재\s*장소)\s*[:：]?\s*"
            r"([^,，;；\n]{2,70})", block
        )
        records.append({
            "description_raw": block[:900],
            "condition_raw": condition.group(0) if condition else None,
            "location_raw": location_match.group(1).strip() if location_match else None,
            "delivery_period_raw": (
                delivery["raw"] if delivery else relative.group(0) if relative else None
            ),
            "delivery_start_date": delivery["start_date"] if delivery else None,
            "delivery_end_date": delivery["end_date"] if delivery else None,
            "ad_execution_period_raw": explicit_execution["raw"] if explicit_execution else None,
            "ad_execution_start_date": explicit_execution["start_date"] if explicit_execution else None,
            "ad_execution_end_date": explicit_execution["end_date"] if explicit_execution else None,
            "evidence_file": evidence_file,
            "verification": "unverified_android_screen"
        })
    return records


def _candidates(raw: str, observed_at: str) -> list[dict]:
    from core import extract_candidates
    out: list[dict] = []
    for candidate in extract_candidates(raw):
        label = candidate["name"]
        name, group, kind = label, None, "unknown"
        # Only use directly attached group labels, never fan knowledge.
        member_group = re.fullmatch(r"(.{1,70}?)\s*[(（]([^()（）]{2,45})[)）]", label)
        if member_group:
            name, group, kind = member_group.group(1), member_group.group(2), "individual"
        # Percent values are only linked when adjacent to the exact candidate row.
        # Otherwise votes and percentages may belong to different candidates.
        pattern = re.compile(
            re.escape(label) + r"\s*\n(?:득표\s*)?[\d,]+\s*(?:표|votes?)\s*\n?"
            r"\s*(" + PERCENT.pattern + r")", re.I
        )
        near = pattern.search(raw)
        percent = None
        if near:
            p = PERCENT.search(near.group(1))
            if p and 0 <= float(p.group(1)) <= 100:
                percent = float(p.group(1))
        out.append({
            "rank": candidate["rank"],
            "name": name, "group": group, "kind": kind,
            "votes": candidate["votes"], "vote_percent": percent,
            "rank_observed_at": observed_at,
            "source": "android_ui_text"
        })
    return out


def enrich_android_observation(observation: dict, *, screenshot_file: str) -> dict:
    """Return one isolated review record. None means not evidenced."""
    text = (observation.get("list_text") or "") + "\n" + (observation.get("detail_text") or "")
    lines = _lines(text)
    observed_at = observation.get("seen_at")
    # Date ranges embedded inside reward blocks cannot become vote date ranges.
    vote_period = _period_with_context(lines, exclude_reward=True)
    if vote_period is None:
        # Ambiguous range never becomes a definitive vote period.
        vote_period = None
    rewards = _reward_records(lines, screenshot_file)
    candidates = _candidates(text, observed_at)
    return {
        "app": observation.get("app"),
        "title": observation.get("title"),
        "vote_start_date": vote_period["start_date"] if vote_period else None,
        "vote_end_date": vote_period["end_date"] if vote_period else None,
        "vote_start_datetime": vote_period["start_datetime"] if vote_period else None,
        "vote_end_datetime": vote_period["end_datetime"] if vote_period else None,
        "vote_period_raw": vote_period["raw"] if vote_period else None,
        "rank_observed_at": observed_at,
        "candidates": candidates,
        "rewards": rewards,
        "lineup_complete": False,
        "source_compared": False,
        "source_type": "Android_UI",
        "source_evidence_file": screenshot_file,
        "raw_screen_excerpt": text[:12000],
    }
