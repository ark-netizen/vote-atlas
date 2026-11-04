'use strict';
const $=selector=>document.querySelector(selector);
const textNode=(tag,className,value)=>{const el=document.createElement(tag);if(className)el.className=className;if(value!==undefined)el.textContent=String(value);return el};
const validLink=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}};
let records={awards:[],discovered:[],latest_news:[],discovery_status:{}};
const fmt=value=>{if(!value)return '미확인';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'미확인'};
function anchor(label,href){
  const safe=validLink(href);if(!safe)return textNode('span','',label);
  const link=textNode('a','',label+' ↗');link.href=safe;link.target='_blank';link.rel='noopener noreferrer';return link;
}

const awardsCalendar = window.VoteAtlasAwardsCalendar;
const calendarToday = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let awardCalYear = Number(calendarToday.slice(0,4));
let awardCalMonth = Number(calendarToday.slice(5,7))-1;
let awardSelectedDate = calendarToday;
let awardSelectedEventId = null;
const dateShort = value => {
 const parts=String(value||'').split('-');
 return parts.length===3 ? Number(parts[1])+'월 '+Number(parts[2])+'일' : '날짜 미확인';
};
const scheduleSpan = item => item.start_date===item.end_date ? dateShort(item.start_date) :
 dateShort(item.start_date)+' ~ '+dateShort(item.end_date);
