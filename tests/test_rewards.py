import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from web_collect import reward_lines_from_html, muniverse_event

class RewardTests(unittest.TestCase):
    def test_reward_lines_from_multiple_elements(self):
        text='<h3>1위 혜택 안내</h3><ul><li>삼성역 전광판 광고 송출</li><li>1위 트로피 수여</li></ul>'
        self.assertEqual(reward_lines_from_html(text),['1위 혜택 안내','삼성역 전광판 광고 송출','1위 트로피 수여'])

    def test_rank_is_not_reward(self):
        self.assertEqual(reward_lines_from_html('<p>현재 1위 그룹 A</p>'),[])

    def test_muniverse_reward_persists(self):
        e=muniverse_event({'voteCode':'test2','voteName':'테스트','startTime':'2026-11-01T00:00:00+09:00',
            'endTime':'2026-11-12T23:59:00+09:00','status':'OPEN',
            'content':'<p>1위 트로피 수여</p>','candidates':[]})
        self.assertEqual(e['reward_lines'],['1위 트로피 수여'])
        self.assertEqual(e['reward'],'1위 트로피 수여')
