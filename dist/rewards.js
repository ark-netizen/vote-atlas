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

function visibleGroups() {
  const f = readFilters();
  const events=filtered();
  const policies=(Array.isArray(dataset.reward_policies)?dataset.reward_policies:[]).filter(p=>{
    if(f.status!=='all'||f.known==='missing')return false; // a generic rule has no verified vote state
    if(f.app!=='all'&&p.app!==f.app)return false;
    if(f.q&&![p.title,p.text,p.condition,p.place,p.period_rule,p.period_text].join(' ').toLocaleLowerCase().includes(f.q))return false;
    return true;
  });
  let groups=VoteAtlasRewardGroups.group(events,policies);
  if(f.known==='missing') {
    const unknownEvents=events.filter(e=>!rewardText(e));
    const byApp=new Map();
    for(const event of unknownEvents){
      if(!byApp.has(event.app))byApp.set(event.app,{
        id:event.app+'|unknown',app:event.app,text:'리워드 미확인 (투표별 확인 필요)',
        kind:'other',condition:UNKNOWN,place:UNKNOWN,period_rule:UNKNOWN,
        history:[],policies:[],source_url:null,checked_at:null
      });
      byApp.get(event.app).history.push({
        event_id:event.id,title:event.title,start:event.start,end:event.end,
        source_url:event.source_url,checked_at:event.collected_at
      });
    }
    groups=[...byApp.values()];
  }
  if(f.type!=='all')groups=groups.filter(g=>g.kind===f.type);
  if(f.q)groups=groups.filter(g=>
    [g.text,g.app,g.condition,g.place,g.period_rule,...g.history.map(h=>h.title)].join(' ').toLocaleLowerCase().includes(f.q));
  const lastTime=g=>Date.parse(g.last_observed_at||g.checked_at||'')||0;
  const nextEnd=g=>g.history.filter(h=>voteStatus({
    start:h.start,end:h.end
  })!=='ended').map(h=>h.end).sort()[0]||'9999-99-99';
  groups.sort((x,y)=>
    f.sort==='recent'?lastTime(y)-lastTime(x):
    f.sort==='app'?appOf(x.app).name.localeCompare(appOf(y.app).name,'ko')||x.text.localeCompare(y.text,'ko'):
    nextEnd(x).localeCompare(nextEnd(y))||x.app.localeCompare(y.app)||x.text.localeCompare(y.text,'ko')
  );
  return groups;
}
function renderSummary() {
  const known=dataset.events.filter(e=>Boolean(rewardText(e)));
  const unique=VoteAtlasRewardGroups.group(dataset.events,dataset.reward_policies||[]);
  $('#countKnown').textContent=unique.length.toLocaleString('ko-KR');
  $('#countUnknown').textContent=(dataset.events.length-known.length).toLocaleString('ko-KR');
  $('#countActive').textContent=unique.filter(g=>g.history.some(h=>voteStatus(h)==='active')).length.toLocaleString('ko-KR');
  $('#countSoon').textContent=unique.filter(g=>g.history.some(h=>{
    const days=daysUntilEnd(h);
    return days>=0&&days<=7;
  })).length.toLocaleString('ko-KR');
}
function renderRows(){
  const groups=visibleGroups();
  $('#resultsCount').textContent=groups.length.toLocaleString('ko-KR')+'개 리워드 유형';
  const body=$('#rewardRows');
  body.replaceChildren();
  if(!groups.length){
    const tr=element('tr','');
    const td=element('td','reward-empty','조건에 맞는 리워드 유형이 없습니다.');
    td.colSpan=7;tr.append(td);body.append(tr);
    $('#limitNotice').hidden=true;
    return;
  }
  for(const g of groups.slice(0,300)){
    const tr=element('tr','reward-record');
    tr.tabIndex=0;
    tr.onclick=()=>openGroup(g);
    tr.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();openGroup(g)}};
    const first=element('td','');
    const app=element('span','app-name',appOf(g.app).name);
    app.style.color=appOf(g.app).color||'#507b5e';
    first.append(app,element('br'),element('strong','reward-type-title',g.text));
    first.append(element('div','reward-occurrences',g.history.length+'개 투표 · 공식 규칙 '+g.policies.length+'개'));
    tr.append(first);
    const benefit=element('td','');
    benefit.append(element('span','',g.text));
    benefit.append(element('div','reward-types',TYPE_NAMES[g.kind]||'기타'));
    tr.append(benefit);
    tr.append(labeledCell('제공 조건',g.condition||UNKNOWN));
    tr.append(labeledCell('제공 기간 규칙',g.period_rule||g.period_text||UNKNOWN));
    const place=element('td','');
    const placeInner=element('div','date-pair');
    placeInner.append(element('span','',g.place||UNKNOWN));
    const knownExecution=g.history.filter(h=>h.execution_start_at||h.execution_end_at);
    placeInner.append(element('span','',knownExecution.length?'실제 집행 일자 기록 '+knownExecution.length+'건 (상세 확인)':'실제 집행일: 미확인'));
    place.append(placeInner);tr.append(place);
    tr.append(labeledCell('마지막 확인',dateTimeText(g.last_observed_at||g.checked_at,'')));
    const srcCell=element('td','');
    if(safeLink(g.source_url)){
      const src=element('a','source-anchor','공식 원문 ↗');
      src.href=safeLink(g.source_url);src.target='_blank';src.rel='noopener noreferrer';
      src.onclick=e=>e.stopPropagation();srcCell.append(src);
    }else appendUnknown(srcCell,UNKNOWN);
    srcCell.append(element('div','reward-occurrences','회차·변경 이력 보기 ↗'));
    tr.append(srcCell);
    body.append(tr);
  }
  $('#limitNotice').hidden=groups.length<=300;
  if(groups.length>300)$('#limitNotice').textContent='상위 300개 유형 표시 · 필터로 범위를 좁혀주세요.';
}
function openGroup(group) {
  const root=$('#detailContent');root.replaceChildren();
  root.append(element('span','tag',appOf(group.app).name));
  const h2=element('h2','',group.text);h2.id='detailTitle';root.append(h2);
  const dl=element('dl','detail-grid');
  for(const [label,text] of [
    ['리워드 유형',TYPE_NAMES[group.kind]||'기타'],
    ['혜택 내용',group.text],
    ['제공 조건',group.condition||UNKNOWN],
    ['광고·제공 장소',group.place||UNKNOWN],
    ['제공 기간 규칙',group.period_rule||UNKNOWN],
    ['기간 원문',group.period_text||UNKNOWN],
    ['최종 확인',dateTimeText(group.last_observed_at||group.checked_at,'')],
    ['연결된 투표',group.history.length+'건'],
    ['공식 규칙 문서',group.policies.length+'건']
  ])addDetailRow(dl,label,text);
  root.append(dl);
  if(group.policies.length){
    const rules=element('details','');rules.open=true;
    rules.append(element('summary','','공식 리워드 규칙 · '+group.policies.length+'건'));
    for(const p of group.policies){
      const item=element('div','reward-history-item');
      item.append(element('strong','',p.title||p.id),
        element('p','',p.period_text||p.period_rule||UNKNOWN));
      const link=safeLink(p.source_url);
      if(link){const a=element('a','source-anchor','공식 규칙 원문 ↗');a.href=link;a.target='_blank';a.rel='noopener noreferrer';item.append(a)}
      rules.append(item);
    }
    root.append(rules);
  }
  const history=element('details','');history.open=true;
  history.append(element('summary','','투표 회차 및 실제 집행 이력 · '+group.history.length+'건'));
  if(!group.history.length)history.append(element('p','unknown','연결된 개별 투표가 없습니다. 공식 안내 규칙만 확인되었습니다.'));
  for(const h of group.history){
    const item=element('div','reward-history-item');
    item.append(element('strong','',h.title||UNKNOWN));
    item.append(element('p','', '투표: '+(h.start||UNKNOWN)+' ~ '+(h.end||UNKNOWN)));
    item.append(element('p','', '제공 기간: '+(h.period_text||group.period_rule||UNKNOWN)));
    item.append(element('p','', '실제 집행: '+(h.execution_start_at||'미확인')+' ~ '+(h.execution_end_at||'미확인')));
    item.append(element('p','', '수집 확인: '+dateTimeText(h.checked_at,'')));
    if(safeLink(h.source_url)){
      const a=element('a','source-anchor','해당 회차 공식 원문 ↗');a.href=safeLink(h.source_url);a.target='_blank';a.rel='noopener noreferrer';item.append(a);
    }
    history.append(item);
  }
  root.append(history);
  const note=element('p','detail-caution','실제 집행 확인은 공식 사후 공지에 명시된 경우에만 인정합니다. 유사한 명칭이더라도 장소·조건·기간이 다르면 별도 유형으로 구분합니다.');
  root.append(note);$('#rewardDetail').showModal();
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