const scheduleKindLabel = kind => kind==='ceremony'?'시상식':kind==='milestone'?'투표 시작':'팬 투표';
function renderDayAgenda(items){
 const root=$('#awardDayAgenda');root.replaceChildren();
 const todayItems=items.filter(x=>awardsCalendar.onDay(x,awardSelectedDate)).sort((a,b)=>{
  const priority={ceremony:0,milestone:1,vote:2};
  return Number(b.id===awardSelectedEventId)-Number(a.id===awardSelectedEventId)||priority[a.kind]-priority[b.kind]||a.award_name.localeCompare(b.award_name,'ko');
 });
 $('#awardDayTitle').textContent=awardSelectedDate.replaceAll('-','.')+' · '+todayItems.length+'건';
 if(!todayItems.length){
  root.append(textNode('p','discover-empty','이 날짜에는 등록된 시상식 또는 팬 투표 일정이 없습니다.'));
  return;
 }
 for(const item of todayItems){
  const card=textNode('article','award-schedule-entry '+item.kind+(item.id===awardSelectedEventId?' selected-event':''));
  card.append(textNode('span','schedule-tag',scheduleKindLabel(item.kind)));
  card.append(textNode('strong','',item.award_name));
  card.append(textNode('p','',item.title+(item.platform?' · '+item.platform:'')));
  card.append(textNode('p','',scheduleSpan(item)+(item.detail?' · '+item.detail:'')));
  if(item.kind==='ceremony'&&item.platforms.length)card.append(textNode('p','',
    '확인된 투표처: '+item.platforms.join(' / ')));
  if(item.source_url)card.append(anchor('일정 확인 출처',item.source_url));
  root.append(card);
 }
}
function renderMonthAgenda(items){
 const root=$('#awardMonthAgenda');root.replaceChildren();
 $('#awardMonthCount').textContent=items.length+'건';
 if(!items.length){root.append(textNode('p','discover-empty','이달에 날짜가 확인된 일정이 없습니다.'));return}
 const first=awardsCalendar.monthKey(awardCalYear,awardCalMonth,1);
 for(const item of items.slice().sort((a,b)=>{
  const aStart=a.start_date<first?first:a.start_date,bStart=b.start_date<first?first:b.start_date;
  return aStart.localeCompare(bStart)||a.kind.localeCompare(b.kind)||a.award_name.localeCompare(b.award_name,'ko');
 })){
  const button=textNode('button','award-month-item '+item.kind);
  button.type='button';button.setAttribute('aria-label',item.award_name+' '+item.title+' '+scheduleSpan(item));
  const content=textNode('span','month-item-main');
  content.append(textNode('strong','',item.award_name),
    textNode('small','',scheduleKindLabel(item.kind)+' · '+item.title+(item.platform?' · '+item.platform:'')));
  button.append(content,textNode('span','month-item-date',scheduleSpan(item)));
  button.onclick=()=>{
   awardSelectedDate = item.start_date<first?first:item.start_date;
   awardSelectedEventId = item.id;
   renderAwardsCalendar();
   $('#awardDayTitle').scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  root.append(button);
 }
}
function renderAwardsCalendar(){
 if(!awardsCalendar){
  $('#awardCalendarGrid').textContent='달력 모듈을 불러오지 못했습니다.';
  return;
 }
 const kind=$('#calendarKind').value;
 const subcultureOnly=$('#calendarGroup').value==='subculture';
 const allowedIds=new Set(records.awards.filter(a=>a.group==='서브컬처').map(a=>a.id));
 const schedules=awardsCalendar.filteredItems(awardsCalendar.buildSchedule(records.awards),kind)
   .filter(item=>!subcultureOnly||allowedIds.has(item.award_id));
 const monthItems=schedules.filter(x=>awardsCalendar.overlapsMonth(x,awardCalYear,awardCalMonth));
 $('#awardMonth').textContent=awardCalYear+'년 '+(awardCalMonth+1)+'월';
 $('#calendarTotal').textContent='이달 '+monthItems.length+'건 · 개최/투표 일정을 각각 집계';
 const grid=$('#awardCalendarGrid');grid.replaceChildren();
 const visibleMonth=awardCalYear+'-'+String(awardCalMonth+1).padStart(2,'0');
 const weeks=awardsCalendar.layoutMonthBars(schedules,awardCalYear,awardCalMonth);
 for(const week of weeks){
  const row=textNode('div','award-calendar-week');
  row.setAttribute('role','row');
  row.style.gridTemplateRows='34px repeat('+Math.max(week.laneCount,1)+', 28px)';
  for(const [index,day] of week.dates.entries()){
   const inMonth=day.slice(0,7)===visibleMonth;
   const count=inMonth?schedules.filter(x=>awardsCalendar.onDay(x,day)).length:0;
   const cell=textNode('div','award-date-cell'+(inMonth?'':' out-month')+(day===calendarToday?' today':'')+(day===awardSelectedDate?' selected':''));
   cell.style.gridColumn=String(index+1);
   cell.style.gridRow='1 / -1';
   cell.setAttribute('role','gridcell');
   const button=textNode('button','award-date-button');
   button.type='button';
   button.setAttribute('aria-pressed',day===awardSelectedDate?'true':'false');
   button.setAttribute('aria-label',day+' · 등록 일정 '+count+'건');
   button.append(textNode('span','cal-day-num',Number(day.slice(8,10))));
   button.onclick=()=>{
    if(!inMonth){awardCalYear=Number(day.slice(0,4));awardCalMonth=Number(day.slice(5,7))-1;}
    awardSelectedDate=day;
    awardSelectedEventId=null;
    renderAwardsCalendar();
   };
   cell.append(button);row.append(cell);
  }
  for(const segment of week.segments){
   const item=segment.item;
   const bar=textNode('button','award-range-bar '+item.kind+
     (segment.continuesBefore?' continues-before':'')+
     (segment.continuesAfter?' continues-after':'')+
     (item.id===awardSelectedEventId?' selected-event':''));
   bar.type='button';
   bar.style.gridColumn=(segment.first+1)+' / '+(segment.last+2);
   bar.style.gridRow=String(segment.lane+2);
   const label=item.award_name+(item.kind==='vote'?' · '+item.title:item.kind==='milestone'?' · 투표 시작':'');
   bar.append(textNode('span','award-range-text',label));
   bar.title=item.award_name+' · '+item.title+(item.platform?' · '+item.platform:'')+' · '+scheduleSpan(item);
   bar.setAttribute('aria-label',bar.title);
   bar.onclick=()=>{
    awardSelectedDate=segment.firstDate;
    awardSelectedEventId=item.id;
    renderAwardsCalendar();
    $('#awardDayTitle').scrollIntoView({behavior:'smooth',block:'nearest'});
   };
   row.append(bar);
  }
  grid.append(row);
 }
 renderDayAgenda(schedules);
 renderMonthAgenda(monthItems);
}
function moveAwardMonth(direction){
 const date=new Date(Date.UTC(awardCalYear,awardCalMonth+direction,1));
 awardCalYear=date.getUTCFullYear();
 awardCalMonth=date.getUTCMonth();
 const start=awardsCalendar.monthKey(awardCalYear,awardCalMonth,1);
 const subcultureOnly=$('#calendarGroup').value==='subculture';
 const allowedIds=new Set(records.awards.filter(a=>a.group==='서브컬처').map(a=>a.id));
 const next=awardsCalendar.filteredItems(awardsCalendar.buildSchedule(records.awards),$('#calendarKind').value)
   .filter(x=>awardsCalendar.overlapsMonth(x,awardCalYear,awardCalMonth)&&(!subcultureOnly||allowedIds.has(x.award_id)));
 awardSelectedDate=next.length?(next[0].start_date<start?start:next[0].start_date):start;
 awardSelectedEventId=null;
 renderAwardsCalendar();
}

function renderAwards(){
 const q=$('#query').value.trim().toLocaleLowerCase('ko-KR'), cat=$('#category').value, platform=$('#platform').value, verified=$('#verification').value;
 const filtered=records.awards.filter(a=>{
  if(cat==='subculture'&&a.group!=='서브컬처')return false;
  if(cat!=='all'&&cat!=='subculture'&&a.category!==cat)return false;
  if(verified!=='all'&&a.voting!==verified)return false;
  if(platform!=='all'&&!(a.platforms||[]).some(p=>p.name===platform))return false;
  return !q||[a.name,a.category,a.note,...(a.aliases||[]),...(a.platforms||[]).flatMap(p=>[p.name,p.role])].join(' ').toLocaleLowerCase('ko-KR').includes(q);
 });
 filtered.sort((a,b)=>(a.voting===b.voting?0:a.voting==='confirmed'?-1:1)||a.category.localeCompare(b.category,'ko')||a.name.localeCompare(b.name,'ko'));
 $('#resultCount').textContent=filtered.length+'건 표시 / '+records.awards.length+'건';
 const root=$('#awardsList');root.replaceChildren();
 if(!filtered.length){root.append(textNode('p','award-empty','조건과 일치하는 시상식이 없습니다.'));return}
 for(const a of filtered){
  const card=textNode('article','award-card');
  const head=textNode('header','');head.append(textNode('span','',a.category||'기타'),textNode('span','',String(a.year||'연도 미확인')));
  head.append(textNode('span','pill'+(a.voting==='confirmed'?'':' unknown'),a.voting==='confirmed'?'투표처 확인':'플랫폼 미확인'));
  card.append(head,textNode('h3','',a.name));
  if(a.event_date)card.append(textNode('div','award-date','개최일 '+a.event_date));
  const platforms=textNode('div','platform-grid');
  if(a.platforms&&a.platforms.length){for(const p of a.platforms){const unit=textNode('div','platform-unit');unit.append(textNode('strong','platform-name',p.name),textNode('div','platform-role',p.role));platforms.append(unit)}}
  else platforms.append(textNode('p','award-note','투표 플랫폼 선정 여부 조사 중'));
  card.append(platforms);
  if(a.note)card.append(textNode('p','award-note',a.note));
  if((a.sources||[]).length){
    const links=textNode('div','award-evidence');
    for(const s of a.sources)links.append(anchor(s.label||'자료 확인',s.url));
    card.append(links);
  }
  root.append(card);
 }
}
function discoverCards(id,items,emptyLabel){
 const root=$(id);root.replaceChildren();
 if(!items.length){root.append(textNode('p','discover-empty',emptyLabel));return}
 for(const x of items.slice(0,60)){
  const card=textNode('article','discover-card'),body=textNode('div','');
  body.append(textNode('strong','',x.award_name||x.title||'기사 제목 미확인'));
  if(x.award_name&&x.title!==x.award_name)body.append(textNode('p','',x.title));
  const meta=[x.published?fmt(x.published):null,x.platform_mentions?.length?'언급 앱: '+x.platform_mentions.join(', '):null,x.award_id?'등록된 시상식: '+x.award_id:null].filter(Boolean).join(' · ');
  if(meta)body.append(textNode('p','',meta));
  card.append(body,anchor('기사 원문',x.url));root.append(card);
 }
}
function exportCSV(){
 const rows=[['행사명','분류','회차 연도','투표확인','개최일','개최 종료일','투표 기간','플랫폼','부문·운영방식','설명','공식 근거']];
 const awards=records.awards;
 for(const a of awards)rows.push([a.name,a.category,a.year,a.voting,a.event_date||'',a.event_end_date||'',(a.voting_periods||[]).map(x=>x.title+': '+x.start_date+'~'+x.end_date+' ('+x.platform+')').join(' / '),(a.platforms||[]).map(p=>p.name).join(' / '),(a.platforms||[]).map(p=>p.name+' : '+p.role).join(' / '),a.note||'',(a.sources||[]).map(s=>s.url).join(' / ')]);
 const cell=value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 const csv='\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),el=document.createElement('a');el.href=url;el.download='vote-atlas-awards.csv';document.body.append(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function render(){
 $('#totalCount').textContent=records.awards.length;
 $('#verifiedCount').textContent=records.awards.filter(x=>x.voting==='confirmed').length;
 $('#watchCount').textContent=records.awards.filter(x=>x.voting!=='confirmed').length;
 $('#candidateCount').textContent=records.discovered.length;
 const categories=[...new Set(records.awards.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
 const platforms=[...new Set(records.awards.flatMap(x=>(x.platforms||[]).map(p=>p.name)))].sort((a,b)=>a.localeCompare(b,'ko'));
 for(const [id,options,all] of [['#category',categories,'전체 장르'],['#platform',platforms,'모든 플랫폼']]){
  const el=$(id),prior=el.value;el.replaceChildren();const start=textNode('option','',all);start.value='all';el.append(start);
  if(id==='#category'){const sc=textNode('option','','서브컬처 전체');sc.value='subculture';el.append(sc)}
  for(const value of options){const opt=textNode('option','',value);opt.value=value;el.append(opt)}
  el.value=(options.includes(prior)||(id==='#category'&&prior==='subculture'))?prior:'all';
 }
 const status=records.discovery_status||{},t=status.last_checked_at?'마지막 검색: '+fmt(status.last_checked_at):'일일 자동 검색 실행 전';
 $('#discoveryStatus').textContent=t+' · '+(status.feed_status||'상태 미확인')+' · 검사 기사 '+(status.items_scanned||0)+'건 · 이번 실행 신규 후보 '+(status.new_candidates||0)+'건';
 discoverCards('#candidateList',records.discovered||[],'새로운 행사로 분류된 기사가 아직 없습니다.');
 discoverCards('#newsList',records.latest_news||[],'기존 시상식의 새로운 투표 관련 기사가 아직 없습니다.');
 renderAwards();
 renderAwardsCalendar();
}
async function load(){
 try{
  const response=await fetch('data/awards.json?v='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();if(!Array.isArray(data.awards)||!Array.isArray(data.discovered)||!Array.isArray(data.latest_news))throw Error('Invalid schema');
  records=data;$('#updated').textContent='데이터 갱신 '+fmt(data.updated_at)+' KST';render();
 }catch(error){$('#updated').textContent='로드 실패';$('#awardsList').replaceChildren(textNode('p','award-empty','시상식 데이터를 읽을 수 없습니다. 저장소 파일과 연결 상태를 확인해 주세요.'));}
}
for(const id of ['#query','#category','#platform','#verification'])$(id).addEventListener(id==='#query'?'input':'change',renderAwards);
$('#reload').addEventListener('click',load);
$('#csv').addEventListener('click',exportCSV);
$('#prevAwardMonth').addEventListener('click',()=>moveAwardMonth(-1));
$('#nextAwardMonth').addEventListener('click',()=>moveAwardMonth(1));
$('#todayAwardMonth').addEventListener('click',()=>{
 awardCalYear=Number(calendarToday.slice(0,4));
 awardCalMonth=Number(calendarToday.slice(5,7))-1;
 awardSelectedDate=calendarToday;
 awardSelectedEventId=null;
 renderAwardsCalendar();
});
$('#calendarKind').addEventListener('change',renderAwardsCalendar);
$('#calendarGroup').addEventListener('change',()=>{awardSelectedEventId=null;renderAwardsCalendar()});
load();
