"""Only import validated, structured public vote observations from the phone.
No raw accessibility text, screenshots, login data or private fields are accepted.
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
INCOMING = ROOT / "incoming" / "idolchamp"
EVENTS = ROOT / "dist" / "data" / "events.json"
HISTORY = ROOT / "dist" / "data" / "vote_history.json"
sys.path.insert(0, str(ROOT / "scripts"))
from vote_history import snapshot

ISO_DATE = re.compile(r"^20\d{2}-\d{2}-\d{2}$")
ID = re.compile(r"^idolchamp-[a-f0-9]{20}$")

def accepted(row):
    if not isinstance(row, dict): return None
    essential = ("id", "app", "title", "start", "end", "collected_at")
    if any(not isinstance(row.get(k), str) for k in essential): return None
    if row["app"] != "idolchamp" or not ID.fullmatch(row["id"]): return None
    if not (5 <= len(row["title"]) <= 160 and row["start"] <= row["end"]): return None
    if not ISO_DATE.fullmatch(row["start"]) or not ISO_DATE.fullmatch(row["end"]): return None
    try:
        start = datetime.fromisoformat(row["start"])
        end = datetime.fromisoformat(row["end"])
        stamp = datetime.fromisoformat(row["collected_at"].replace("Z", "+00:00"))
        if stamp.tzinfo is None or (end - start).days > 370: return None
        if abs((datetime.now(timezone.utc) - stamp.astimezone(timezone.utc)).days) > 90: return None
    except (ValueError, OverflowError): return None
    candidates = []
    for c in row.get("candidates", []):
        if not isinstance(c, dict): continue
        name, rank, votes = c.get("name"), c.get("rank"), c.get("votes")
        if not isinstance(name, str) or not (1 <= len(name) <= 90): continue
        if isinstance(rank, bool) or not isinstance(rank, int) or not (1 <= rank <= 100): continue
        if isinstance(votes, bool) or not isinstance(votes, int) or not (0 <= votes <= 10**14): continue
        candidates.append({"name": name, "rank": rank, "votes": votes})
    rewards = [s[:200] for s in row.get("reward_lines", []) if isinstance(s, str) and 8 <= len(s) <= 200][:8]
    return {
        "id": row["id"], "app": "idolchamp", "title": row["title"],
        "start": row["start"], "end": row["end"], "date_precision": "date",
        "year_inferred": False, "candidates": candidates, "lineup_complete": False,
        "leader": next((c["name"] for c in candidates if c["rank"] == 1), None),
        "winner": None, "reward": " / ".join(rewards) or None, "reward_lines": rewards,
        "reward_entries": [], "source": "실제 Android 기기 공개 투표 화면",
        "source_url": "https://www.idolchamp.co.kr/", "collected_at": row["collected_at"],
        "verification": "실제 기기 접근성 화면 · 전체 후보/리워드/최종 결과 미검증",
    }

def ingest(doc, incoming, history):
    records = {row["id"]: row for row in doc.get("events", []) if row.get("id")}
    added = changed = 0
    snapshots = {(o["event_id"], o["date"]): o for o in history.get("observations", [])
                 if o.get("event_id") and o.get("date")}
    for row in incoming:
        obj = accepted(row)
        if obj is None: continue
        previous = records.get(obj["id"])
        if previous and previous.get("collected_at", "") >= obj["collected_at"]:
            continue
        if previous:
            for key in ("candidates", "reward_lines", "reward", "leader"):
                if not obj.get(key) and previous.get(key): obj[key] = previous[key]
            changed += 1
        else: added += 1
        records[obj["id"]] = obj
        observation = snapshot(obj, obj["collected_at"])
        if observation:
            key = (observation["event_id"], observation["date"])
            if key not in snapshots or snapshots[key]["observed_at"] <= observation["observed_at"]:
                snapshots[key] = observation
    if not (added or changed): return doc, history, 0
    doc["events"] = sorted(records.values(), key=lambda e: (e.get("start", ""), e.get("app", ""), e.get("title", "")))
    doc["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sources = doc.get("sources", [])
    source = next((s for s in sources if s.get("id") == "idolchamp"), None)
    if source is None:
        source = {"id": "idolchamp", "name": "아이돌챔프"}
        sources.append(source)
    source.update(state="partial", verified=True,
                  method="실제 기기 접근성 화면 수집 (부분 수집)",
                  count=sum(e.get("app") == "idolchamp" for e in records.values()),
                  last_success=doc["updated_at"],
                  message="사용자가 탐색한 공개 투표 화면의 검증 가능한 항목만 적재; 전체 투표 및 후보 누락 가능")
    doc["sources"] = sources
    history["observations"] = sorted(snapshots.values(), key=lambda o: (o["date"], o["app"], o["event_id"]))
    history["updated_at"] = doc["updated_at"]
    history.setdefault("schema_version", 1)
    return doc, history, added + changed

def main():
    doc = json.loads(EVENTS.read_text(encoding="utf-8"))
    history = json.loads(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else {}
    rows = []
    for p in sorted(INCOMING.glob("*/*.json")):
        try:
            contents = json.loads(p.read_text(encoding="utf-8"))
            if contents.get("schema_version") == 1 and contents.get("app") == "idolchamp" and isinstance(contents.get("events"), list):
                rows.extend(contents["events"][:150])
        except (ValueError, OSError): continue
    doc, history, count = ingest(doc, rows, history)
    if count:
        EVENTS.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Accepted IdolChamp events:", count)

if __name__ == "__main__":
    main()
