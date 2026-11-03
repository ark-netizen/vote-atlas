'use strict';
const $ = (s) => document.querySelector(s);
const doc = (tag, cls, text) => {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=String(text);return n};
const kst = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dnow = new Date(kst+'T12:00:00Z');
let calYear=Number(kst.slice(0,4)),calMonth=Number(kst.slice(5,7))-1,chosenDay=null, records={events:[],sources:[]},selected=[];
const state=(e)=>e.end<kst?'ended':e.start>kst?'upcoming':'active';
const stateName={active:'진행 중',upcoming:'시작 예정',ended:'마감'};
const app=(id)=>records.sources.find(s=>s.id===id)||{name:id,color:'#709678'};
const dateText=(s)=>s?s.slice(0,10):'미확인';
const rewardText=(e)=>String(e.reward||'').trim();
const stamp=(s)=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'없음';
const fullStamp=(s)=>{if(!s||!Number.isFinite(Date.parse(s)))return '수집 일시 미확인';return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(s))+' KST'};
const observedAt=e=>e.leader_observed_at||e.collected_at||null;
const soonUntil=()=>{const d=new Date(kst+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10)};
let summary='all';
const link=(url)=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
function showError(msg){$('#votes').replaceChildren(doc('p','empty',msg));$('#updated').textContent='데이터 연결 실패'}
async function load(){
  try{
   const r=await fetch('data/events.json?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw new Error('HTTP '+r.status);
   const data=await r.json();
   if(!Array.isArray(data.events)||!Array.isArray(data.sources))throw new Error('invalid data');
   records=data;
   $('#updated').textContent='최근 갱신 '+stamp(data.updated_at)+' KST';
   for(const s of data.sources){if(!selected.includes(s.id)){selected.push(s.id)}}
   $('#app').replaceChildren(doc('option','', '모든 앱'));
   $('#artistApp').replaceChildren(doc('option','', '모든 앱'));
   $('#artistApp').firstChild.value='all';
   $('#app').firstChild.value='all';
   for(const s of data.sources){for(const selector of ['#app','#artistApp']){const o=doc('option','',s.name);o.value=s.id;$(selector).append(o)}}
   refresh();
  }catch(e){showError('수집 데이터를 불러오지 못했습니다. 저장소 상태를 확인해 주세요.')}
}
function refresh(){
 const ev=records.events;
 $('#countAll').textContent=ev.length.toLocaleString('ko-KR');
 $('#countActive').textContent=ev.filter(e=>state(e)==='active').length.toLocaleString('ko-KR');
 $('#countSoon').textContent=ev.filter(e=>e.end>=kst&&e.end<=soonUntil()).length.toLocaleString('ko-KR');
 $('#countReward').textContent=ev.filter(e=>rewardText(e)).length.toLocaleString('ko-KR');
 $('#countLineup').textContent=ev.filter(e=>(e.candidates||[]).length).length.toLocaleString('ko-KR');
 renderCalendar();renderVotes();renderArtists();renderSources();
}
function filtered(){
 const q=$('#query').value.trim().toLowerCase();
 const aid=$('#app').value,period=$('#period').value,reward=$('#reward').value;
 return records.events.filter(e=>{
  if(summary==='active'&&state(e)!=='active')return false;
  if(summary==='soon'&&!(e.end>=kst&&e.end<=soonUntil()))return false;
  if(summary==='reward'&&!rewardText(e))return false;
  if(summary==='lineup'&&!(e.candidates||[]).length)return false;
  if(aid!=='all'&&e.app!==aid)return false;
  if(period!=='all'&&state(e)!==period)return false;
  if(reward==='known'&&!rewardText(e)||reward==='missing'&&rewardText(e))return false;
  if(chosenDay&&!(e.start<=chosenDay&&e.end>=chosenDay))return false;
  if(q&&!([e.title,e.reward,e.leader,e.winner].concat((e.candidates||[]).map(c=>c.name)).join(' ').toLowerCase().includes(q)))return false;
  return true;
 }).sort((a,b)=>({active:0,upcoming:1,ended:2}[state(a)]-{active:0,upcoming:1,ended:2}[state(b)])||b.end.localeCompare(a.end));
}
function renderVotes(){
 const list=filtered();$('#listCount').textContent=list.length.toLocaleString('ko-KR')+'건 표시';
 $('#summarySelection').hidden=summary==='all';$('#summarySelectionLabel').textContent={active:'현재 진행 중 투표',soon:'7일 내 마감 투표',reward:'리워드 확인된 투표',lineup:'후보가 확보된 투표'}[summary]||'';
 const root=$('#votes');root.replaceChildren();
 if(!list.length){root.append(doc('p','empty','해당 조건에 맞는 투표가 없습니다. 필터를 변경해 주세요.'));return}
 for(const e of list.slice(0,500)){
  const a=app(e.app), card=doc('button','vote');
  card.type='button';card.onclick=()=>openDetail(e);
  const top=doc('div','vote-top');
  const t=doc('span','tag',a.name);t.style.color=a.color;top.append(t,doc('span','state '+state(e),stateName[state(e)]));card.append(top);
  card.append(doc('h3','',e.title),doc('div','dates',dateText(e.start)+' ~ '+dateText(e.end)));
  card.append(doc('h4','','리워드 · 공식 안내'));
  card.append(doc('p','reward-text'+(rewardText(e)?'':' unknown'),rewardText(e).slice(0,240)||'아직 확인되지 않았습니다'));
  card.append(doc('h4','','후보 · '+(e.candidates||[]).length+'명/팀 '+(e.lineup_complete?'(전체 확인)':'(부분 확인)')));
  const chips=doc('div','chips');const c=e.candidates||[];
  for(const x of c.slice(0,5)){chips.append(doc('span','chip'+(x.rank===1?' first':''),(x.rank?x.rank+'위 · ':'')+x.name))}
  if(c.length>5)chips.append(doc('span','chip','+'+(c.length-5)+'명 더보기'));
  if(!c.length)chips.append(doc('span','chip','후보 미확인'));
  card.append(chips);
  const foot=doc('div','vote-foot');
  foot.append(doc('span','',e.winner?'최종 1위 '+e.winner:e.leader?'수집 당시 1위 '+e.leader+' · '+fullStamp(observedAt(e)):'1위 미확인'),doc('b','','상세 보기 ↗'));
  card.append(foot);root.append(card);
 }
 if(list.length>500)root.append(doc('p','empty','한 번에 최대 500건을 표시합니다. 검색어로 범위를 좁혀 주세요.'));
}
function renderCalendar(){
 $('#monthLabel').textContent=calYear+'년 '+(calMonth+1)+'월';
 const monthStart=new Date(Date.UTC(calYear,calMonth,1));
 const start=new Date(monthStart);start.setUTCDate(1-monthStart.getUTCDay());
 const cells=Math.ceil((monthStart.getUTCDay()+new Date(Date.UTC(calYear,calMonth+1,0)).getUTCDate())/7)*7;
 const root=$('#miniCalendar');root.replaceChildren();
 for(let i=0;i<cells;i++){
  const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);
  const k=d.toISOString().slice(0,10);
  const count=records.events.filter(e=>e.start===k||e.end===k).length;
  const cell=doc('button','mini-day'+(d.getUTCMonth()!==calMonth?' other':'')+(k===kst?' current':'')+(k===chosenDay?' selected':''));
  cell.type='button';cell.title=k+' · 시작 또는 마감 투표 '+count+'건';
  cell.append(doc('span','daynum',d.getUTCDate()));
  if(count)cell.append(doc('span','day-count',count+'건'));
  cell.onclick=()=>{chosenDay=(chosenDay===k?null:k);$('#clearDay').hidden=!chosenDay;renderCalendar();renderVotes()};
  root.append(cell);
 }
}

