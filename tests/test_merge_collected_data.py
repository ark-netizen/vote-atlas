import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from merge_collected_data import merge_events,merge_history

class ConcurrentDataMergeTests(unittest.TestCase):
 def test_preserves_newer_android_vote_and_imports_new_api_cost(self):
  latest={"events":[{"id":"a","app":"muniverse","collected_at":"2026-11-04T13:35:00+09:00","candidates":[{"votes":300}]}],
          "sources":[{"id":"idolchamp","verified":True,"state":"ok","count":2,
                      "last_success":"2026-11-04T13:34:00+09:00"}],"updated_at":"2026-11-04T13:35:00+09:00"}
  collected={"events":[{"id":"a","app":"muniverse","collected_at":"2026-11-04T13:29:00+09:00",
           "candidates":[{"votes":100}],
           "vote_cost":{"checked_at":"2026-11-04T13:29:00+09:00","status":"verified_vote_api",
                        "options":[{"currency":"애드루미","units_per_vote":10}]}}],
          "sources":[{"id":"idolchamp","verified":False,"state":"blocked","attempted_at":"2026-11-04T13:40:00+09:00"}],
          "updated_at":"2026-11-04T13:29:00+09:00"}
  merged=merge_events(latest,collected)
  self.assertEqual(merged["events"][0]["candidates"][0]["votes"],300)
  self.assertEqual(merged["events"][0]["vote_cost"]["options"][0]["units_per_vote"],10)
  self.assertTrue(merged["sources"][0]["verified"])
  self.assertEqual(merged["updated_at"],latest["updated_at"])
 def test_preserves_source_rules_from_both_sessions(self):
  a={"events":[],"sources":[],"vote_cost_rules":[{"id":"x","checked_at":"2026-11-04T13:10:00+09:00"}]}
  b={"events":[],"sources":[],"vote_cost_rules":[{"id":"y","checked_at":"2026-11-04T13:20:00+09:00"}]}
  self.assertEqual({x["id"] for x in merge_events(a,b)["vote_cost_rules"]},{"x","y"})
 def test_union_of_daily_snapshots_with_newer_observation_wins(self):
  latest={"observations":[{"event_id":"a","date":"2026-11-03","observed_at":"2026-11-03T19:00:00+09:00","total_votes":90}]}
  incoming={"observations":[{"event_id":"a","date":"2026-11-03","observed_at":"2026-11-03T10:00:00+09:00","total_votes":40},
            {"event_id":"b","date":"2026-11-04","observed_at":"2026-11-04T12:00:00+09:00","total_votes":60}]}
  merged=merge_history(latest,incoming)
  self.assertEqual(len(merged["observations"]),2)
  self.assertEqual(merged["observations"][0]["total_votes"],90)

if __name__=="__main__":unittest.main()
