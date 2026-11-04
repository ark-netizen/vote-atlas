'use strict';
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let [year,month]=today.split('-').map(Number);month--;
const initialView=new URLSearchParams(window.location.search).get('view');
let selected=today,mode='range',view='calendar',data={events:[],sources:[]},enabled=new Set(),query='',metricFilter='all';
const dateKey=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const koreanDate=s=>s?new Date(s+'T12:00:00+09:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}):'미확인';
const stamp=s=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'미실행';
const fullStamp=s=>(s&&Number.isFinite(Date.parse(s)))?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(s))+' KST':'일시 미확인';
const observedAt=e=>e.leader_observed_at||e.collected_at||null;
const onePlace=e=>e.winner?'최종 1위 '+e.winner:e.leader?'수집 당시 1위 ('+fullStamp(observedAt(e))+') '+e.leader:'1위 미확인';
const weekUntil=()=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10)};
const metricMatch=e=>metricFilter==='all'||(metricFilter==='active'&&e.start<=today&&e.end>=today)||(metricFilter==='soon'&&e.end>=today&&e.end<=weekUntil());
const appOf=id=>data.sources.find(s=>s.id===id)||{name:id,color:'#81936e',url:'#'};
const filtered=()=>data.events.filter(e=>{
 if(!enabled.has(e.app))return false;
 const status=$('#statusFilter').value,reward=$('#rewardFilter').value;
 if(status!=='all'&&VoteAtlasCalendar.state(e,today)!==status)return false;
 if(reward==='known'&&!String(e.reward||'').trim())return false;
 if(reward==='missing'&&String(e.reward||'').trim())return false;
 return !query||[e.title,e.leader,e.winner,e.reward,...(e.candidates||[]).map(c=>c.name)].join(' ').toLowerCase().includes(query);
});
function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'||u.protocol==='http:'?u.href:'#'}catch{return '#'}}
function empty(title,body){return `<div class="empty-state"><span class="empty-icon">▦</span><div><h3>${esc(title)}</h3><p>${esc(body)}</p></div></div>`}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3000)}
async function load(){
 try{
  const result=await VoteAtlasDataLoader.loadEvents();
  const next=result.data;
  data=next;
  if(!$('#appFilters').children.length)enabled=new Set(data.sources.map(s=>s.id));
  render();
 }catch(error){
  console.error('Vote Atlas voting-data load failed:',error);
  $('#statusBanner').innerHTML='<span class="status-symbol">!</span><div><b>데이터를 불러오지 못했습니다</b><p>사이트 데이터와 원본 데이터 연결을 확인할 수 없습니다. 새로고침으로 다시 시도해 주세요. 기존 데이터가 있으면 유지합니다.</p></div>';
  toast('데이터 연결 실패');
 }
}
function render(){
 $('#appFilters').innerHTML=data.sources.map(s=>`<label class="app-filter" style="--c:${s.color}"><input type="checkbox" value="${esc(s.id)}" ${enabled.has(s.id)?'checked':''}><span>${esc(s.name)}</span><span class="app-number">${data.events.filter(e=>e.app===s.id).length}</span></label>`).join('');
 $('#appFilters').querySelectorAll('input').forEach(input=>input.onchange=()=>{input.checked?enabled.add(input.value):enabled.delete(input.value);render()});
 $('#totalNav').textContent=data.events.length;
 $('#statTotal').innerHTML=`${data.events.length}<small>건</small>`;
 $('#statActive').innerHTML=`${data.events.filter(e=>e.start<=today&&e.end>=today).length}<small>건</small>`;
 const until=weekUntil();
 $('#statSoon').innerHTML=`${data.events.filter(e=>e.end>=today&&e.end<=until).length}<small>건</small>`;
 const ready=data.sources.filter(s=>s.state==='ok'||s.state==='partial').length;
 $('#statSources').innerHTML=`${ready}<small>/ ${data.sources.length} 앱</small>`;
 if(ready){$('#statusBanner').innerHTML=`<span class="status-symbol">i</span><div><b>${ready}개 서비스에서 공식 데이터가 수집되었습니다</b><p>하루 2회 자동 수집합니다. 부분 수집 및 이전 값이 포함될 수 있으므로 출처와 확인 시각을 확인하세요.</p></div><button id="showSources">연결 상태 보기 →</button>`;$('#showSources').onclick=()=>setView('sources');}
 $('#lastUpdated').textContent='최근 실행 '+stamp(data.updated_at)+' KST'+(Date.now()-Date.parse(data.updated_at)>30*3600000?' · 업데이트 지연':'');
 renderCalendar();renderDay();renderList();renderSources();
}
function renderCalendar(){
 $('#monthTitle').textContent=year+'년 '+(month+1)+'월';
 const events=filtered();
 const first=new Date(Date.UTC(year,month,1));
 const start=new Date(first);
 start.setUTCDate(1-first.getUTCDay());
 const days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 const cells=Math.ceil((first.getUTCDay()+days)/7)*7;
 let html='';
 for(let week=0;week<cells/7;week++){
  const keys=Array.from({length:7},(_,index)=>{
   const d=new Date(start);d.setUTCDate(start.getUTCDate()+week*7+index);
   return dateKey(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  });
  const slots=Array.from({length:7},()=>new Set());
  const items=[];
  const overlap=events.filter(e=>
   (mode==='range'&&e.start<=keys[6]&&e.end>=keys[0])||
   (mode==='start'&&e.start>=keys[0]&&e.start<=keys[6])||
   (mode==='end'&&e.end>=keys[0]&&e.end<=keys[6])
  ).sort((x,y)=>String(x.start).localeCompare(String(y.start))||String(y.end).localeCompare(String(x.end))||String(x.id).localeCompare(String(y.id)));
  for(const e of overlap){
   const covered=keys.map((k,i)=>VoteAtlasCalendar.onDay(e,k,mode)?i:-1).filter(i=>i>=0);
   if(!covered.length)continue;
   let lane=-1;
   for(let candidate=0;candidate<2;candidate++){
    if(covered.every(i=>!slots[i].has(candidate))){lane=candidate;break}
   }
   if(lane<0)continue;
   for(const dayIndex of covered)slots[dayIndex].add(lane);
   items.push({event:e,lane,first:covered[0],last:covered[covered.length-1]});
  }
  for(let index=0;index<7;index++){
   const key=keys[index],date=new Date(key+'T12:00:00Z');
   const all=events.filter(e=>VoteAtlasCalendar.onDay(e,key,mode));
   const current=items.filter(x=>index>=x.first&&index<=x.last).sort((a,b)=>a.lane-b.lane);
   const chips=current.map(({event:e,lane,first,last})=>{
    const isFirst=index===first, isLast=index===last;
    const cssClass=mode!=='range'?'range-single':isFirst&&isLast?'range-single':isFirst?'range-start':isLast?'range-end':'range-middle';
    const label=isFirst?e.title:'';
    return '<button class="event-chip vote-range-segment '+cssClass+'" style="--c:'+appOf(e.app).color+';--lane:'+lane+'" data-id="'+esc(e.id)+'" title="'+esc(e.title)+' | '+esc(e.start)+' ~ '+esc(e.end)+'" aria-label="'+esc(e.title)+' '+esc(e.start)+'부터 '+esc(e.end)+'까지">'+(label?esc(label):'&nbsp;')+'</button>';
   }).join('');
   html+='<div class="day '+(date.getUTCMonth()!==month?'other':'')+' '+(key===today?'current':'')+' '+(key===selected?'selected':'')+'" role="button" tabindex="0" data-date="'+key+'" aria-label="'+key+', 진행되는 투표 '+all.length+'건"><span class="day-number">'+date.getUTCDate()+'</span>'+chips+(all.length>current.length?'<span class="more range-more">+'+(all.length-current.length)+'개</span>':'')+'</div>';
  }
 }
 $('#calendarGrid').innerHTML=html;
 $('#calendarGrid').querySelectorAll('.day').forEach(el=>{
  const select=()=>{selected=el.dataset.date;renderCalendar();renderDay()};
  el.onclick=e=>{if(!e.target.closest('.event-chip'))select()};
  el.onkeydown=e=>{if(e.target!==el)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}};
 });
 $('#calendarGrid').querySelectorAll('.event-chip').forEach(button=>button.onclick=()=>openEvent(button.dataset.id));
 $('#monthCount').textContent='이달 기간에 걸친 투표 '+events.filter(e=>VoteAtlasCalendar.overlapsMonth(e,year,month,mode)).length+'건';
}
function rows(events){return events.map(e=>`<button class="event-row" data-id="${esc(e.id)}"><span class="event-date">${esc(e.start)}<br><span class="date-arrow">~ ${esc(e.end)}</span></span><div><h3>${esc(e.title)}</h3><p>${esc(onePlace(e))} · ${esc(e.verification||'확인 필요')}</p></div><span class="app-tag" style="--c:${appOf(e.app).color}">${esc(appOf(e.app).name)}</span></button>`).join('')}
function bindRows(parent){$(parent).querySelectorAll('.event-row').forEach(b=>b.onclick=()=>openEvent(b.dataset.id))}
function renderDay(){
 const events=filtered().filter(e=>VoteAtlasCalendar.onDay(e,selected,mode));$('#dayTitle').textContent=koreanDate(selected);$('#dayCount').textContent=`${mode==='range'?'해당 날짜에 진행되는':mode==='end'?'마감하는':'시작하는'} 투표 ${events.length}건`;
 $('#dayEvents').innerHTML=events.length?rows(events):empty(data.events.length?'표시할 투표 일정이 없습니다':'첫 번째 자동 수집을 기다리고 있어요',data.events.length?'상단의 앱·기간·상태 필터를 조정해 확인해 보세요.':'자동 수집한 투표가 날짜별로 표시됩니다.');bindRows('#dayEvents');
}
function renderList(){
 const events=filtered().filter(metricMatch).sort((a,b)=>b.end.localeCompare(a.end));
 const titles={all:'전체 투표',active:'진행 중 투표',soon:'7일 내 마감 투표'};
 $('#listTitle').textContent=titles[metricFilter]||titles.all;
 $('#listCountLabel').textContent=events.length+'건 표시 · 최신 저장 데이터 기준';
 $('#metricContext').classList.toggle('hidden',metricFilter==='all');
 $('#metricContextTitle').textContent=metricFilter==='all'?'':titles[metricFilter]+'만 표시 중';
 $('#eventList').innerHTML=events.length?rows(events):empty('조건에 맞는 투표가 없습니다','선택한 앱과 검색어 또는 통계 필터를 변경해 주세요.');
 bindRows('#eventList');
}
function renderSources(){
 $('#sourceCards').innerHTML=data.sources.map(s=>`<article class="source-card" style="--c:${s.color}"><h3><i></i>${esc(s.name)}<span class="badge">${s.state==='partial'?'부분 수집':s.state==='ok'?'수집 완료':s.state==='error'?'수집 실패':'연결 대기'}</span></h3><p>${esc((s.message||'앱 설치 및 실행 검증 필요').replace(/^[A-Z_]+:\s*/,''))}</p><small>최근 시도 ${stamp(s.attempted_at)} · 최근 성공 ${stamp(s.last_success)}</small><a href="${safeURL(s.url)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a></article>`).join('');
}
function setView(next){if(!['calendar','list','sources'].includes(next))return;view=next;const current=new URL(window.location.href);if(next==='calendar')current.searchParams.delete('view');else current.searchParams.set('view',next);window.history.replaceState(null,'',current);document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.view===next));window.VoteAtlasWorkspaceNav?.update();['calendar','list','sources'].forEach(v=>$('#'+v+'View').classList.toggle('hidden',v!==next));$('#dayPanel').classList.toggle('hidden',next!=='calendar');$('#crumb').textContent={calendar:'투표 캘린더',list:'전체 투표',sources:'앱 연결 상태'}[next];$('#pageTitle').textContent={calendar:'투표 캘린더',list:'전체 투표',sources:'수집 현황'}[next]}
function openEvent(id){
 const e=data.events.find(x=>x.id===id);if(!e)return;const app=appOf(e.app);
 $('#detailContent').innerHTML=`<span class="tag" style="--c:${app.color}">${esc(app.name)} · ${esc(e.source==='android'?'앱 화면 수집':e.source)}</span><h2>${esc(e.title)}</h2><dl class="detail-grid"><dt>투표 기간</dt><dd>${esc(e.start)} ~ ${esc(e.end)}${e.end_at?'<br><small>마감 '+esc(new Date(e.end_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+' KST</small>':e.year_inferred?'<br><small>연도는 수집일 기준 추정 · 시간은 미확인</small>':'<br><small>일 단위 표시 · 마감 시각 미확인</small>'}</dd><dt>수집 당시 1위</dt><dd>${esc(e.leader||'미확인')}${e.leader?'<br><small>해당 1위 확인 시각: '+esc(fullStamp(observedAt(e)))+'</small>':''}</dd><dt>최종 1위</dt><dd>${esc(e.winner||'공식 최종 결과 미확인')}</dd><dt>1위 혜택</dt><dd>${esc(e.reward||'화면에서 확인하지 못함')}</dd><dt>수집 시각</dt><dd>${stamp(e.collected_at)} KST</dd><dt>확인 상태</dt><dd>${esc(e.verification)}<br>${e.lineup_complete?'전체 후보 확인':'전체 라인업 확보 여부 미확인'}</dd></dl><h3 style="font-size:13px">확인된 후보 ${(e.candidates||[]).length}명/팀</h3>${e.candidates?.length?`<table><thead><tr><th>순위</th><th>후보</th><th>득표</th></tr></thead><tbody>${e.candidates.map(c=>`<tr><td>${esc(c.rank)}</td><td>${esc(c.name)}</td><td>${c.votes==null?'미공개':Number(c.votes).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:'<p style="font-size:11px;color:#99a18f">후보 정보를 아직 읽지 못했습니다.</p>'}<details><summary>추출 근거 텍스트</summary><pre>${esc(e.evidence||'')}</pre></details><a class="source-link" target="_blank" rel="noopener noreferrer" href="${safeURL(e.source_url)}">공식 출처 확인 ↗</a>`;
 $('#detail').showModal();
}
document.querySelectorAll('.nav-button[data-view]').forEach(b=>b.onclick=e=>{e.preventDefault();metricFilter='all';renderList();setView(b.dataset.view)});
document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{
 metricFilter=b.dataset.metric;
 enabled=new Set(data.sources.map(src=>src.id));query='';$('#search').value='';$('#statusFilter').value='all';$('#rewardFilter').value='all';mode='range';$('#dateMode').value='range';
 render();setView('list');$('#listView').scrollIntoView({behavior:'smooth',block:'start'});
});
$('#clearMetric').onclick=()=>{metricFilter='all';renderList()};
$('#showSources').onclick=()=>setView('sources');
$('#resetFilters').onclick=()=>{
 enabled=new Set(data.sources.map(s=>s.id));query='';$('#search').value='';
 $('#statusFilter').value='all';$('#rewardFilter').value='all';
 mode='range';$('#dateMode').value='range';metricFilter='all';render();
};$('#previous').onclick=()=>{if(--month<0){month=11;year--}renderCalendar()};$('#next').onclick=()=>{if(++month>11){month=0;year++}renderCalendar()};$('#today').onclick=()=>{[year,month]=today.split('-').map(Number);month--;selected=today;renderCalendar();renderDay()};$('#dateMode').onchange=e=>{mode=e.target.value;renderCalendar();renderDay();renderList()};$('#statusFilter').onchange=()=>render();$('#rewardFilter').onchange=()=>render();$('#search').oninput=e=>{query=e.target.value.toLowerCase().trim();renderCalendar();renderDay();renderList()};$('#reload').onclick=async()=>{await load();toast('저장된 수집 데이터를 다시 불러왔습니다')};$('.close-dialog').onclick=()=>$('#detail').close();$('#detail').onclick=e=>{if(e.target===$('#detail'))$('#detail').close()};load().then(()=>setView(['calendar','list','sources'].includes(initialView)?initialView:'calendar'));
