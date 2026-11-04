"""Verify official, program-specific currency requirements on every public-data run.

Distinguish platform-wide voting currencies from the precise cost of a given
program. Preserve last independently verified rule if source goes down.
No other program receives an inferred 1-vote requirement.
"""
import re
from bs4 import BeautifulSoup

DOCUMENTS = [
 {"app":"linc","program":"SBS 인기가요 글로벌 사전투표",
  "url":"https://help.stayge.io/ko/articles/SBS%EC%9D%B8%EA%B8%B0%EA%B0%80%EC%9A%94-%EC%82%AC%EC%A0%84%ED%88%AC%ED%91%9C-%EC%95%88%EB%82%B4-34d052e7",
  "markers":("투표 1회 당 30팬 포인트 또는 8GEM","매일 10회"),
  "match_title":r"(?:인기가요|inkigayo).*(?:사전|pre.?vote)",
  "options":[{"currency":"팬포인트","units_per_vote":30},{"currency":"GEM","units_per_vote":8}],
  "evidence":"투표 1회 당 30팬 포인트 또는 8GEM"},
 {"app":"linc","program":"Comeback SPOTLIGHT",
  "url":"https://help.stayge.io/en/articles/What-is-the-LiNC-Comeback-SPOTLIGHT-Vote-c0ffe83a",
  "markers":("Each vote uses 3 Fan Points or 1 GEM","Comeback SPOTLIGHT"),
  "match_title":r"Comeback\s*SPOTLIGHT",
  "options":[{"currency":"팬포인트","units_per_vote":3},{"currency":"GEM","units_per_vote":1}],
  "evidence":"Each vote uses 3 Fan Points or 1 GEM"},
 {"app":"mubeat","program":"쇼! 음악중심 글로벌 사전투표",
  "url":"https://info.mubeat.tv/board/606/?language=ko",
  "markers":("1회 투표 시 하트비트 3개","글로벌 사전 투표"),
  "match_title":r"(?:음악중심|music\s*core).*(?:사전|pre.?vote)",
  "options":[{"currency":"하트비트","units_per_vote":3}],
  "evidence":"1회 투표 시 하트비트 3개가 사용됩니다"},
 {"app":"mubeat","program":"쇼! 음악중심 생방송 앱 투표",
  "url":"https://info.mubeat.tv/board/606/?language=ko",
  "markers":("30 하트비트 = 1 투표권","생방송 투표권"),
  "match_title":r"(?:음악중심|music\s*core).*(?:생방송|live)",
  "options":[{"currency":"생방송 투표권","units_per_vote":1}],
  "evidence":"별도의 생방송 투표권으로만 참여 (30 하트비트로 투표권 1장 교환 가능)",
  "exchange":{"from_currency":"하트비트","from_units":30,"to_currency":"생방송 투표권","to_units":1}},
 {"app":"fannstar","program":"팬앤스타 랭킹 · 일반 별",
  "url":"https://fannstar.tf.co.kr/guide",
  "markers":("일반 별","투표 (1개당 1표)"),
  "match_title":r"(?!)",
  "options":[{"currency":"일반 별","units_per_vote":1}],
  "evidence":"일반 별 1개당 1표",
  "scope_note":"공식 일반 랭킹 가이드; 투표별 적용 여부 미확인"},
 {"app":"fannstar","program":"팬앤스타 랭킹 · 무지개 별",
  "url":"https://fannstar.tf.co.kr/guide",
  "markers":("무지개 별","투표 (1개당 5표)"),
  "match_title":r"(?!)",
  "options":[{"currency":"무지개 별","units_per_vote":0.2,"votes_per_unit":5}],
  "evidence":"무지개 별 1개당 5표",
  "scope_note":"공식 일반 랭킹 가이드; 투표별 적용 여부 미확인"},
]
def official_text(html):
    soup=BeautifulSoup(html,"html.parser")
    for tag in soup(["script","style","noscript","svg"]):tag.decompose()
    return re.sub(r"\s+"," ",soup.get_text(" ",strip=True))
def check_document(text, markers):
    return len(text)>150 and all(re.sub(r"\s+"," ",m).casefold() in text.casefold() for m in markers)
def collect_app_cost_rules(get, old_rules, checked_at):
    prior={x["id"]:x for x in old_rules if x.get("id")}
    status={}
    cache={}
    for config in DOCUMENTS:
        app=config["app"]; key=app+"-"+re.sub(r"[^a-z0-9]+","-",config["program"].casefold()).strip("-")
        # IDs are stable and do not contain arbitrary provider-generated markup.
        key=app+"-"+str(DOCUMENTS.index(config))
        try:
            if config["url"] not in cache:cache[config["url"]]=official_text(get(config["url"]))
            text=cache[config["url"]]
            if not check_document(text,config["markers"]):
                raise ValueError("Expected documented per-vote currency requirement absent")
            rule={**config,"id":key,"verified":True,"source_kind":"official_web",
                  "checked_at":checked_at,"requirement_status":"verified_program_rule"}
            prior[key]=rule
            status[key]={"state":"verified","app":app,"checked_at":checked_at,"url":config["url"]}
        except Exception as exc:
            status[key]={"state":"blocked","app":app,"checked_at":checked_at,
                         "url":config["url"],"error":str(exc)[:140]}
    return list(prior.values()),status
def match_event_rule(event,rules):
    app=event.get("app");title=event.get("title","")
    matches=[r for r in rules if r.get("app")==app and r.get("verified") and
             r.get("match_title") and re.search(r["match_title"],title,re.I)]
    if len(matches)!=1:return None
    rule=matches[0]
    return {"status":"verified_program_rule","app":app,"program":rule["program"],
            "options":rule["options"],"source_url":rule["url"],"source_kind":"official_web",
            "checked_at":rule["checked_at"],"evidence":rule["evidence"],
            "rule_id":rule["id"],"scope":"program"}
