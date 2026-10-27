import sys,unittest
from pathlib import Path
from datetime import datetime
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from core import *
class ParserTest(unittest.TestCase):
 def test_year_boundary(self):
  self.assertEqual(parse_period('12.29 ~ 01.05',datetime(2026,12,30,tzinfo=KST))[:2],('2026-12-29','2027-01-05'))
 def test_invalid_date(self):self.assertIsNone(parse_period('2026.02.30 ~ 2026.03.02'))
 def test_unknown_date(self):self.assertIsNone(parse_period('내일까지 투표'))
 def test_explicit_year(self):self.assertEqual(parse_period('2025.12.29 ~ 2026.01.05')[2],False)
 def test_not_final(self):
  e=event_from_screen({'id':'x','url':'https://example.org'},'주간 투표','2026.10.19 ~ 2026.10.26\n종료\n1위\n가수A\n12,340표')
  self.assertEqual(e['leader'],'가수A');self.assertEqual(e['winner'],'')
 def test_final(self):
  e=event_from_screen({'id':'x','url':'https://example.org'},'주간 투표','2026.10.19 ~ 2026.10.26\n최종 결과\n1위\n가수A\n12,340표')
  self.assertEqual(e['winner'],'가수A');self.assertFalse(e['lineup_complete'])
 def test_preserve_partial(self):
  self.assertEqual(merge([{'id':'a','start':'2026-01-01','app':'x','title':'x','winner':'A'}],[{'id':'a','start':'2026-01-01','app':'x','title':'x','winner':''}])[0]['winner'],'A')
 def test_dedupe(self):
  e={'id':'a','start':'2026-01-01','app':'x','title':'x'}
  self.assertEqual(len(merge([e],[e])),1)
 def test_button_rejection(self):
  xml='<hierarchy><node clickable="true" bounds="[0,0][100,100]"><node text="투표하기"/><node text="2026.10.01 ~ 2026.10.30"/></node></hierarchy>'
  self.assertEqual(cards(xml),[])
 def test_card(self):
  xml='<hierarchy><node clickable="true" bounds="[0,0][100,100]"><node text="11월 생일 투표" bounds="[1,1][90,40]"/><node text="2026.10.01 ~ 2026.10.30"/></node></hierarchy>'
  self.assertEqual(cards(xml)[0]['title'],'11월 생일 투표')
if __name__=='__main__':unittest.main()
