'use strict';
// GitHub Pages reads the same published JSON as the existing calendar and dashboard.
// All values shown as facts come from event records; no missing ad details are inferred.
const $ = (selector) => document.querySelector(selector);
const element = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined && value !== null) node.textContent = String(value);
  return node;
};
const UNKNOWN = '미확인';
const TYPE_NAMES = {
  advertising: '광고·홍보', trophy: '트로피·상패',
  goods: '굿즈·실물', experience: '초대·참여', other: '기타'
};
const STATUS_NAMES = {
  active: '진행 중', upcoming: '시작 예정', ended: '마감', unknown: '기간 미확인'
};
const PLACEHOLDER = /^(?:미확인|없음|unknown|n\/a|확인\s*필요|내용\s*없음|-\s*)$/i;
let dataset = {events: [], sources: []};

function textValue(value) {
  if (Array.isArray(value)) return value.map(v => String(v == null ? '' : v).trim()).filter(Boolean).join(' / ');
  return value == null ? '' : String(value).trim();
}
function knownText(value) {
  const valueText = textValue(value);
  return valueText && !PLACEHOLDER.test(valueText) ? valueText : '';
}
function meaningfulRewardLines(value) {
  return textValue(value).split(/\s*\/\s*|\n/g).map(s => s.trim()).filter(s =>
    s && !PLACEHOLDER.test(s) &&
    !/^(?:1\s*위\s*)?(?:리워드|혜택|특전|reward)\s*(?:안내|정보|상세)?\s*[:：]?$/i.test(s)
  );
}
function rewardText(event) {
  const lines = meaningfulRewardLines(event.reward_lines);
  if (lines.length) return lines.join(' / ');
  return meaningfulRewardLines(event.reward).join(' / ');
}
function rewardTypes(reward) {
  if (!reward) return [];
  const result = [];
  if (/광고|전광판|옥외|전철|지하철|버스\s*광고|TV\s*(?:CF|스팟)|유튜브\s*광고|배너|홍보\s*영상/i.test(reward)) result.push('advertising');
  if (/트로피|상패|메달|기념패/i.test(reward)) result.push('trophy');
  if (/굿즈|앨범|포토카드|폴라로이드|사인\s*(?:CD|앨범)|싸인\s*(?:CD|앨범)|기념품/i.test(reward)) result.push('goods');
  if (/방청권|초대권|팬미팅|티켓|공연\s*초대|시상식\s*초대|이벤트\s*참여/i.test(reward)) result.push('experience');
  return result.length ? result : ['other'];
}
function appOf(id) {
  return dataset.sources.find(s => s.id === id) || {id: id, name: id || UNKNOWN, color: '#708675'};
}
function safeLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch (_error) {
    return '';
  }
}
function seoulDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function dateKey(value) {
  const match = String(value || '').match(/^(20\d{2})-(\d{2})-(\d{2})/);
  return match ? match[0] : '';
}
function dateTimeText(value, fallbackDate) {
  const candidate = knownText(value);
  if (candidate && /T\d{2}:\d{2}/.test(candidate)) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) + ' KST';
    }
  }
  const day = dateKey(candidate || fallbackDate);
  return day ? day + ' (시각 미확인)' : UNKNOWN;
}
function checkedAt(event) {
  return dateTimeText(event.reward_checked_at || event.last_checked_at || event.collected_at, '');
}
function voteStatus(event) {
  const start = dateKey(event.start_at || event.start);
  const end = dateKey(event.end_at || event.end);
  if (!start || !end) return 'unknown';
  const now = new Date();
  if (event.end_at && /T\d{2}:\d{2}/.test(event.end_at)) {
    const endExact = new Date(event.end_at);
    if (!Number.isNaN(endExact.getTime()) && now > endExact) return 'ended';
  } else if (end < seoulDay()) {
    return 'ended';
  }
  if (event.start_at && /T\d{2}:\d{2}/.test(event.start_at)) {
    const startExact = new Date(event.start_at);
    if (!Number.isNaN(startExact.getTime()) && now < startExact) return 'upcoming';
  } else if (start > seoulDay()) {
    return 'upcoming';
  }
  return 'active';
}
function condition(event) {
  const explicit = knownText(event.reward_conditions || event.reward_condition ||
    event.provision_condition || event.provision_conditions);
  if (explicit) return explicit;
  // The literal "1위" is extracted only when actually present in the official reward text.
  return /(?:^|[^\d])1\s*위(?:[^\d]|$)/.test(rewardText(event)) ? '1위 (리워드 설명에 명시)' : UNKNOWN;
}
function adPlace(event) {
  return knownText(event.ad_location || event.ad_place ||
    event.advertisement_location || event.advertising_location) || UNKNOWN;
}
function adDates(event) {
  const explicit = knownText(event.ad_period || event.advertisement_period ||
    event.advertising_period || event.ad_execution_period);
  if (explicit) return explicit;
  if (event.ad_start_at || event.ad_end_at || event.ad_start || event.ad_end) {
    return dateTimeText(event.ad_start_at, event.ad_start) + ' ~ ' +
      dateTimeText(event.ad_end_at, event.ad_end);
  }
  return UNKNOWN;
}
function voteDates(event) {
  return dateTimeText(event.start_at, event.start) + ' ~ ' +
    dateTimeText(event.end_at, event.end);
}
function daysUntilEnd(event) {
  const end = dateKey(event.end);
  if (!end) return Infinity;
  const a = Date.parse(end + 'T00:00:00Z');
  const b = Date.parse(seoulDay() + 'T00:00:00Z');
  return (a - b) / 86400000;
}
function readFilters() {
  return {
    q: $('#query').value.trim().toLocaleLowerCase(),
    app: $('#app').value,
    type: $('#type').value,
    status: $('#status').value,
    known: $('#known').value,
    sort: $('#sort').value
  };
}
function filtered() {
  const f = readFilters();
  const list = dataset.events.filter(event => {
    const reward = rewardText(event), isKnown = Boolean(reward);
    if (f.app !== 'all' && event.app !== f.app) return false;
    if (f.known === 'known' && !isKnown) return false;
    if (f.known === 'missing' && isKnown) return false;
    if (f.type !== 'all' && !rewardTypes(reward).includes(f.type)) return false;
    if (f.status !== 'all' && voteStatus(event) !== f.status) return false;
    if (f.q) {
      const words = [appOf(event.app).name, event.title, reward, condition(event),
        adPlace(event), adDates(event), event.leader, event.winner,
        ...(Array.isArray(event.candidates) ? event.candidates.map(c => c.name) : [])];
      if (!words.join(' ').toLocaleLowerCase().includes(f.q)) return false;
    }
    return true;
  });
  list.sort((a, b) => {
    if (f.sort === 'recent') {
      const time = e => Date.parse(e.reward_checked_at || e.last_checked_at || e.collected_at || '') || 0;
      return time(b) - time(a) || String(a.title).localeCompare(String(b.title), 'ko');
    }
    if (f.sort === 'app') {
      return appOf(a.app).name.localeCompare(appOf(b.app).name, 'ko') ||
        String(a.title).localeCompare(String(b.title), 'ko');
    }
    // Unexpired votes first, earliest deadline first; completed and undated follow.
    const stateWeight = {active: 0, upcoming: 0, ended: 1, unknown: 2};
    const diff = stateWeight[voteStatus(a)] - stateWeight[voteStatus(b)];
    if (diff) return diff;
    const da = dateKey(a.end_at || a.end) || '9999-99-99';
    const db = dateKey(b.end_at || b.end) || '9999-99-99';
    if (voteStatus(a) === 'ended') return db.localeCompare(da);
    return da.localeCompare(db) || String(a.title).localeCompare(String(b.title), 'ko');
  });
  return list;
}
function appendUnknown(parent, value, className) {
  parent.append(element('span', value === UNKNOWN ? 'unknown' : (className || ''), value));
}
function labeledCell(label, content) {
  const td = element('td', '');
  td.setAttribute('data-label', label);
  if (typeof content === 'string') appendUnknown(td, content);
  else td.append(content);
  return td;
}


