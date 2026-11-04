"""Read public official voting data. No login, votes, APKs, or paid APIs."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.request
from bs4 import BeautifulSoup
from reward_parse import extract_entries
from vote_cost import muniverse_listing_costs
from vote_cost_rules import collect_app_cost_rules, match_event_rule
from official_web_rules import collect_official_rules
from official_sns_collect import collect_official_sns

ROOT = Path(__file__).resolve().parents[1]
KST = dt.timezone(dt.timedelta(hours=9))
NOW = dt.datetime.now(KST)
STAMP = NOW.isoformat(timespec='seconds')

def get(url):
    time.sleep(0.35)
    request = urllib.request.Request(url, headers={'User-Agent': 'VoteAtlas/1.0 (public voting calendar; read-only)', 'Accept-Language': 'ko'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8')

def moment(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(KST)

def clean(value):
    return BeautifulSoup(value or '', 'html.parser').get_text(' ', strip=True)

REWARD_TERMS = re.compile(
    r'리워드|우승\s*혜택|수상\s*혜택|혜택\s*안내|상품\s*제공|전광판|지하철\s*광고|옥외\s*광고|광고\s*송출|트로피|상패|특전|reward|prize|1위.{0,18}(수여|제공|증정|광고|송출|게재|노출)',
    re.I,
)

def reward_lines_from_html(html):
    """Only source-backed reward statements from each official vote description."""
    soup = BeautifulSoup(html or '', 'html.parser')
    for tag in soup(['script', 'style', 'noscript']):
        tag.decompose()
    lines = []
    for node in soup.select('p, li, tr, h2, h3, h4'):
        line = re.sub(r'\s+', ' ', node.get_text(' ', strip=True))
        if 6 <= len(line) <= 340 and REWARD_TERMS.search(line) and line not in lines:
            lines.append(line)
    if not lines:
        for line in soup.get_text('\n', strip=True).splitlines():
            line = re.sub(r'\s+', ' ', line)
            if 6 <= len(line) <= 240 and REWARD_TERMS.search(line) and line not in lines:
                lines.append(line)
    return lines[:12]

def muniverse_event(detail):
    start, end = moment(detail['startTime']), moment(detail['endTime'])
    candidates = [{'rank': c.get('ranking'), 'name': c['name'], 'votes': c.get('voteCount'), 'id': c['candidateSeq']} for c in detail['candidates']]
    top = [c['name'] for c in candidates if c['rank'] == 1 and (c['votes'] or 0) > 0]
    leader = ', '.join(top) or None
    result_at = detail.get('resultOpenTime')
    final = detail['status'] == 'CLOSED' and end <= NOW and bool(result_at) and moment(result_at) <= NOW
    reward = reward_lines_from_html(detail.get('content', ''))
    return {'id': 'muniverse-' + detail['voteCode'], 'app': 'muniverse', 'title': detail['voteName'],
            'start': start.date().isoformat(), 'end': end.date().isoformat(),
            'start_at': start.isoformat(), 'end_at': end.isoformat(), 'date_precision': 'minute', 'year_inferred': False,
            'leader': leader, 'winner': leader if final else None, 'result_status': 'published' if final else 'not_final',
            'candidates': candidates, 'lineup_complete': True, 'reward': '\n'.join(reward) or None, 'reward_lines': reward,
            'reward_entries': extract_entries(reward, 'https://www.muniverse.io/votes/' + detail['voteCode'], STAMP),
            'source': '공식 공개 데이터', 'source_url': 'https://www.muniverse.io/votes/' + detail['voteCode'],
            'collected_at': STAMP, 'verification': '공식 상세 응답 확인' + (' · 종료·결과 공개 시각 확인' if final else ''),
            'evidence': clean(detail.get('content', '')), 'provider_status': detail['status']}

def collect_muniverse(previous):
    events, errors, seen = [], [], set()
    cutoff = NOW - dt.timedelta(days=90)
    listing_complete = False
    for page in range(1, 31):
        listing = json.loads(get(f'https://api.muniverse.io/api/v2/votes?status=all&page={page}&pageSize=10'))
        print(f'muniverse list {page}: {len(events)} details collected', flush=True)
        for item in listing['data']:
            code = item['voteCode']
            if code in seen or moment(item['endTime']) < cutoff:
                continue
            seen.add(code)
            old = previous.get('muniverse-' + code)
            # Refresh recent results for corrections; older published results remain archived.
            if old and old.get('winner') and moment(item['endTime']) < NOW - dt.timedelta(days=7) and old.get('vote_cost'):
                events.append(old)
                continue
            try:
                detail = json.loads(get('https://api.muniverse.io/api/v2/votes/' + code))
                event = muniverse_event(detail)
                # Cost is independently verified on the official listing page
                # after collecting each vote; no one-size-fits-all Lumi rule.
                if old and old.get('vote_cost'):
                    event['vote_cost'] = old['vote_cost']
                events.append(event)
            except Exception as exc:
                errors.append(f'{code}: {type(exc).__name__}: {exc}')
        if not listing.get('next'):
            listing_complete = True
            break
    if not events:
        raise ValueError('No verified vote details')
    try:
        listing_page=get('https://www.muniverse.io/votes')
        costs=muniverse_listing_costs(listing_page,events,STAMP)
        for event in events:
            if event['id'] in costs:event['vote_cost']=costs[event['id']]
        print(f'muniverse verified per-vote costs {len(costs)} / {len(events)}',flush=True)
    except Exception as exc:
        print(f'muniverse official cost-list check failed (past records retained): {type(exc).__name__}: {str(exc)[:130]}',flush=True)
    if not listing_complete:
        errors.append('Pagination limit reached')
    return events, errors, f'최근 90일 투표 {len(events)}건 · 후보·득표·기간 확인'

def fanstar_event(html, url, name):
    soup = BeautifulSoup(html, 'html.parser')
    period_node = soup.select_one('.date_toggle_area')
    if not period_node:
        raise ValueError('Vote period missing')
    period = period_node.get_text(' ', strip=True)
    match = re.search(r'(\d{1,2})\.(\d{1,2})\s*~\s*(\d{1,2})\.(\d{1,2})', period)
    if not match:
        raise ValueError('Unknown period: ' + period)
    m1,d1,m2,d2 = map(int,match.groups())
    choices=[]
    for year in [NOW.year-1,NOW.year,NOW.year+1]:
        try:
            start=dt.date(year,m1,d1);end=dt.date(year+(m2<m1),m2,d2)
            choices.append((abs((start-NOW.date()).days),start,end))
        except ValueError: pass
    _,start,end=min(choices)
    candidates=[]
    rows=soup.select('article.rank_grid_card')
    for row in rows:
        rank=row.select_one('.badge_rank'); artist=row.select_one('.v_rk_info_name'); votes=row.select_one('.v_rk_info_vote strong')
        if not all([rank,artist,votes]):continue
        candidates.append({'rank':int(rank.get_text(strip=True)), 'name':artist.get_text(' ',strip=True), 'votes':int(votes.get_text(strip=True).replace(',',''))})
    if not candidates:raise ValueError('Candidate rows missing')
    section=soup.select_one('h2.section_title')
    title=(section.get_text(' ',strip=True) if section else name) + ' · ' + period.split(' ')[0] + (' ' + period.split(' ')[1] if '주차' in period else '')
    top=[c['name'] for c in candidates if c['rank']==1 and c['votes']>0]
    return {'id':'fannstar-'+hashlib.sha256((url+start.isoformat()+end.isoformat()).encode()).hexdigest()[:16],
            'app':'fannstar','title':title,'start':start.isoformat(),'end':end.isoformat(),'date_precision':'day','year_inferred':True,
            'leader':', '.join(top) or None,'winner':None,'candidates':candidates,'lineup_complete':False,'reward':None,'reward_lines':[],'reward_entries':[],
            'source':'공식 웹페이지','source_url':url,'collected_at':STAMP,
            'verification':'공식 페이지 표시 후보 확인 · 연도 추정 · 전체 후보 여부 미확인',
            'evidence':period+'\n'+'\n'.join(f"{c['rank']} {c['name']} {c['votes']:,}표" for c in candidates)}

def collect_fannstar(previous):
    home=BeautifulSoup(get('https://fannstar.tf.co.kr/'),'html.parser')
    links={a['href']:a.get_text(' ',strip=True) for a in home.select('a[href^="/rank/view/"]')}
    events,errors=[],[]
    for path,name in links.items():
        url='https://fannstar.tf.co.kr'+path
        try:events.append(fanstar_event(get(url),url,name))
        except Exception as exc:errors.append(f'{path}: {type(exc).__name__}: {exc}')
    if not events:raise ValueError('No verified ranking pages')
    return events,errors,f'현재 투표 {len(events)}개 부문 · 페이지 표시 후보·득표 확인 (전체 후보·과거 최종 결과 미확인)'

def main():
    path=ROOT/'dist/data/events.json'
    old=json.loads(path.read_text()) if path.exists() else {'events':[],'sources':[]}
    previous={e['id']:e for e in old['events']}
    apps=json.loads((ROOT/'config/apps.json').read_text())
    prior_sources={s['id']:s for s in old.get('sources',[])}
    sources=[];successes=0
    for app in apps:
        source={**app,'verified':False,'state':'blocked','count':0,'method':'미연결','message':'앱 설치 파일 미확보 · 자동 수집 경로 검증 전'}
        collector={'muniverse':collect_muniverse,'fannstar':collect_fannstar}.get(app['id'])
        if collector:
            source.update(method='공식 공개 웹 데이터',attempted_at=STAMP)
            try:
                events,errors,message=collector(previous)
                for event in events:previous[event['id']]=event
                source.update(verified=True,state='partial' if errors or app['id']=='fannstar' else 'ok',count=len(events),last_success=STAMP,message=message,errors=errors)
                successes+=1
            except Exception as exc:
                source.update(state='error',message=f'수집 실패 · 이전 데이터 유지: {type(exc).__name__}: {exc}',last_success=prior_sources.get(app['id'],{}).get('last_success'))
        elif app['id'] == 'idolchamp' and prior_sources.get('idolchamp', {}).get('verified'):
            # The Android collector is a separate verified source; do not reset
            # it to "blocked" when the daily website-only collector runs.
            phone = prior_sources['idolchamp']
            for key in ('verified', 'state', 'count', 'method', 'last_success', 'message'):
                if key in phone:
                    source[key] = phone[key]
        sources.append(source)
        print(app['name'],source['state'],source['count'],flush=True)
    policies, policy_checks = collect_official_rules(get, old.get('reward_policies', []), STAMP)
    for source in sources:
        status = policy_checks.get(source['id'])
        if status:
            source['official_reward_rule_status'] = status
            if status['state'] == 'verified_rules' and source['state'] == 'blocked':
                # Verified official RULES are not an app-vote-list connection.
                source.update(state='partial', verified=False,
                              method='공식 웹 공지 (투표 목록 미연결)',
                              message=f"공식 공개 리워드 규칙 {status['count']}개 확인; 개별 투표·후보 수집 미검증")
            if status['state'] == 'blocked':
                source['message'] += ' · 공식 웹 규칙 조회 실패 (상세 상태 참조)'
    social_posts, social_checks = collect_official_sns(get, old.get('official_posts', []), STAMP)
    for source in sources:
        if source['id'] in social_checks:
            source['official_sns_status'] = social_checks[source['id']]
    cost_rules,cost_checks=collect_app_cost_rules(get,old.get('vote_cost_rules',[]),STAMP)
    for event in previous.values():
        # A verified explicit vote-page cost outranks program-level information.
        if not event.get('vote_cost'):
            found=match_event_rule(event,cost_rules)
            if found:event['vote_cost']=found
    for source in sources:
        matching=[c for c in cost_checks.values() if c['app']==source['id']]
        if matching:
            source['cost_rules_verified']=sum(x['state']=='verified' for x in matching)
            source['cost_rules_blocked']=sum(x['state']=='blocked' for x in matching)
    output={'events':sorted(previous.values(),key=lambda e:(e['end'],e['id']),reverse=True),
            'sources':sources,'reward_policies':policies,'policy_source_status':policy_checks,
            'official_posts':social_posts,'official_sns_status':social_checks,
            'vote_cost_rules':cost_rules,'vote_cost_source_status':cost_checks,
            'updated_at':STAMP}
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(output,ensure_ascii=False,indent=2));temp.replace(path)
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as stream:
            stream.write('# 공식 공개 데이터 수집\n\n'+ '\n'.join(f"- {s['name']}: {s['state']} / {s['count']}건 — {s['message']}" for s in sources))
    if not successes:raise SystemExit('All connected collectors failed; prior records retained')

if __name__=='__main__':main()
