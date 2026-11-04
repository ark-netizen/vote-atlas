"""IdolChamp AAA organizer source regression tests; no network required."""
import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from idolchamp_public_collect import parse_aaa_board,collect_idolchamp_aaa,BOARDS

def fixture(rows,images=True):
    def card(i,name,count):
        img=(f'<img alt="{name}" src="https://image.idolchamp.com/{i}.jpg">' if images else "")
        return f"<li><span>{i}</span>{img}<span>{name}</span><b>{count:,}표</b></li>"
    return ('<h2>AAA 2026 결선 투표</h2><h3>Live Standings</h3>'
            '<p>득표 수는 1분 마다 갱신됩니다.</p>'
            '<nav>남자 배우 여자 배우 남자 그룹 가수 여자 그룹 가수 남자 솔로 가수 여자 솔로 가수</nav>'
            '<ul>'+''.join(card(i,*row) for i,row in enumerate(rows,1))+'</ul>'
            '<footer>Asia Artist Awards는</footer>')

class IdolchampOfficialTests(unittest.TestCase):
    def test_votes_and_tie_ranks(self):
        row=parse_aaa_board(fixture([("A",1200),("B",100),("C",100),("D",0)]),"actor_male",
                           observed_at="2026-11-04T10:00:00+09:00")
        self.assertEqual([x["rank"] for x in row["candidates"]],[1,2,2,4])
        self.assertEqual(row["candidates"][0]["votes"],1200)
        self.assertIsNone(row["winner"])
        self.assertFalse(row["lineup_complete"])
    def test_non_vote_page_is_rejected(self):
        with self.assertRaisesRegex(ValueError,"LIVE_STANDINGS"):
            parse_aaa_board("<body>AAA 2026</body>","actor_male")
    def test_unsorted_votes_are_rejected(self):
        with self.assertRaisesRegex(ValueError,"NOT_SORTED"):
            parse_aaa_board(fixture([("A",2),("B",9),("C",1)]),"actor_male")
    def test_server_rendered_text_fallback(self):
        row=parse_aaa_board(fixture([("A",3),("B",2),("C",0)],images=False),"actor_female")
        self.assertEqual(len(row["candidates"]),3)
    def test_independent_board_failures(self):
        def fake_get(url):
            if url.endswith("board=actor_male"):
                return fixture([("A",3),("B",2),("C",1)])
            raise ConnectionError("blocked")
        rows,errors,msg=collect_idolchamp_aaa({},get=fake_get)
        self.assertEqual(len(rows),1)
        self.assertEqual(len(errors),len(BOARDS)-1)
        self.assertIn("1/6",msg)

if __name__=="__main__": unittest.main()
