import datetime as dt
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import web_collect as w

class PublicParserTests(unittest.TestCase):
    def detail(self, **changes):
        d={'voteCode':'test','voteName':'검증용 투표','startTime':'2026-10-24T23:30:00Z','endTime':'2026-10-29T03:00:00Z','status':'OPEN','resultOpenTime':'2026-10-29T03:01:00Z','content':'<p>1위 트로피 수여</p>','candidates':[{'candidateSeq':1,'name':'후보 A','ranking':1,'voteCount':5}]}
        return {**d,**changes}
    def test_timezone_and_live_leader_not_final(self):
        e=w.muniverse_event(self.detail())
        self.assertEqual(e['start'],'2026-10-25')
        self.assertEqual(e['leader'],'후보 A')
        self.assertIsNone(e['winner'])
    def test_closed_but_not_published(self):
        with patch.object(w,'NOW',dt.datetime(2026,10,29,12,0,30,tzinfo=w.KST)):
            self.assertIsNone(w.muniverse_event(self.detail(status='CLOSED'))['winner'])
    def test_published_and_tied(self):
        with patch.object(w,'NOW',dt.datetime(2026,10,30,tzinfo=w.KST)):
            d=self.detail(status='CLOSED');d['candidates'].append({'candidateSeq':2,'name':'후보 B','ranking':1,'voteCount':5})
            self.assertEqual(w.muniverse_event(d)['winner'],'후보 A, 후보 B')
    def test_missing_period_fails(self):
        with self.assertRaises(ValueError): w.fanstar_event('<h2>LOGIN</h2>','https://example.com','그룹')
    def test_fanstar_partial_and_year_boundary(self):
        html='<div class="date_toggle_area">12월 5주차 <span>12.28 ~ 01.04</span></div><article class="rank_grid_card"><span class="badge_rank">1</span><div class="v_rk_info_name">A &amp; B</div><div class="v_rk_info_vote"><strong>1,234</strong></div></article>'
        with patch.object(w,'NOW',dt.datetime(2027,1,1,tzinfo=w.KST)):
            e=w.fanstar_event(html,'https://example.com','그룹')
        self.assertEqual((e['start'],e['end']),('2026-12-28','2027-01-04'))
        self.assertEqual(e['candidates'][0]['votes'],1234)
        self.assertFalse(e['lineup_complete'])
        self.assertIsNone(e['winner'])

if __name__=='__main__':unittest.main()
