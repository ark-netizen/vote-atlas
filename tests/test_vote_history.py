import datetime as dt
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from vote_history import snapshot,update_history

STAMP="2026-11-04T12:23:00+09:00"
def event(votes=100,when=STAMP,complete=True,roster=None,**overrides):
    item={"id":"muniverse-x","app":"muniverse","title":"WEEKLY M PICK 2026년 11월 1주차",
          "start":"2026-11-01","end":"2026-11-12","collected_at":when,
          "source_url":"https://www.muniverse.io/votes/x","lineup_complete":complete,
          "candidates":roster or [{"id":"A","name":"A","votes":votes},{"id":"B","name":"B","votes":15}]}
    item.update(overrides)
    return item

class DailyHistoryTests(unittest.TestCase):
    def test_observes_only_fresh_candidate_votes(self):
        record=snapshot(event(),"2026-11-04T12:23:00+09:00")
        self.assertEqual(record["total_votes"],115)
        self.assertEqual(record["date"],"2026-11-04")
        self.assertEqual(record["scope"],"all_candidates")
        self.assertIsNone(snapshot(event(when="2026-11-03T01:00:00+09:00"),STAMP))
    def test_same_day_later_snapshot_replaces_not_double_counts(self):
        prior,_added,_changed=update_history({"updated_at":STAMP,"events":[event()]},{})
        latest="2026-11-04T21:10:00+09:00"
        current={"updated_at":latest,"events":[event(votes=500,when=latest)]}
        nxt,added,changed=update_history(current,prior)
        self.assertEqual((added,changed),(0,1))
        self.assertEqual(len(nxt["observations"]),1)
        self.assertEqual(nxt["observations"][0]["total_votes"],515)
        again,added,changed=update_history(current,nxt)
        self.assertEqual((added,changed),(0,0))
    def test_previous_days_retained_without_fabricating_missing_days(self):
        old_day="2026-11-02T12:23:00+09:00"
        a,_,_=update_history({"updated_at":old_day,"events":[event(when=old_day)]},{})
        b,_,_=update_history({"updated_at":STAMP,"events":[event(votes=300)]},a)
        self.assertEqual([x["date"] for x in b["observations"]],["2026-11-02","2026-11-04"])
    def test_partial_roster_recorded_as_partial_not_full(self):
        row=snapshot(event(complete=False),STAMP)
        self.assertEqual(row["scope"],"visible_candidates")
    def test_invalid_votes_or_out_of_period_not_used(self):
        self.assertIsNone(snapshot(event(votes=-1),STAMP))
        self.assertIsNone(snapshot(event(start="2026-11-05"),STAMP))
        self.assertIsNone(snapshot(event(roster=[{"name":"X","votes":None}]),STAMP))
        self.assertIsNone(snapshot(event(roster=[{"name":"X","votes":True}]),STAMP))

if __name__=="__main__":
    unittest.main()
