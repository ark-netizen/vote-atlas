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


function visibleSeries(){
 const f=readFilters();
 const matching=dataset.events.filter(e=>
  (f.app==='all'||e.app===f.app)&&
  (f.status==='all'||voteStatus(e)===f.status)
 );
 const policies=f.status==='all'&&f.known!=='missing'?
   (dataset.reward_policies||[]).filter(p=>f.app==='all'||p.app===f.app):[];
 const all=VoteAtlasSeries.build(matching,policies,VoteAtlasRewardGroups);
 let filtered=all.filter(s=>{
  if(f.known==='known'&&!s.benefits.length)return false;
  if(f.known==='missing'&&s.benefits.length)return false;
  if(f.type!=='all'&&!s.benefits.some(b=>b.kind===f.type))return false;
  if(f.q&&![s.app,s.title,...s.rounds.map(e=>e.title),...s.benefits.flatMap(b=>[b.title,b.text,b.place,b.condition,b.period_rule])]
    .join(' ').toLocaleLowerCase().includes(f.q))return false;
  return true;
 });
 if(f.sort==='recent')filtered.sort((a,b)=>String(b.lastChecked||'').localeCompare(String(a.lastChecked||'')));
 else if(f.sort==='app')filtered.sort((a,b)=>appOf(a.app).name.localeCompare(appOf(b.app).name,'ko')||a.title.localeCompare(b.title,'ko'));
 else filtered.sort((a,b)=>{
  const deadline=s=>s.rounds.filter(e=>voteStatus(e)!=='ended').map(e=>e.end||'').sort()[0]||'9999-99-99';
  return deadline(a).localeCompare(deadline(b))||b.rounds.length-a.rounds.length;
 });
 return filtered;
}
function formatMetric(value,suffix=''){
 return value===null||value===undefined?'미확인':Number(value).toLocaleString('ko-KR')+suffix;
}
function durationLabel(b){
 // A named shooting day is NOT evidence of a 1-day or 7-day ad run.
 const explicit=(b.period_rule||'').match(/(\d+)\s*일간/);
 if(explicit)return explicit[1]+'일간 (공식 안내)';
 if(/촬영일/.test(b.period_rule||''))return '송출 일수 미확인 · 촬영일만 명시';
 return b.period_rule||'송출·제공 일수 미확인';
}
function renderSummary(){
 const rows=VoteAtlasSeries.build(dataset.events,dataset.reward_policies||[],VoteAtlasRewardGroups);
 $('#countKnown').textContent=rows.filter(s=>s.benefits.length).length.toLocaleString('ko-KR');
 $('#countUnknown').textContent=rows.filter(s=>!s.benefits.length).length.toLocaleString('ko-KR');
 $('#countActive').textContent=rows.filter(s=>s.rounds.some(e=>voteStatus(e)==='active')).length.toLocaleString('ko-KR');
 $('#countSoon').textContent=rows.filter(s=>s.rounds.some(e=>{
  const days=daysUntilEnd(e);return days>=0&&days<=7;
 })).length.toLocaleString('ko-KR');
}
function renderRows(){
 const rows=visibleSeries(),body=$('#rewardRows');
 body.replaceChildren();
 $('#resultsCount').textContent=rows.length+'개 투표 시리즈';
 if(!rows.length){
  const tr=element('tr','');const td=element('td','reward-empty','조건에 맞는 투표 시리즈가 없습니다.');
  td.colSpan=7;tr.append(td);body.append(tr);$('#limitNotice').hidden=true;return;
 }
 for(const series of rows.slice(0,250)){
  const tr=element('tr','reward-record');tr.tabIndex=0;
  tr.onclick=()=>openSeries(series);
  tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSeries(series)}};
  const name=element('td','');
  const app=element('span','app-name',appOf(series.app).name);
  app.style.color=appOf(series.app).color||'#507b5e';
  name.append(app,element('br'),element('strong','reward-type-title',series.title+(series.rewardVariantLabel?' · '+series.rewardVariantLabel:'')));
  name.append(element('div','reward-occurrences',series.rounds.length+'개 회차 / 혜택 '+series.benefits.length+'종'));
  if(series.stageMetrics?.length>1){
    name.append(element('small','series-small',series.stageMetrics.map(s=>s.name+' '+s.rounds+'회').join(' · ')));
  }
  tr.append(name);
  const count=element('td','');
  count.append(element('strong','',series.rounds.length+'개 회차'));
  count.append(element('div','reward-occurrences',series.metrics.knownVoteRounds+'개 회차 전체 후보 득표 확인'));
  tr.append(count);
  const benefit=element('td','');
  if(series.benefits.length){
   for(const b of series.benefits){
    const div=element('div','series-benefit');
    div.append(element('strong','',b.title));
    div.append(element('small','',b.condition||'제공 조건 미확인'));
    benefit.append(div);
   }
  }else appendUnknown(benefit,UNKNOWN);
  tr.append(benefit);
  const duration=element('td','');
  for(const b of series.benefits){
   const row=element('div','series-duration');
   row.append(element('strong','',b.title));
   row.append(element('span','',durationLabel(b)));
   duration.append(row);
  }
  if(!series.benefits.length)appendUnknown(duration,UNKNOWN);
  tr.append(duration);
  const place=element('td','');
  for(const b of series.benefits){
   const box=element('div','series-place');
   box.append(element('strong','',b.place||'장소 미확인'));
   box.append(element('small','',b.condition||'조건 미확인'));
   place.append(box);
  }
  if(!series.benefits.length)appendUnknown(place,UNKNOWN);
  tr.append(place);
  const metrics=element('td','');
  metrics.append(element('strong','series-votes','평균 '+formatMetric(series.metrics.meanVotes,'표')));
  metrics.append(element('strong','series-median','중앙값 '+formatMetric(series.metrics.medianVotes,'표')));
  metrics.append(element('small','series-small','회차별 전체 후보 수집 득표 기준'));
  if(series.stageMetrics?.length>1){
    for(const stage of series.stageMetrics){
      metrics.append(element('small','series-small',stage.name+' '+stage.rounds+'회 평균 '+formatMetric(stage.metrics.meanVotes,'표')+' · 중앙값 '+formatMetric(stage.metrics.medianVotes,'표')));
    }
  }
  if(series.metrics.partialVoteRounds){
   metrics.append(element('small','series-small','부분 후보 공개 '+series.metrics.partialVoteRounds+'회차 · 평균·중앙값 제외'));
  }
  metrics.append(element('small','series-small','실제 참여자: '+(series.metrics.meanParticipants===null?'집계 불가':'평균 '+formatMetric(series.metrics.meanParticipants,'명')+' · 중앙값 '+formatMetric(series.metrics.medianParticipants,'명'))));
  tr.append(metrics);
  const end=element('td','');
  end.append(element('strong','','회차·원문 열기 ↗'));
  end.append(element('small','series-small',dateTimeText(series.lastChecked,'')));
  tr.append(end);body.append(tr);
 }
 $('#limitNotice').hidden=rows.length<=250;
 if(rows.length>250)$('#limitNotice').textContent='상위 250개 시리즈를 표시합니다.';
}
function openSeries(series){
 const root=$('#detailContent');root.replaceChildren();
 root.append(element('span','tag',appOf(series.app).name));
 const heading=element('h2','',series.title+(series.rewardVariantLabel?' · '+series.rewardVariantLabel:''));heading.id='detailTitle';root.append(heading);
 const dl=element('dl','detail-grid');
 for(const [label,value] of [
  ['투표 시리즈',series.title],['확인된 회차',series.rounds.length+'회'],
  ['평균 득표 (수집 시점)',formatMetric(series.metrics.meanVotes,'표')],
  ['중앙값 득표 (수집 시점)',formatMetric(series.metrics.medianVotes,'표')],
  ['득표 평균·중앙값 산출 회차',series.metrics.knownVoteRounds+'회 / 전체 후보 득표 확인된 회차만'],
  ['부분 후보 회차',series.metrics.partialVoteRounds+'회 · 평균·중앙값 계산에서 제외'],
  ['평균 실제 참여자 수',series.metrics.meanParticipants===null?'미확인 · 득표 수와 중복 참여자는 구분 불가':formatMetric(series.metrics.meanParticipants,'명')],
  ['중앙값 실제 참여자 수',series.metrics.medianParticipants===null?'미확인 · 득표 수와 중복 참여자는 구분 불가':formatMetric(series.metrics.medianParticipants,'명')],
  ...(series.stageMetrics?.length>1?series.stageMetrics.flatMap(s=>[
   [s.name+' 평균 득표',formatMetric(s.metrics.meanVotes,'표')+' · '+s.rounds+'회차 (유효 득표 '+s.metrics.knownVoteRounds+'회차)'],
   [s.name+' 중앙값 득표',formatMetric(s.metrics.medianVotes,'표')+' · '+s.rounds+'회차 (유효 득표 '+s.metrics.knownVoteRounds+'회차)']
  ]):[])
 ])addDetailRow(dl,label,value);
 root.append(dl);
 root.append(element('p','detail-caution',series.metrics.scope));
 root.append(element('h3','','이 투표의 리워드 · '+series.benefits.length+'종'));
 if(!series.benefits.length)root.append(element('p','unknown','공식 원문에서 확인된 리워드가 없습니다.'));
 for(const b of series.benefits){
  const box=element('section','series-reward-detail');
  box.append(element('h3','',b.title));
  const sub=element('dl','detail-grid');
  for(const [label,value] of [
   ['공식 설명',b.text],['제공 조건',b.condition||UNKNOWN],
   ['장소',b.place||UNKNOWN],['광고·제공 일수',durationLabel(b)],
   ['제공 기간 원문',b.period_text||b.period_rule||UNKNOWN],
   ['확정된 실제 송출일',b.execution.length?b.execution.map(x=>(x.start||'시작 미확인')+' ~ '+(x.end||'종료 미확인')).join(' / '):'미확인']
  ])addDetailRow(sub,label,value);
  box.append(sub);
  if(b.examples.length){
   const example=element('details','');example.append(element('summary','','적용 확인 회차 '+b.examples.length+'개'));
   for(const e of b.examples){
    const row=element('div','reward-history-item');row.append(element('strong','',e.title));
    row.append(element('p','',e.period));
    if(safeLink(e.source_url)){const link=element('a','source-anchor','원문 확인 ↗');link.href=safeLink(e.source_url);link.target='_blank';link.rel='noopener noreferrer';row.append(link)}
    example.append(row);
   }
   box.append(example);
  }
  for(const src of b.sources.slice(0,2)){
   if(safeLink(src.url)){const link=element('a','source-anchor','공식 근거 ↗');link.href=safeLink(src.url);link.target='_blank';link.rel='noopener noreferrer';box.append(link)}
  }
  root.append(box);
 }
 const history=element('details','');history.open=true;
 history.append(element('summary','','투표 회차별 득표·일정 · '+series.rounds.length+'회'));
 if(!series.rounds.length)history.append(element('p','unknown','공식 안내에서 규칙만 확인되었으며 개별 투표 데이터는 아직 없습니다.'));
 for(const e of series.rounds){
  const m=VoteAtlasSeries.votesSnapshot(e);
  const row=element('div','reward-history-item');
  row.append(element('strong','',e.title),
   element('p','', '투표 기간: '+(e.start||UNKNOWN)+' ~ '+(e.end||UNKNOWN)),
   element('p','', '수집 시점 득표 합계: '+formatMetric(m.votes,'표')+(m.complete?' (전체 후보 확인)':m.partial?' (일부 후보만 확인 · 실제 총계 아님)':' (집계 불가)')),
   element('p','', '수집 시각: '+dateTimeText(e.collected_at,'')));
  if(safeLink(e.source_url)){const link=element('a','source-anchor','투표 원문 ↗');link.href=safeLink(e.source_url);link.target='_blank';link.rel='noopener noreferrer';row.append(link)}
  history.append(row);
 }
 root.append(history);
 root.append(element('p','detail-caution','쇼! 음악중심 촬영일은 제공 시점의 조건일 뿐 1일간 송출한다는 의미가 아닙니다. 광고 기간이 1일·7일 등으로 확인되지 않으면 미확인으로 표시합니다.'));
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
