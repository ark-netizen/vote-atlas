"""Persist one factual daily vote-count observation per vote, without inventing missing days.

GitHub Actions calls this after successfully refreshing events.json. Values are
the sum of the currently published candidate counts, *not* unique voters and
not guaranteed to be official final totals. A changed partial ranking roster
cannot be compared as an unambiguous vote increase.
"""
import datetime as dt
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"
HISTORY_PATH = DATA / "vote_history.json"
KST = dt.timezone(dt.timedelta(hours=9))
RETENTION_DAYS = 400

def parse_time(value):
    try:
        if not isinstance(value, str):
            return None
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result if result.tzinfo else None
    except ValueError:
        return None

def snapshot(event, updated_at):
    """Require this actual collector run's fresh event, not archived/cached rows."""
    updated = parse_time(updated_at)
    observed = parse_time(event.get("collected_at"))
    if not updated or not observed or abs((updated - observed).total_seconds()) > 300:
        return None
    local = observed.astimezone(KST)
    day = local.date().isoformat()
    if not (event.get("start", "") <= day <= event.get("end", "")):
        return None
    candidates = event.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None
    amounts = []
    roster = []
    for candidate in candidates:
        value = candidate.get("votes")
        if isinstance(value, bool) or (isinstance(value, str) and not value.isdigit()):
            return None
        if not isinstance(value, (int, str)) or int(value) < 0:
            return None
        amounts.append(int(value))
        name = str(candidate.get("id") or candidate.get("name") or "").strip()
        if not name:
            return None
        roster.append(name.casefold())
    if not event.get("id") or not event.get("app") or not event.get("title"):
        return None
    digest = hashlib.sha256("\n".join(sorted(roster)).encode("utf-8")).hexdigest()[:20]
    return {
        "date": day, "event_id": event["id"], "app": event["app"],
        "title": event["title"], "total_votes": sum(amounts),
        "candidate_count": len(candidates), "roster_hash": digest,
        "scope": "all_candidates" if event.get("lineup_complete") is True else "visible_candidates",
        "observed_at": local.isoformat(timespec="seconds"),
        "source_url": event.get("source_url") or None,
    }

def update_history(events_document, history_document):
    """Idempotent daily upsert. Keep actual previous days and do not backfill them."""
    stamp = events_document.get("updated_at")
    observed = parse_time(stamp)
    if not observed:
        raise ValueError("Events timestamp missing or malformed")
    old = history_document.get("observations", [])
    records = {(row["event_id"], row["date"]): dict(row)
               for row in old if row.get("event_id") and row.get("date")}
    added = changed = 0
    for event in events_document.get("events", []):
        row = snapshot(event, stamp)
        if not row:
            continue
        key = (row["event_id"], row["date"])
        previous = records.get(key)
        if previous and (parse_time(previous.get("observed_at")) or observed) > (parse_time(row["observed_at"]) or observed):
            continue
        if not previous:
            added += 1
        elif previous != row:
            changed += 1
        records[key] = row
    cutoff = (observed.astimezone(KST).date() - dt.timedelta(days=RETENTION_DAYS)).isoformat()
    rows = sorted((v for v in records.values() if v["date"] >= cutoff),
                  key=lambda r: (r["date"], r["app"], r["event_id"]))
    return {
        "schema_version": 1,
        "updated_at": stamp,
        "notes": "Daily latest observed candidate-vote sum. Missing dates not backfilled. Scope may be partial. No unique participant count.",
        "observations": rows,
    }, added, changed

def main():
    events = json.loads((DATA / "events.json").read_text(encoding="utf-8"))
    prior = json.loads(HISTORY_PATH.read_text(encoding="utf-8")) if HISTORY_PATH.exists() else {}
    updated, added, changed = update_history(events, prior)
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = HISTORY_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(HISTORY_PATH)
    print(f"Daily vote snapshots: {len(updated['observations'])} records, {added} new days, {changed} revised daily observations", flush=True)

if __name__ == "__main__":
    main()
