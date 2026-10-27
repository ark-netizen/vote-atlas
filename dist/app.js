'use strict';
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let [year,month]=today.split('-').map(Number);month--;
let selected=today,mode='end',view='calendar',data={events:[],sources:[]},enabled=new Set(),query='';
const dateKey=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const koreanDate=s=>s?new Date(s+'T12:00:00+09:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}):'미확인';
const stamp=s=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'미실행';
const appOf=id=>data.sources.find(s=>s.id===id)||{name:id,color:'#81936e',url:'#'};
const filtered=()=>data.events.filter(e=>enabled.has(e.app)&&(!query||[e.title,e.leader,e.winner,...(e.candidates||[]).map(c=>c.name)].join(' ').toLowerCase().includes(query)));
function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'||u.protocol==='http:'?u.href:'#'}catch{return '#'}}
function empty(title,body){return `<div class="empty-state"><span class="empty-icon">▦</span><div><h3>${esc(title)}</h3><p>${esc(body)}</p></div></div>`}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3000)}
async function load(){
 try{const r=await fetch('data/events.json?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(!Array.isArray(next.events)||!Array.isArray(next.sources))throw Error();data=next;if(!$('#appFilters').children.length)enabled=new Set(data.sources.map(s=>s.id));render();}
 catch{$('#statusBanner').innerHTML='<span class="status-symbol">!</span><div><b>데이터를 불러오지 못했습니다</b><p>잠시 후 새로고침해 주세요. 이전에 표시된 데이터를 유지합니다.</p></div>';toast('데이터 연결 실패');}
}
function render(){
 $('#appFilters').innerHTML=data.sources.map(s=>`<label class="app-filter" style="--c:${s.color}"><input type="checkbox" value="${esc(s.id)}" ${enabled.has(s.id)?'checked':''}><span>${esc(s.name)}</span><span class="app-number">${data.events.filter(e=>e.app===s.id).length}</span></label>`).join('');
 $('#appFilters').querySelectorAll('input').forEach(input=>input.onchange=()=>{input.checked?enabled.add(input.value):enabled.delete(input.value);render()});
 $('#totalNav').textContent=data.events.length;
 $('#statTotal').innerHTML=`${data.events.length}<small>건</small>`;
 $('#statActive').innerHTML=`${data.events.filter(e=>e.start<=today&&e.end>=today).length}<small>건</small>`;
 const week=new Date(today+'T12:00:00Z');week.setUTCDate(week.getUTCDate()+7);const until=week.toISOString().slice(0,10);
 $('#statSoon').innerHTML=`${data.events.filter(e=>e.end>=today&&e.end<=until).length}<small>건</small>`;
 const ready=data.sources.filter(s=>s.state==='ok'||s.state==='partial').length;
 $('#statSources').innerHTML=`${ready}<small>/ ${data.sources.length} 앱</small>`;
 if(ready){$('#statusBanner').innerHTML=`<span class="status-symbol">i</span><div><b>${ready}개 앱에서 화면 데이터가 수집되었습니다</b><p>부분 수집 및 이전 수집값이 포함될 수 있습니다. 상세 화면에서 출처와 확인 시각을 확인하세요.</p></div><button id="showSources">연결 상태 보기 →</button>`;$('#showSources').onclick=()=>setView('sources');}
 $('#lastUpdated').textContent='최근 실행 '+stamp(data.updated_at)+' KST';
 renderCalendar();renderDay();renderList();renderSources();
}
function renderCalendar(){
 $('#monthTitle').textContent=`${year}년 ${month+1}월`;const events=filtered();const first=new Date(Date.UTC(year,month,1));const start=new Date(first);start.setUTCDate(1-first.getUTCDay());
 const days=new Date(Date.UTC(year,month+1,0)).getUTCDate();const cells=Math.ceil((first.getUTCDay()+days)/7)*7;let html='';
 for(let i=0;i<cells;i++){
 const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);const key=dateKey(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());const dayEvents=events.filter(e=>e[mode]===key);
 html+=`<div class="day ${d.getUTCMonth()!==month?'other':''} ${key===today?'current':''} ${key===selected?'selected':''}" role="button" tabindex="0" data-date="${key}" aria-label="${key}, 투표 ${dayEvents.length}건"><span class="day-number">${d.getUTCDate()}</span>${dayEvents.slice(0,2).map(e=>`<button class="event-chip" style="--c:${appOf(e.app).color}" data-id="${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</button>`).join('')}${dayEvents.length>2?`<span class="more">+${dayEvents.length-2}개 더보기</span>`:''}</div>`;
 }
 $('#calendarGrid').innerHTML=html;
 $('#calendarGrid').querySelectorAll('.day').forEach(el=>{const select=()=>{selected=el.dataset.date;renderCalendar();renderDay()};el.onclick=e=>{if(!e.target.closest('.event-chip'))select()};el.onkeydown=e=>{if(e.target!==el)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}}});
 $('#calendarGrid').querySelectorAll('.event-chip').forEach(b=>b.onclick=()=>openEvent(b.dataset.id));
 $('#monthCount').textContent=`이달 ${events.filter(e=>e[mode]?.startsWith(dateKey(year,month,1).slice(0,7))).length}건`;
}
function rows(events){return events.map(e=>`<button class="event-row" data-id="${esc(e.id)}"><span class="event-date">${esc(e[mode])}</span><div><h3>${esc(e.title)}</h3><p>${e.winner?'최종 1위 '+esc(e.winner):e.leader?'수집 당시 1위 '+esc(e.leader):'1위 미확인'} · ${esc(e.verification||'확인 필요')}</p></div><span class="app-tag" style="--c:${appOf(e.app).color}">${esc(appOf(e.app).name)}</span></button>`).join('')}
function bindRows(parent){$(parent).querySelectorAll('.event-row').forEach(b=>b.onclick=()=>openEvent(b.dataset.id))}
function renderDay(){
 const events=filtered().filter(e=>e[mode]===selected);$('#dayTitle').textContent=koreanDate(selected);$('#dayCount').textContent=`${mode==='end'?'마감':'시작'} 투표 ${events.length}건`;
 $('#dayEvents').innerHTML=events.length?rows(events):empty(data.events.length?'표시할 투표 일정이 없습니다':'첫 번째 자동 수집을 기다리고 있어요',data.events.length?'앱 필터와 표시 기준을 바꾸어 확인해 보세요.':'앱 연결 후 읽어 온 실제 투표가 날짜별로 표시됩니다.');bindRows('#dayEvents');
}
function renderList(){const events=filtered().sort((a,b)=>b.end.localeCompare(a.end));$('#eventList').innerHTML=events.length?rows(events):empty('아직 수집된 투표가 없습니다','앱 연결 상태에서 수집 준비 여부를 확인해 주세요.');bindRows('#eventList')}
function renderSources(){
 $('#sourceCards').innerHTML=data.sources.map(s=>`<article class="source-card" style="--c:${s.color}"><h3><i></i>${esc(s.name)}<span class="badge">${s.state==='partial'?'부분 수집':s.state==='ok'?'수집 완료':'연결 대기'}</span></h3><p>${esc((s.message||'앱 설치 및 실행 검증 필요').replace(/^[A-Z_]+:\s*/,''))}</p><small>최근 시도 ${stamp(s.attempted_at)} · 최근 성공 ${stamp(s.last_success)}</small><a href="${safeURL(s.url)}" target="_blank" rel="noopener noreferrer">공식 페이지 ↗</a></article>`).join('');
}
function setView(next){view=next;document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.view===next));['calendar','list','sources'].forEach(v=>$('#'+v+'View').classList.toggle('hidden',v!==next));$('#dayPanel').classList.toggle('hidden',next!=='calendar');$('#crumb').textContent={calendar:'투표 캘린더',list:'전체 투표',sources:'앱 연결 상태'}[next]}
function openEvent(id){
 const e=data.events.find(x=>x.id===id);if(!e)return;const app=appOf(e.app);
 $('#detailContent').innerHTML=`<span class="tag" style="--c:${app.color}">${esc(app.name)} · ${esc(e.source==='android'?'앱 화면 수집':e.source)}</span><h2>${esc(e.title)}</h2><dl class="detail-grid"><dt>투표 기간</dt><dd>${esc(e.start)} ~ ${esc(e.end)}${e.year_inferred?'<br><small>연도는 수집일 기준 추정 · 시간은 미확인</small>':'<br><small>일 단위 표시 · 마감 시각 미확인</small>'}</dd><dt>수집 당시 1위</dt><dd>${esc(e.leader||'미확인')}</dd><dt>최종 1위</dt><dd>${esc(e.winner||'공식 최종 결과 미확인')}</dd><dt>1위 혜택</dt><dd>${esc(e.reward||'화면에서 확인하지 못함')}</dd><dt>수집 시각</dt><dd>${stamp(e.collected_at)} KST</dd><dt>확인 상태</dt><dd>${esc(e.verification)}<br>${e.lineup_complete?'전체 후보 확인':'전체 라인업 확보 여부 미확인'}</dd></dl><h3 style="font-size:13px">확인된 후보 ${(e.candidates||[]).length}명/팀</h3>${e.candidates?.length?`<table><thead><tr><th>순위</th><th>후보</th><th>득표</th></tr></thead><tbody>${e.candidates.map(c=>`<tr><td>${esc(c.rank)}</td><td>${esc(c.name)}</td><td>${Number(c.votes).toLocaleString()}</td></tr>`).join('')}</tbody></table>`:'<p style="font-size:11px;color:#99a18f">후보 정보를 아직 읽지 못했습니다.</p>'}<details><summary>추출 근거 텍스트</summary><pre>${esc(e.evidence||'')}</pre></details><a class="source-link" target="_blank" rel="noopener noreferrer" href="${safeURL(e.source_url)}">공식 출처 확인 ↗</a>`;
 $('#detail').showModal();
}
document.querySelectorAll('.nav-button').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#showSources').onclick=()=>setView('sources');$('#resetFilters').onclick=()=>{enabled=new Set(data.sources.map(s=>s.id));render()};$('#previous').onclick=()=>{if(--month<0){month=11;year--}renderCalendar()};$('#next').onclick=()=>{if(++month>11){month=0;year++}renderCalendar()};$('#today').onclick=()=>{[year,month]=today.split('-').map(Number);month--;selected=today;renderCalendar();renderDay()};$('#dateMode').onchange=e=>{mode=e.target.value;renderCalendar();renderDay();renderList()};$('#search').oninput=e=>{query=e.target.value.toLowerCase().trim();renderCalendar();renderDay();renderList()};$('#refresh').onclick=async()=>{await load();toast('저장된 수집 데이터를 다시 불러왔습니다')};$('.close-dialog').onclick=()=>$('#detail').close();$('#detail').onclick=e=>{if(e.target===$('#detail'))$('#detail').close()};load();
