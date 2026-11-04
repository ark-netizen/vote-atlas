"""Award RSS parsing: de-duplicate and never promote news guesses to confirmed platforms."""
import importlib.util
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SPEC=importlib.util.spec_from_file_location("discover_awards",Path(__file__).resolve().parents[1]/"scripts"/"discover_awards.py")
mod=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

class AwardDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.now=datetime(2026,11,4,10,0,tzinfo=ZoneInfo("Asia/Seoul"))
        self.known={"id":"apan","name":"APAN 스타 어워즈","aliases":["에이판 스타 어워즈"],"platforms":[{"name":"유픽"}],"voting":"confirmed"}
    def sample(self,title):
        return ('<rss><channel><item><title>'+title+'</title><link>https://news.google.com/articles/one</link>'
                '<pubDate>Tue, 03 Nov 2026 01:00:00 GMT</pubDate><description>팬 투표 플랫폼 선정</description>'
                '</item></channel></rss>').encode()
    def test_feed(self):
        rows=mod.parse_feed(self.sample("2026 새빛 어워즈 투표 시작 - 언론사"),self.now)
        self.assertEqual(len(rows),1)
        self.assertIn("새빛",rows[0]["title"])
    def test_ignore_irrelevant(self):
        self.assertEqual(mod.parse_feed(self.sample("정부 회의 개최"),self.now),[])
    def test_known_alias_and_no_mutation(self):
        base={"awards":[self.known],"discovered":[],"latest_news":[]}
        rows=mod.parse_feed(self.sample("에이판 스타 어워즈 인기상 투표 유픽 선정 - 언론사"),self.now)
        updated=mod.merge_results(base,rows,self.now,len(mod.SEARCHES),[])
        self.assertEqual(len(updated["discovered"]),0)
        self.assertEqual(updated["latest_news"][0]["award_id"],"apan")
        self.assertEqual(updated["awards"][0]["platforms"][0]["name"],"유픽")
    def test_unknown_stays_unverified(self):
        base={"awards":[self.known],"discovered":[],"latest_news":[]}
        rows=mod.parse_feed(self.sample("2026 새빛 어워즈 공식 투표 - 언론사"),self.now)
        updated=mod.merge_results(base,rows,self.now,len(mod.SEARCHES),[])
        self.assertEqual(len(updated["discovered"]),1)
        self.assertEqual(len(updated["awards"]),1)
        again=mod.merge_results(updated,rows,self.now,len(mod.SEARCHES),[])
        self.assertEqual(len(again["discovered"]),1)
        self.assertEqual(again["discovery_status"]["new_candidates"],0)

if __name__=="__main__":
    unittest.main()
