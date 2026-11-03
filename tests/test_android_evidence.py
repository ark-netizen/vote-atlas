"""Regression tests for isolated Android screen data. No emulator or network required."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from android_evidence import enrich_android_observation


class AndroidEvidenceTests(unittest.TestCase):
    def extract(self, text):
        return enrich_android_observation({
            "app": "idolchamp", "title": "테마 투표",
            "list_text": "", "detail_text": text,
            "seen_at": "2026-11-03T09:31:00+09:00"
        }, screenshot_file="verification/android/idolchamp/example.png")

    def test_no_dates_are_guessed_from_relative_rewards(self):
        row = self.extract(
            "투표 기간 2026.11.01 12:00 ~ 2026.11.07 20:00\n"
            "1위 리워드: 홍대 전광판 광고\n"
            "광고 집행 기간: 추후 공지\n"
            "리워드 제공 기간: 7일간"
        )
        self.assertEqual(row["vote_start_datetime"], "2026-11-01T12:00")
        self.assertEqual(row["vote_end_datetime"], "2026-11-07T20:00")
        self.assertEqual(row["rewards"][0]["ad_execution_start_date"], None)
        self.assertEqual(row["rewards"][0]["ad_execution_end_date"], None)
        self.assertIn("7일간", row["rewards"][0]["delivery_period_raw"])

    def test_ad_period_never_overwrites_vote_period(self):
        row = self.extract(
            "투표 기간\n2026.11.01 ~ 2026.11.05\n"
            "1위 리워드: 강남 옥외광고\n"
            "광고 집행 기간: 2026.11.12 ~ 2026.11.19\n"
            "리워드 제공 기간: 추후 공지"
        )
        self.assertEqual(row["vote_start_date"], "2026-11-01")
        self.assertEqual(row["vote_end_date"], "2026-11-05")
        self.assertEqual(row["rewards"][0]["ad_execution_start_date"], "2026-11-12")
        self.assertEqual(row["rewards"][0]["ad_execution_end_date"], "2026-11-19")
        self.assertEqual(row["rewards"][0]["delivery_start_date"], None)
        self.assertEqual(row["rewards"][0]["delivery_period_raw"], "추후 공지")

    def test_unconfirmed_year_and_schedules_are_missing(self):
        row = self.extract(
            "기간: 11월 01일 ~ 11월 07일\n"
            "1위 리워드: 홍대 지하철 광고\n생일 당일"
        )
        self.assertIsNone(row["vote_start_date"])
        self.assertIsNone(row["vote_end_date"])
        self.assertIsNone(row["rewards"][0]["ad_execution_start_date"])
        self.assertEqual(row["rewards"][0]["delivery_period_raw"], "생일 당일")

    def test_multiple_rewards_kept_separate(self):
        row = self.extract(
            "투표: 2026.11.01 ~ 2026.11.04\n"
            "1위 리워드: 홍대 전광판 광고\n"
            "광고 집행 기간 2026.11.08 ~ 2026.11.14\n"
            "2위 리워드: 서울 버스쉘터 광고\n"
            "광고 집행 기간 2026.11.15 ~ 2026.11.22"
        )
        self.assertEqual(len(row["rewards"]), 2)
        self.assertEqual(row["rewards"][0]["ad_execution_start_date"], "2026-11-08")
        self.assertEqual(row["rewards"][1]["ad_execution_start_date"], "2026-11-15")
        self.assertFalse(row["lineup_complete"])
        self.assertFalse(row["source_compared"])

    def test_generic_reward_heading_does_not_count(self):
        row = self.extract("투표 기간 2026.11.01 ~ 2026.11.05\n리워드 안내")
        self.assertEqual(row["rewards"], [])

    def test_unknown_percentage_and_group_not_invented(self):
        row = self.extract("투표 기간 2026.11.01 ~ 2026.11.05\n"
                           "1위\n지훈\n1,230표")
        self.assertEqual(row["candidates"][0]["name"], "지훈")
        self.assertEqual(row["candidates"][0]["votes"], 1230)
        self.assertIsNone(row["candidates"][0]["group"])
        self.assertEqual(row["candidates"][0]["kind"], "unknown")
        self.assertIsNone(row["candidates"][0]["vote_percent"])

if __name__ == "__main__":
    unittest.main()
