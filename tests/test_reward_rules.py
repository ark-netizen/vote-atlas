import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from reward_parse import extract_entries, parse_period
from official_web_rules import verified_document, collect_official_rules
from official_sns_collect import extract_official_posts

class RewardRulesTests(unittest.TestCase):
    def test_distinct_ad_placements(self):
        lines=['1등 리워드 : 모든 전광판 점령', '1️⃣ 쇼! 음악중심 촬영일 MBC 본사 초대형 실내 전광판 리워드 광고 송출',
               '2️⃣ 쇼! 음악중심 촬영일 MBC 본사 옥외 전광판 리워드 광고 송출',
               '*옥외 전광판 영상(예시)', '일정/리워드는 변경될 수 있음']
        entries=extract_entries(lines,'https://www.muniverse.io/votes/example','2026-11-03T14:00:00+09:00')
        self.assertEqual(len(entries),2)
        self.assertNotEqual(entries[0]['place'],entries[1]['place'])
        self.assertTrue(all(e['execution_start_at'] is None for e in entries))
    def test_duration_not_fabricated(self):
        rule,start,end=parse_period('1위 광고 7일간 송출 (추후 공지)')
        self.assertEqual(rule,'7일간')
        self.assertIsNone(start);self.assertIsNone(end)
    def test_actual_dates_only_when_both_explicit(self):
        rule,start,end=parse_period('광고 2026.11.07 ~ 2026.11.13 7일간')
        self.assertEqual(start,'2026-11-07')
        self.assertEqual(end,'2026-11-13')
    def test_document_requires_textual_markers(self):
        with self.assertRaises(ValueError):
            verified_document('<html><body>Sign in to view the page</body></html>',('Audience Ticket Event',))
    def test_social_posts_must_link_official_account(self):
        html='<article><a href="/unofficial/status/1234567890">abc</a><p>Vote reward</p></article>'
        self.assertEqual(extract_official_posts(html,'MubeatOfficial','2026-11-03T14:00:00+09:00'),[])
        official='<article><a href="/MubeatOfficial/status/1234567890">vote</a><p>Ticket reward notice</p></article>'
        self.assertEqual(len(extract_official_posts(official,'MubeatOfficial','2026-11-03T14:00:00+09:00')),1)
    def test_failure_preserves_prior_verified_document(self):
        prior=[{'id':'linc-spotlight-live','app':'linc','text':'previous rule','checked_at':'2026-11-01T14:00:00+09:00'}]
        policies,status=collect_official_rules(lambda url: '',prior,'2026-11-03T14:00:00+09:00')
        self.assertEqual(next(p for p in policies if p['id']=='linc-spotlight-live')['text'],'previous rule')
        self.assertEqual(status['linc']['state'],'blocked')

if __name__ == '__main__':
    unittest.main()
