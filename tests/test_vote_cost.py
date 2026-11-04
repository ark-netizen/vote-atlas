import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from vote_cost import muniverse_listing_costs
from vote_cost_rules import check_document,match_event_rule

class PerVoteCostTest(unittest.TestCase):
 def test_listing_values_are_per_vote_not_one_app_global_default(self):
  html="""<main>
  <div><h3>WEEKLY M PICK 2026년 11월 1주차</h3><p>기간 : 2026.10.30 ~ 11.04</p>
     <span>표 당</span><span>10</span><button>투표 결과</button></div>
  <div><h3>쇼! 음악중심 967회 | STAGE M PICK</h3><p>기간 : 2026.10.24 ~ 10.29</p>
     <span>표 당</span><span>1</span><span>10</span><button>투표 결과</button></div>
  <div><h3>쇼! 음악중심 968회 | 글로벌 사전투표</h3><p>기간 : 2026.10.27 ~ 10.29</p>
     <span>표 당</span><span>5</span><button>투표 결과</button></div></main>"""
  events=[{"id":"a","title":"WEEKLY M PICK 2026년 11월 1주차"},
          {"id":"b","title":"쇼! 음악중심 967회 | STAGE M PICK"},
          {"id":"c","title":"쇼! 음악중심 968회 | 글로벌 사전투표"},
          {"id":"missing","title":"다른 투표"}]
  values=muniverse_listing_costs(html,events,"2026-11-04T13:00:00+09:00")
  self.assertEqual(values['a']['cost_options'],[10])
  self.assertEqual(values['b']['cost_options'],[1,10])
  self.assertEqual(values['c']['cost_options'],[5])
  self.assertNotIn('missing',values)
  self.assertEqual(values['b']['status'],'multiple_options')
  self.assertIsNone(values['b']['units_per_vote'])
 def test_never_copy_next_card_price_to_unpriced_card(self):
  html='<h3>Vote A</h3><p>기간 : 11.01~11.02</p><button>투표</button><h3>Vote B</h3><p>기간 : 11.03~11.04</p><span>표 당</span><span>10</span><button>투표 결과</button>'
  values=muniverse_listing_costs(html,[{"id":"a","title":"Vote A"},{"id":"b","title":"Vote B"}],"2026-11-04T13:00:00+09:00")
  self.assertNotIn('a',values)
  self.assertEqual(values['b']['cost_options'],[10])
 def test_rule_must_match_named_vote_program(self):
  rule={"id":"linc-spotlight","app":"linc","verified":True,
        "program":"Comeback SPOTLIGHT","match_title":"Comeback SPOTLIGHT",
        "options":[{"currency":"팬포인트","units_per_vote":3},{"currency":"GEM","units_per_vote":1}],
        "url":"https://help.stayge.io/en/articles/example","checked_at":"2026-11-04T13:00:00+09:00",
        "evidence":"Each vote uses 3 Fan Points or 1 GEM"}
  a=match_event_rule({"app":"linc","title":"Comeback SPOTLIGHT Vote"},[rule])
  self.assertEqual(len(a['options']),2)
  self.assertEqual(a['scope'],'program')
  self.assertIsNone(match_event_rule({"app":"linc","title":"Album Support vote"},[rule]))
 def test_source_validation_requires_specific_price_text(self):
  self.assertFalse(check_document("Login required to vote",["1회 투표 시 하트비트 3개"]))
  self.assertTrue(check_document("official notice: "+"a"*160+" 1회 투표 시 하트비트 3개",["1회 투표 시 하트비트 3개"]))

if __name__=='__main__':unittest.main()
