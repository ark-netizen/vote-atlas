"""Merge concurrent official-data collection and Android ingestion without lost updates.

Called after fetching current main in Actions. The just-collected files live in
$RUNNER_TEMP; current repository files are authoritative for newer records.
No missing observations, prices or dates are fabricated.
"""
import json
import sys
from pathlib import Path
from datetime import datetime

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"dist"/"data"

def time_of(value):
    try:
        if not value:return datetime.min.timestamp()
        return datetime.fromisoformat(str(value).replace("Z","+00:00")).timestamp()
    except (TypeError,ValueError,OverflowError):
        return 0

def choose_cost(old,new):
    if not isinstance(old,dict):return new
    if not isinstance(new,dict):return old
    # The most recently verified public vote-cost source wins. Preserve an
    # explicit vote-level finding over an inferred program-level guide on ties.
    ot=time_of(old.get("checked_at"));nt=time_of(new.get("checked_at"))
    if nt>ot:return new
    if ot>nt:return old
    if old.get("scope")=="vote" and new.get("scope")!="vote":return old
    if new.get("scope")=="vote" and old.get("scope")!="vote":return new
    return new if new.get("verified") else old

def merge_event(old,new):
    a=time_of(old.get("collected_at"));b=time_of(new.get("collected_at"))
    if b>=a:
        combined={**old,**new}
    else:
        combined={**new,**old}
    if old.get("vote_cost") or new.get("vote_cost"):
        combined["vote_cost"]=choose_cost(old.get("vote_cost"),new.get("vote_cost"))
    return combined

def merge_list(existing,incoming,key,when,merger=None):
    data={str(row.get(key)):dict(row) for row in existing if isinstance(row,dict) and row.get(key)}
    for row in incoming:
        if not isinstance(row,dict) or not row.get(key):continue
        k=str(row[key])
        if k not in data:
            data[k]=dict(row)
        elif merger:
            data[k]=merger(data[k],row)
        elif time_of(row.get(when))>=time_of(data[k].get(when)):
            data[k]={**data[k],**row}
        else:
            data[k]={**row,**data[k]}
    return list(data.values())

def merge_sources(existing,incoming):
    d={x["id"]:dict(x) for x in existing if isinstance(x,dict) and x.get("id")}
    for x in incoming:
        if not isinstance(x,dict) or not x.get("id"):continue
        k=x["id"];old=d.get(k)
        if not old:
            d[k]=dict(x);continue
        old_stamp=time_of(old.get("attempted_at") or old.get("last_success"))
        new_stamp=time_of(x.get("attempted_at") or x.get("last_success"))
        result={**old,**x} if new_stamp>=old_stamp else {**x,**old}
        # A web-only collector must not silently erase Android verified state.
        if old.get("verified") and not result.get("verified") and not x.get("verified"):
            for key in ("verified","state","count","method","last_success"):
                result[key]=old.get(key)
        d[k]=result
    return list(d.values())

def merge_status(original,new):
    result=dict(original or {})
    for key,row in (new or {}).items():
        if key not in result or time_of(row.get("checked_at"))>=time_of(result[key].get("checked_at")):
            result[key]=row
    return result

def merge_events(latest,incoming):
    out={**incoming,**latest}
    out["events"]=sorted(merge_list(latest.get("events",[]),incoming.get("events",[]),
                                   "id","collected_at",merge_event),
                         key=lambda e:(e.get("end",""),e.get("id","")),reverse=True)
    out["sources"]=merge_sources(latest.get("sources",[]),incoming.get("sources",[]))
    for field in ("reward_policies","official_posts","vote_cost_rules"):
        out[field]=merge_list(latest.get(field,[]),incoming.get(field,[]),"id","checked_at")
    for field in ("policy_source_status","official_sns_status","vote_cost_source_status"):
        out[field]=merge_status(latest.get(field,{}),incoming.get(field,{}))
    out["updated_at"]=max(latest.get("updated_at") or "",incoming.get("updated_at") or "")
    return out

def merge_history(latest,incoming):
    out={**incoming,**latest}
    old=latest.get("observations",[])
    new=incoming.get("observations",[])
    bykey={(o["event_id"],o["date"]):dict(o) for o in old
           if isinstance(o,dict) and o.get("event_id") and o.get("date")}
    for row in new:
        if not isinstance(row,dict) or not row.get("event_id") or not row.get("date"):
            continue
        k=(row["event_id"],row["date"])
        if k not in bykey or time_of(row.get("observed_at"))>time_of(bykey[k].get("observed_at")):
            bykey[k]=row
    out["observations"]=sorted(bykey.values(),key=lambda x:(x["date"],x["event_id"]))
    out["updated_at"]=max(latest.get("updated_at") or "",incoming.get("updated_at") or "")
    return out

def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def write(path,obj):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main(events_in,history_in):
    epath=DATA/"events.json";hpath=DATA/"vote_history.json"
    incoming_e=load(events_in);incoming_h=load(history_in)
    latest_e=load(epath) if epath.exists() else {}
    latest_h=load(hpath) if hpath.exists() else {}
    combined_e=merge_events(latest_e,incoming_e)
    combined_h=merge_history(latest_h,incoming_h)
    write(epath,combined_e);write(hpath,combined_h)
    confirmed=sum(bool(e.get("vote_cost")) for e in combined_e["events"])
    print(f"Merged {len(combined_e['events'])} vote events / {confirmed} with observed per-vote cost / {len(combined_h['observations'])} dated observations")

if __name__=="__main__":
    if len(sys.argv)!=3:raise SystemExit("usage: merge_collected_data.py collected_events.json collected_vote_history.json")
    main(sys.argv[1],sys.argv[2])
