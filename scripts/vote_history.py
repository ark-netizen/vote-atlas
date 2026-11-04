"""Persist one factual daily vote-count observation per vote, without inventing missing days.

GitHub Actions calls this after successfully refreshing events.json. Values are
the sum of the currently published candidate counts, *not* unique voters and
not guaranteed to be official final totals. A changed partial ranking roster
cannot be compared as an unambiguous vote increase.
"""
import datetime as dt
import hashlib
import json
import subprocess
import sys
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
    if not (isinstance(event.get("start"), str) and isinstance(event.get("end"), str)
            and event["start"] <= day <= event["end"]):
        return None
    candidates = event.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None
    amounts = []
    roster = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            return None
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

def backfill_from_git(previous, max_commits=120):
    """Recover factual historical snapshots from past committed JSON versions.

    No estimated dates or votes: each recovered point must have been freshly
    recorded in the original collector run. Best-effort, one-time bootstrap.
    """
    cmd = ["git", "log", "--format=%H", "-n", str(max_commits),
           "--", "dist/data/events.json"]
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                            timeout=30, check=True)
    commits = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not commits:
        raise ValueError("No historical vote data commits in checkout")
    total = 0
    merged = previous
    for sha in reversed(commits):
        try:
            version = subprocess.run(
                ["git", "show", sha + ":dist/data/events.json"],
                cwd=ROOT, capture_output=True, timeout=14, check=True
            )
            document = json.loads(version.stdout)
            merged, added, _changed = update_history(document, merged)
            total += added
        except (subprocess.SubprocessError, ValueError, json.JSONDecodeError, KeyError):
            continue
    merged["git_backfill_done"] = True
    merged["git_commits_checked"] = len(commits)
    print(f"Verified history backfill: {total} actual daily records from {len(commits)} committed versions", flush=True)
    return merged

def main():
    events = json.loads((DATA / "events.json").read_text(encoding="utf-8"))
    prior = json.loads(HISTORY_PATH.read_text(encoding="utf-8")) if HISTORY_PATH.exists() else {}
    if "--backfill-git" in sys.argv and not prior.get("git_backfill_done"):
        try:
            prior = backfill_from_git(prior)
        except (subprocess.SubprocessError, ValueError) as exc:
            print("Historical backfill unavailable; retain only observed new data:", str(exc)[:150], flush=True)
    updated, added, changed = update_history(events, prior)
    for meta in ("git_backfill_done", "git_commits_checked"):
        if meta in prior:
            updated[meta] = prior[meta]
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = HISTORY_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(HISTORY_PATH)
    print(f"Daily vote snapshots: {len(updated['observations'])} records, {added} new days, {changed} revised daily observations", flush=True)

if __name__ == "__main__":
    main()