function allSeries() {
  return VoteAtlasSeries.build(dataset.events,dataset.reward_policies||[],VoteAtlasRewardGroups);
}
function filteredSeries(){
  const f=readFilters();
  const list=allSeries().filter(s=>{
    if(f.app!=='all'&&s.app!==f.app)return false;
    if(f.known==='known'&&!s.rewards.length)return false;
    if(f.known==='missing'&&s.rewards.length)return false;
    if(f.type!=='all'&&!s.rewards.some(r=>r.kind===f.type))return false;
    if(f.status!=='all'&&!s.events.some(e=>voteStatus(e)===f.status))return false;
    if(f.q){
      const pool=[s.title,appOf(s.app).name,
        ...s.events.map(e=>e.title),
        ...s.rewards.flatMap(r=>[r.text,r.place,r.condition,r.period_rule,r.period_text,
          ...r.periodRules,...r.periodTexts]),
        ...s.events.flatMap(e=>(e.candidates||[]).map(c=>c.name))];
      if(!pool.join(' ').toLocaleLowerCase().includes(f.q))return false;
    }
    return true;
  });
  const last=s=>Date.parse(s.latestObservedAt||'')||0;
  const soon=s=>s.events.filter(e=>voteStatus(e)!=='ended').map(e=>e.end).sort()[0]||'9999-99-99';
  list.sort((a,b)=>
    f.sort==='recent'?last(b)-last(a):
    f.sort==='app'?appOf(a.app).name.localeCompare(appOf(b.app).name,'ko')||a.title.localeCompare(b.title,'ko'):
    soon(a).localeCompare(soon(b))||a.app.localeCompare(b.app)||a.title.localeCompare(b.title,'ko')
  );
  return list;
}
function nFormat(value){return value===null||value===undefined?UNKNOWN:Number(value).toLocaleString('ko-KR')}
function rewardDuration(reward) {
  const d=reward.durationKey||VoteAtlasSeries.durationKey(reward.period_rule||reward.period_text);
  if(d==='방송 촬영일 · 송출 일수 미확인')return '촬영일 송출 · 정확한 일수 미확인';
  if(d==='미확인')return reward.period_text||'제공 기간 미확인';
  return d;
}
function renderSummary(){
  const series=allSeries();
  $('#countKnown').textContent=series.filter(s=>s.rewards.length).length.toLocaleString('ko-KR');
  $('#countUnknown').textContent=series.filter(s=>!s.rewards.length).length.toLocaleString('ko-KR');
  $('#countActive').textContent=series.filter(s=>s.events.some(e=>voteStatus(e)==='active')).length.toLocaleString('ko-KR');
  $('#countSoon').textContent=series.filter(s=>s.events.some(e=>{
    const delta=daysUntilEnd(e);return delta>=0&&delta<=7;
  })).length.toLocaleString('ko-KR');
}
function renderRows(){
  const series=filteredSeries();
  $('#resultsCount').textContent=series.length.toLocaleString('ko-KR')+'개 투표 시리즈';
  const body=$('#rewardRows');body.replaceChildren();
  if(!series.length){
    const tr=element('tr','');const td=element('td','reward-empty','조건에 맞는 투표 시리즈가 없습니다.');
    td.colSpan=7;tr.append(td);body.append(tr);$('#limitNotice').hidden=true;return;
  }
  for(const s of series.slice(0,300)){
    const tr=element('tr','reward-record series-record');tr.tabIndex=0;
    tr.onclick=()=>openSeries(s);
    tr.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();openSeries(s)}};
    const first=element('td','');
    const app=element('span','app-name',appOf(s.app).name);
    app.style.color=appOf(s.app).color||'#507b5e';
    first.append(app,element('br'),element('strong','reward-type-title',s.title));
    first.append(element('div','reward-occurrences',s.events.length+'개 회차 · '+(s.policies.length?'공식 규칙 '+s.policies.length+'건':'투표별 공식 설명 기준')));
    tr.append(first);
    const scale=element('td','');
    const scaleItems=element('div','date-pair');
    scaleItems.append(element('span','','회차 '+s.scale.rounds+'개'));
    scaleItems.append(element('span','','평균 후보 '+(s.scale.candidateAverage===null?'미확인':nFormat(s.scale.candidateAverage)+'명/팀')));
    scale.append(scaleItems);tr.append(scale);
    const votes=element('td','');
    if(s.scale.observedVoteAverage!==null){
      votes.append(element('strong','series-vote-average',nFormat(s.scale.observedVoteAverage)+'표'));
      votes.append(element('div','reward-occurrences','후보 득표 합계 · '+s.scale.observedVoteSamples+'개 회차 관측'));
    }else votes.append(element('span','unknown','후보별 득표 자료 없음'));
    tr.append(votes);
    const participants=element('td','');
    if(s.scale.uniqueParticipantAverage!==null){
      participants.append(element('strong','',nFormat(s.scale.uniqueParticipantAverage)+'명'));
      participants.append(element('div','reward-occurrences',s.scale.participantSamples+'개 회차 기준'));
    }else participants.append(element('span','unknown','미수집 (득표≠참여자)'));
    tr.append(participants);
    const rewards=element('td','series-rewards');
    for(const reward of s.rewards){
      const line=element('div','series-reward-line');
      line.append(element('strong','',reward.text));
      line.append(element('small','','제공 조건: '+(reward.condition||UNKNOWN)+' · '+(reward.place||'장소 미확인')));
      rewards.append(line);
    }
    if(!s.rewards.length)rewards.append(element('span','unknown','리워드 상세 미확인'));
    tr.append(rewards);
    const periods=element('td','');
    for(const reward of s.rewards){
      const block=element('div','series-reward-period');
      block.append(element('strong','',reward.text.replace(/^[1-9]\ufe0f?\u20e3\s*/,'').slice(0,38)));
      block.append(element('span','','제공: '+rewardDuration(reward)));
      const dated=reward.history.filter(h=>h.execution_start_at&&h.execution_end_at);
      block.append(element('small','',dated.length?'실제 집행 날짜 확인 '+dated.length+'회차':'실제 송출 시작·종료일 미확인'));
      periods.append(block);
    }
    if(!s.rewards.length)periods.append(element('span','unknown','제공 기간 미확인'));
    tr.append(periods);
    const last=element('td','');
    last.append(element('div','date-pair',s.events.length+'개 회차'));
    last.append(element('div','reward-occurrences',dateTimeText(s.latestObservedAt,'')));
    last.append(element('strong','series-open','리워드·투표 이력 펼치기 ↗'));
    tr.append(last);body.append(tr);
  }
  $('#limitNotice').hidden=series.length<=300;
  if(series.length>300)$('#limitNotice').textContent='상위 300개 시리즈만 표시합니다. 검색으로 좁혀주세요.';
}
function addEvidenceLink(parent,url,label){
  const link=safeLink(url);
  if(!link)return;
  const a=element('a','source-anchor',label);a.href=link;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
}
function openSeries(series) {
  const root=$('#detailContent');root.replaceChildren();
  const label=element('span','tag',appOf(series.app).name);root.append(label);
  const heading=element('h2','',series.title);heading.id='detailTitle';root.append(heading);
  const info=element('dl','detail-grid');
  [
    ['통합 투표 회차',series.events.length+'건'],
    ['회차당 평균 관측 득표 합계',series.scale.observedVoteAverage===null?'미수집':nFormat(series.scale.observedVoteAverage)+'표 ('+series.scale.observedVoteSamples+'개 회차)'],
    ['관측 득표 범위',series.scale.observedVoteMin===null?'미수집':nFormat(series.scale.observedVoteMin)+' ~ '+nFormat(series.scale.observedVoteMax)+'표'],
    ['회차당 평균 후보 수',series.scale.candidateAverage===null?'미수집':nFormat(series.scale.candidateAverage)+'명/팀'],
    ['실제 참여자 평균',series.scale.uniqueParticipantAverage===null?'미수집 · 득표와 구분':nFormat(series.scale.uniqueParticipantAverage)+'명 ('+series.scale.participantSamples+'개 회차)'],
    ['최종 수집 시각',dateTimeText(series.latestObservedAt,'')]
  ].forEach(([k,v])=>addDetailRow(info,k,v));
  root.append(info);
  root.append(element('p','detail-caution','득표 평균은 후보 전체 명단과 득표가 모두 공개된 회차의 최근 수집 시점 합계입니다. 최종 확정 총득표 또는 고유 참여자 수를 의미하지 않습니다.'));
  root.append(element('h3','series-section-heading','이 투표가 제공하는 리워드 · '+series.rewards.length+'종'));
  if(!series.rewards.length)root.append(element('p','unknown','공식 출처에서 구체적인 제공 혜택을 확인하지 못했습니다.'));
  for(const reward of series.rewards){
    const card=element('section','series-detail-reward');
    card.append(element('strong','',reward.text));
    const dl=element('dl','detail-grid');
    [
      ['종류',TYPE_NAMES[reward.kind]||'기타'],
      ['제공 조건',reward.condition||UNKNOWN],
      ['제공 장소',reward.place||UNKNOWN],
      ['제공 기간 규칙',rewardDuration(reward)],
      ['원문 기간 표현',reward.periodTexts.length?reward.periodTexts.join(' / '):reward.periodRules.join(' / ')||UNKNOWN],
      ['실제 집행일',reward.history.some(h=>h.execution_start_at&&h.execution_end_at)?'회차별 아래 확인':'미확인 · 1일/여러 날 단정 불가']
    ].forEach(([key,value])=>addDetailRow(dl,key,value));card.append(dl);
    const detail=element('details','');detail.append(element('summary','','리워드 적용 회차 및 기간 변경 이력 · '+reward.history.length+'개'));
    for(const history of reward.history){
      const wrapper=element('div','reward-history-item');
      wrapper.append(element('strong','',history.title));
      wrapper.append(element('p','','투표: '+history.start+' ~ '+history.end));
      wrapper.append(element('p','','리워드 기간: '+(history.period_text||rewardDuration(reward))));
      wrapper.append(element('p','','실제 집행: '+(history.execution_start_at||'미확인')+' ~ '+(history.execution_end_at||'미확인')));
      addEvidenceLink(wrapper,history.source_url,'회차 공식 원문 ↗');
      detail.append(wrapper);
    }
    if(!reward.history.length)detail.append(element('p','unknown','공식 리워드 안내만 확인된 상태이며 개별 투표 수집은 미연결입니다.'));
    card.append(detail);
    for(const policy of reward.policies||[])addEvidenceLink(card,policy.source_url,'공식 운영 규칙 ↗');
    root.append(card);
  }
  const rounds=element('details','series-rounds');
  rounds.append(element('summary','','전체 투표 회차 및 규모 · '+series.events.length+'개'));
  for(const e of series.events){
    const row=element('div','reward-history-item');
    row.append(element('strong','',e.title));
    const m=VoteAtlasSeries.eventScale(e);
    row.append(element('p','','투표: '+e.start+' ~ '+e.end+' · 후보 '+(m.candidates??'미확인')+'명/팀'));
    row.append(element('p','','수집 당시 득표 합계: '+(m.votes===null?'미확인':nFormat(m.votes)+'표')+' · 실제 참여자 '+(m.participants===null?'미확인':nFormat(m.participants)+'명')));
    row.append(element('p','','마지막 수집: '+dateTimeText(m.observedAt,'')));
    addEvidenceLink(row,e.source_url,'해당 투표 공식 원문 ↗');rounds.append(row);
  }
  root.append(rounds);
  $('#rewardDetail').showModal();
}
function addDetailRow(dl, name, value) {
  dl.append(element('dt', '', name), element('dd', '', value || UNKNOWN));
}
function openDetail(event) {
  const root = $('#detailContent');
  root.replaceChildren();
  const source = safeLink(event.source_url);
  const app = appOf(event.app);
  const appTag = element('span', 'tag', app.name);
  appTag.style.color = app.color || '#507b5e';
  const title = element('h2', '', event.title || UNKNOWN);
  title.id = 'detailTitle';
  root.append(appTag, title);
  const dl = element('dl', 'detail-grid');
  addDetailRow(dl, '리워드 내용', rewardText(event) || UNKNOWN);
  addDetailRow(dl, '리워드 종류', rewardTypes(rewardText(event)).map(t => TYPE_NAMES[t]).join(' / ') || UNKNOWN);
  addDetailRow(dl, '제공 조건', condition(event));
  addDetailRow(dl, '투표 기간', voteDates(event));
  addDetailRow(dl, '진행 상태', STATUS_NAMES[voteStatus(event)]);
  addDetailRow(dl, '광고 장소', adPlace(event));
  addDetailRow(dl, '광고 집행 기간', adDates(event));
  addDetailRow(dl, '마지막 확인', checkedAt(event));
  addDetailRow(dl, '라인업 검증', event.lineup_complete ? '전체 후보 확인' : '전체 후보 확인되지 않음');
  addDetailRow(dl, '수집 당시 1위', knownText(event.leader) || UNKNOWN);
  addDetailRow(dl, '최종 1위', knownText(event.winner) || UNKNOWN);
  addDetailRow(dl, '확인 상태', knownText(event.verification) || UNKNOWN);
  root.append(dl);
  const candidates = Array.isArray(event.candidates) ? event.candidates : [];
  root.append(element('h3', '', '확인된 후보 ' + candidates.length + '명/팀'));
  if (candidates.length) {
    const table = element('table', '');
    const head = element('thead', '');
    const tr = element('tr', '');
    ['순위', '후보', '득표'].forEach(t => tr.append(element('th', '', t)));
    head.append(tr);table.append(head);
    const body = element('tbody', '');
    candidates.forEach(c => {
      const row = element('tr', '');
      let count = c.votes;
      if (count == null || count === '') count = UNKNOWN;
      else if (Number.isFinite(Number(count))) count = Number(count).toLocaleString('ko-KR');
      row.append(element('td', '', c.rank == null ? UNKNOWN : c.rank),
        element('td', '', c.name || UNKNOWN),
        element('td', '', count));
      body.append(row);
    });
    table.append(body);root.append(table);
  } else root.append(element('p', 'unknown', '공식 화면에서 확인된 후보가 없습니다.'));
  if (knownText(event.evidence)) {
    const evidence = element('details', '');
    evidence.append(element('summary', '', '수집 근거 텍스트'), element('pre', '', event.evidence));
    root.append(evidence);
  }
  if (source) {
    const anchor = element('a', 'detail-link', '공식 출처 열기 ↗');
    anchor.href = source;anchor.target = '_blank';anchor.rel = 'noopener noreferrer';
    root.append(anchor);
  } else root.append(element('p', 'unknown', '공식 출처 URL 미확인'));
  root.append(element('p', 'detail-caution',
    '공식 설명의 수집 시점 기준이며, 리워드 실제 지급·광고 집행 여부는 검증되지 않았습니다.'));
  $('#rewardDetail').showModal();
}
function render() {
  renderSummary();
  renderRows();
}
async function load() {
  try {
    const response = await fetch('data/events.json?t=' + Date.now(), {cache: 'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.events) || !Array.isArray(data.sources)) throw new Error('Invalid JSON schema');
    dataset = data;
    $('#updated').textContent = '최근 데이터 갱신 ' + dateTimeText(data.updated_at, '') + ' KST 기준';
    const select = $('#app');
    const previous = select.value;
    select.replaceChildren();
    const all = element('option', '', '모든 앱');all.value = 'all';select.append(all);
    data.sources.forEach(s => {
      const option = element('option', '', s.name);option.value = s.id;select.append(option);
    });
    if (Array.from(select.options).some(option => option.value === previous)) select.value = previous;
    render();
  } catch (err) {
    $('#updated').textContent = '수집 데이터 연결 실패';
    const body = $('#rewardRows');body.replaceChildren();
    const tr = element('tr', '');
    const td = element('td', 'reward-empty',
      '데이터를 불러오지 못했습니다. GitHub Pages 배포 및 JSON 파일 상태를 확인해 주세요.');
    td.colSpan = 7;tr.append(td);body.append(tr);
  }
}
['query', 'app', 'type', 'status', 'known', 'sort'].forEach(id => {
  $('#' + id).addEventListener(id === 'query' ? 'input' : 'change', renderRows);
});
$('#reload').onclick = load;
$('#closeDetail').onclick = () => $('#rewardDetail').close();
$('#rewardDetail').addEventListener('click', event => {
  if (event.target === $('#rewardDetail')) $('#rewardDetail').close();
});
load();