function renderArtists(){
 const appId=$('#artistApp').value || 'all';
 const field=$('#artistSort').value;
 const search=$('#artistQuery').value.trim().toLocaleLowerCase('ko-KR');
 const list=VoteAtlasRankings.sort(VoteAtlasRankings.build(records.events,appId),field)
   .filter(x=>!search||x.name.toLocaleLowerCase('ko-KR').includes(search));
 $('#artistCount').textContent='아티스트 '+list.length.toLocaleString('ko-KR')+'명/팀';
 const root=$('#artistRows');root.replaceChildren();
 if(!list.length){root.append(doc('p','empty','조건에 맞는 후보가 없습니다.'));return}
 for(const [idx,artist] of list.slice(0,120).entries()){
   const row=doc('button','artist-row');row.type='button';
   const name=doc('span','artist-name',(idx+1)+'. '+artist.name);
   name.append(doc('small','',artist.voteCount+'개 투표 · 이름 표기 기준 집계'));
   row.append(name,
     doc('span','artist-value',artist.observedFirsts.toLocaleString('ko-KR')+'회'),
     doc('span','artist-value',artist.finalWins.toLocaleString('ko-KR')+'회'),
     doc('span','artist-value',artist.votesKnown?artist.snapshotVotes.toLocaleString('ko-KR')+'표':'미확인'));
   row.onclick=()=>showArtist(artist);root.append(row);
 }
 if(list.length>120)root.append(doc('p','empty','상위 120개 아티스트만 표시합니다. 검색으로 다른 후보를 찾아보세요.'));
}
function showArtist(artist){
 const root=$('#artistDetail');root.hidden=false;root.replaceChildren();
 const close=doc('button','artist-close','닫기 ×');close.onclick=()=>{root.hidden=true};
 root.append(close,doc('h3','',artist.name+' · 투표별 관측 기록'));
 root.append(doc('p','','관측 1위 '+artist.observedFirsts+'회 · 공식 최종 확정 1위 '+artist.finalWins+'회 · 수집 시점 득표 합계 '+(artist.votesKnown?artist.snapshotVotes.toLocaleString('ko-KR')+'표':'미확인')+' ('+artist.votesKnown+'개 투표에서 공개). 동일한 투표를 시간별로 누적한 값은 아닙니다.'));
 for(const entry of [...artist.entries].sort((a,b)=>String(b.end||'').localeCompare(String(a.end||''))).slice(0,80)){
   const vote=records.events.find(e=>e.id===entry.eventId);if(!vote)continue;
   const row=doc('button','artist-event');row.type='button';
   row.append(doc('span','',app(entry.app).name+' · '+entry.title),
     doc('small','',(entry.rank?entry.rank+'위 · ':'순위 미확인 · ')+(entry.votes===null?'득표 미확인':entry.votes.toLocaleString('ko-KR')+'표')+(entry.observedFirst?' · 1위 관측 '+fullStamp(entry.observedAt):'')+(entry.finalWin?' · 최종 확정':'')));
   row.onclick=()=>openDetail(vote);root.append(row);
 }
 root.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderSources(){
 const root=$('#sourceCards');root.replaceChildren();
 for(const s of records.sources){
  const block=doc('article','source');
  block.append(doc('h3','',s.name));
  const label=s.state==='ok'?'수집 성공':s.state==='partial'?'부분 수집':s.state==='error'?'최근 수집 실패':'미연결';
  block.append(doc('p','status',label+' · '+(s.count||0)+'건'));
  block.append(doc('p','',s.message||'수집 방법 미검증'));
  block.append(doc('small','', '최근 성공 '+stamp(s.last_success)+' KST'));
  root.append(block);
 }
}
function openDetail(e){
 const root=$('#detailContent');root.replaceChildren();
 const a=app(e.app);
 const tag=doc('span','tag',a.name);tag.style.color=a.color;root.append(tag,doc('h2','detail-title',e.title));
 const dl=doc('dl','detail-grid');
 const items=[
 ['투표 기간',dateText(e.start)+' ~ '+dateText(e.end)+(e.end_at?' (마감 '+stamp(e.end_at)+' KST)':'')],
 ['진행 상태',stateName[state(e)]],['리워드 안내',rewardText(e)||'공식 상세에서 문구 미확인'],
 ['후보 범위',e.lineup_complete?'전체 후보 확인':'페이지 표시 후보 / 전체 확인 안 됨'],
 ['수집 당시 1위',e.leader?e.leader+' (확인 '+fullStamp(observedAt(e))+')':'미확인'],['최종 1위',e.winner||'공식 최종 결과 미확인'],
 ['검증 상태',e.verification||'확인 필요'],['수집 시각',stamp(e.collected_at)+' KST']];
 for(const [key,val] of items){dl.append(doc('dt','',key),doc('dd','',val))}
 root.append(dl,doc('h3','','확인된 후보 '+(e.candidates||[]).length+'명/팀'));
 const table=doc('table','');const head=doc('tr','');
 for(const h of ['순위','후보','득표'])head.append(doc('th','',h));
 const thead=doc('thead','');thead.append(head);table.append(thead);
 const tbody=doc('tbody','');
 for(const c of e.candidates||[]){const tr=doc('tr','');tr.append(doc('td','',c.rank??'—'),doc('td','',c.name||'미확인'),doc('td','',c.votes==null?'미공개':Number(c.votes).toLocaleString('ko-KR')));tbody.append(tr)}
 table.append(tbody);root.append(table);
 if(!e.candidates||!e.candidates.length)root.append(doc('p','unknown','확인된 후보가 없습니다.'));
 const details=doc('details','');details.append(doc('summary','','원문 근거 텍스트'));
 details.append(doc('pre','detail-evidence',e.evidence||'기록 없음'));root.append(details);
 const anchor=doc('a','detail-link','공식 투표 원문 확인 ↗');anchor.href=link(e.source_url);anchor.rel='noopener noreferrer';anchor.target='_blank';root.append(anchor);
 $('#detail').showModal();
}
function safeCsv(s){
 const val=String(s??'');const guarded=/^[=+\-@\t\r]/.test(val)?"'"+val:val;
 return '"'+guarded.replace(/"/g,'""')+'"';
}
function exportCsv(){
 const rows=[['앱','투표명','시작','종료','리워드','후보','수집당시1위','1위 확인 시각(KST)','최종1위','출처']];
 for(const e of filtered())rows.push([app(e.app).name,e.title,e.start,e.end,rewardText(e),(e.candidates||[]).map(c=>c.name).join(' / '),e.leader,e.leader?fullStamp(observedAt(e)):'',e.winner,e.source_url]);
 const content='\ufeff'+rows.map(row=>row.map(safeCsv).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const a=doc('a','');a.href=url;a.download='vote-atlas-'+kst+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
for(const el of document.querySelectorAll('[data-summary]'))el.onclick=()=>{
  summary=el.dataset.summary;chosenDay=null;$('#clearDay').hidden=true;
  for(const id of ['app','period','reward'])$('#'+id).value='all';
  $('#query').value='';renderVotes();
  document.querySelector('.vote-panel').scrollIntoView({behavior:'smooth',block:'start'});
};
$('#clearSummary').onclick=()=>{summary='all';renderVotes()};
for(const id of ['artistQuery','artistApp','artistSort'])$('#'+id).addEventListener(id==='artistQuery'?'input':'change',()=>{$('#artistDetail').hidden=true;renderArtists()});
for(const id of ['query','app','period','reward'])$('#'+id).addEventListener(id==='query'?'input':'change',renderVotes);
$('#csv').onclick=exportCsv;$('#reload').onclick=load;
$('#prevMonth').onclick=()=>{if(--calMonth<0){calMonth=11;calYear--}renderCalendar()};
$('#nextMonth').onclick=()=>{if(++calMonth>11){calMonth=0;calYear++}renderCalendar()};
$('#todayBtn').onclick=()=>{calYear=Number(kst.slice(0,4));calMonth=Number(kst.slice(5,7))-1;chosenDay=null;$('#clearDay').hidden=true;renderCalendar();renderVotes()};
$('#clearDay').onclick=()=>{chosenDay=null;$('#clearDay').hidden=true;renderCalendar();renderVotes()};
$('#closeDetail').onclick=()=>$('#detail').close();
$('#detail').addEventListener('click',e=>{if(e.target===$('#detail'))$('#detail').close()});
load();