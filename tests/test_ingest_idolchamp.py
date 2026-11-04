import unittest
from scripts.ingest_idolchamp import accepted, ingest

class IngestTests(unittest.TestCase):
    def event(self):
        return dict(id="idolchamp-" + "a" * 20, app="idolchamp", title="11월 팬 투표",
                    start="2026-11-01", end="2026-11-30", collected_at="2026-11-04T10:00:00+09:00",
                    candidates=[{"rank": 1, "name": "후보A", "votes": 400}],
                    reward_lines=["1위 서울 전광판 광고 송출"])

    def test_accept_known_fields(self):
        row = accepted(self.event())
        self.assertEqual(row["leader"], "후보A")
        self.assertIsNone(row["winner"])
        self.assertEqual(row["reward_lines"], ["1위 서울 전광판 광고 송출"])
        self.assertNotIn("raw_screen", row)

    def test_reject_bad_package(self):
        obj = self.event(); obj["app"] = "other"
        self.assertIsNone(accepted(obj))

    def test_does_not_delete_history(self):
        doc, hist, count = ingest({"events": [], "sources": []}, [self.event()], {"observations": []})
        self.assertEqual(count, 1)
        self.assertEqual(doc["events"][0]["app"], "idolchamp")
        self.assertEqual(doc["sources"][0]["state"], "partial")
        self.assertEqual(len(hist["observations"]), 1)

if __name__ == "__main__":
    unittest.main()
