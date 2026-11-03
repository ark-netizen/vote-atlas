"""Extract versioned reward RULES from verified official public pages.

A document is not a verified active vote. Never manufacture a vote/event or
a precise execution date from a schedule template. All sources are HTTPS and
explicitly scoped to provider-owned public pages.
"""
import hashlib
import re
from bs4 import BeautifulSoup

DOCUMENTS = [
    {
        "app": "linc",
        "url": "https://help.stayge.io/en/articles/What-is-the-LiNC-Comeback-SPOTLIGHT-Vote-c0ffe83a",
        "required": ("Comeback SPOTLIGHT", "Charging Station", "following Tuesday"),
        "rules": [
            {
                "id": "linc-spotlight-live",
                "title": "Comeback SPOTLIGHT · 실시간 1위 영상",
                "text": "투표 진행 중 실시간 1위 아티스트의 영상이 Charging Station SPOTLIGHT에 교차 노출",
                "kind": "advertising",
                "condition": "투표 진행 중 실시간 1위",
                "place": "LiNC 앱 Charging Station SPOTLIGHT",
                "period_rule": "투표 기간 중 1위 유지 시 노출 (순위 변동 시 교체)",
                "period_text": "실시간 순위 변동에 따라 교체; 정확한 송출 시작·종료일은 투표별 미확인",
                "execution_start_at": None, "execution_end_at": None,
                "vote_period_rule": "매주 화요일 12:00 ~ 다음 월요일 23:59 KST (해당 주 미개설 가능)",
            },
            {
                "id": "linc-spotlight-final",
                "title": "Comeback SPOTLIGHT · 최종 1위 영상",
                "text": "최종 1위 영상이 투표 종료 후 다음 화요일 12:00까지 Charging Station SPOTLIGHT에 유지",
                "kind": "advertising",
                "condition": "투표 최종 1위",
                "place": "LiNC 앱 Charging Station SPOTLIGHT",
                "period_rule": "각 회차 종료 후 다음 화요일 12:00 KST까지",
                "period_text": "종료 후 다음 화요일 정오까지; 실제 시작·종료일은 회차별 확인 필요",
                "execution_start_at": None, "execution_end_at": None,
                "vote_period_rule": "매주 화요일 12:00 ~ 다음 월요일 23:59 KST (해당 주 미개설 가능)",
            },
        ],
    },
    {
        "app": "mubeat",
        "url": "https://info.mubeat.tv/board/606/?language=en",
        "required": ("Audience Ticket Event", "Ten winners", "Mubeat Egg"),
        "rules": [{
            "id": "mubeat-audience-ticket-weekly",
            "title": "쇼! 음악중심 방청 이벤트 · 주간 당첨",
            "text": "방청 이벤트 주간 당첨자 10명 선정 (세부 참여·추첨 안내는 뮤빗 공식 X 공지)",
            "kind": "experience",
            "condition": "방청 이벤트가 열린 주에 Mubeat Egg로 참여; 상세 조건 주간 공지",
            "place": "방청 이벤트; 실제 방청 장소 미확인",
            "period_rule": "투표가 있는 주마다 이벤트 진행; 제공 일자 주간 공지",
            "period_text": "세부 일정은 뮤빗 공식 X에서 주간 안내",
            "execution_start_at": None, "execution_end_at": None,
            "vote_period_rule": "쇼! 음악중심 사전투표 화요일 18:00 ~ 목요일 11:00 KST (변동 가능)",
            "followup_url": "https://x.com/MubeatOfficial",
        }],
    },
    {
        "app": "higher",
        "url": "https://apps.apple.com/kr/app/higher-%ED%95%98%EC%9D%B4%EC%96%B4/id1672001935",
        "required": ("Higher", "생일", "광고"),
        "rules": [{
            "id": "higher-birthday-ad-overview",
            "title": "생일 투표 · 아티스트 생일 광고",
            "text": "팬 투표로 아티스트 생일 광고를 선물하는 생일 투표 유형",
            "kind": "advertising",
            "condition": "생일 투표 선정; 투표별 기준 미확인",
            "place": "광고 매체·장소는 투표별 공지 필요",
            "period_rule": "광고 제공 기간 규칙 미확인",
            "period_text": "구체 집행 일정 미확인",
            "execution_start_at": None, "execution_end_at": None,
            "vote_period_rule": None,
        }],
    },
    {
        "app": "mnetplus",
        "url": "https://mnetplus.world/contents/ko/stages/mama-event",
        "required": ("ROUND", "리워드", "2026"),
        "rules": [{
            "id": "mnetplus-mama-2026-reward-announcement",
            "title": "2026 MAMA 이벤트 · 라운드별 리워드 공지",
            "text": "라운드별 경품은 각 라운드 공지에 따라 달라짐",
            "kind": "other",
            "condition": "라운드별 미션·경품 조건 별도 공지",
            "place": "제공 장소 미확인",
            "period_rule": "3차 라운드 리워드 지급 시점: 2026년 11월 중 안내",
            "period_text": "2026년 11월 중 안내 (확정 일자 아님)",
            "execution_start_at": None, "execution_end_at": None,
            "vote_period_rule": None,
            "unconfirmed_reward": True,
        }],
    },
]

def verified_document(html, markers):
    soup = BeautifulSoup(html, "html.parser")
    for node in soup(["script", "style", "noscript", "svg"]):
        node.decompose()
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    checks = [re.sub(r"\s+", " ", marker).casefold() in text.casefold() for marker in markers]
    if len(text) < 200 or not all(checks):
        raise ValueError("Missing official document body or expected content markers")
    return text

def collect_official_rules(get, previous, stamp):
    """Return (rules, per-provider fetch status); preserve last verified on failure."""
    retained = {rule["id"]: dict(rule) for rule in previous if rule.get("id")}
    summary = {}
    for document in DOCUMENTS:
        app = document["app"]
        try:
            html = get(document["url"])
            source_text = verified_document(html, document["required"])
            digest = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
            for spec in document["rules"]:
                old = retained.get(spec["id"], {})
                # Actual linkable vote cycles, if previously captured, are not overwritten by a general guide.
                history = old.get("history", [])
                retained[spec["id"]] = {
                    **spec, "app": app,
                    "source_url": document["url"], "source_kind": "official_web",
                    "checked_at": stamp, "content_hash": digest,
                    "evidence_excerpt": source_text[:1500], "history": history,
                    "verified_source": True,
                }
            summary[app] = {"state": "verified_rules", "count": len(document["rules"]),
                            "url": document["url"], "checked_at": stamp}
        except Exception as exc:
            summary[app] = {"state": "blocked", "count": 0,
                            "url": document["url"], "checked_at": stamp,
                            "error": f"{type(exc).__name__}: {str(exc)[:180]}"}
    return sorted(retained.values(), key=lambda x: (x.get("app", ""), x.get("title", ""))), summary
