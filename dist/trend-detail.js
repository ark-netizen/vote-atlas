'use strict';
/* One app's enlarged vote-by-vote chart and source-linked observed history. */
(async()=>{
 const $=q=>document.querySelector(q);
 const text=(tag,value,className='')=>{const n=document.createElement(tag);n.textContent=String(value);if(className)n.className=className;return n};
 const fmt=n=>Number(n).toLocaleString('ko-KR');
 const query=new URLSearchParams(window.location.search);
 const appId=String(query.get('app')||'').trim();
 const table=$('#detailRows');
 function safeHref(url){
   try{const p=new URL(url);return p.protocol==='https:'||p.protocol==='http:'?p.href:null}catch{return null}
 }
 function notice(message){
   $('#trendNotice').textContent=message;
   const row=document.createElement('tr'),cell=document.createElement('td');
   cell.colSpan=6;cell.textContent=message;row.append(cell);table.replaceChildren(row);
 }
 let dataset;
 try {
   const response=await fetch('data/events.json?t='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   dataset=await response.json();
   if(!Array.isArray(dataset.sources))throw Error('앱 목록을 확인할 수 없습니다');
 } catch(_err){notice('앱별 투표 데이터를 불러오지 못했습니다.');return}
 const app=dataset.sources.find(x=>x.id===appId);
 if(!app){
   $('#detailAppTitle').textContent='앱을 찾을 수 없습니다';
   notice('유효하지 않은 앱입니다. 통합 대시보드로 돌아가 앱별 그래프를 선택해 주세요.');
   return;
 }
 $('#detailAppTitle').textContent=app.name+' · 득표 추이';
 document.title=app.name+' 투표별 득표 상세 | Vote Atlas';
 const rows=await VoteAtlasTrendDashboard.load(dataset,{appId});
 const history=rows.filter(x=>x.app===appId);
 function renderTable(){
   const scope=$('#trendScope').value;
   const days=Number($('#trendRange').value)||14;
   const from=VoteAtlasTrends.dateAgo(
     new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
     days-1
   );
   const matching=history.filter(x=>x.date>=from&&(scope==='all'||scope===x.scope));
   // Each delta must come from the same round and consecutive matching roster.
   const growth=VoteAtlasTrends.changes(matching);
   const byPair=new Map(growth.map(x=>[x.event_id+'|'+x.date,x]));
   $('#appDetailVotes').textContent=fmt(new Set(matching.map(x=>x.event_id)).size)+'개';
   $('#appDetailObservations').textContent=fmt(matching.length)+'건';
   $('#appDetailChanges').textContent=fmt(growth.length)+'건';
   $('#appDetailSpikes').textContent=fmt(growth.filter(x=>x.spike).length)+'건';
   $('#detailRowsCount').textContent=fmt(matching.length)+'개 날짜별 기록';
   const sorted=[...matching].sort((a,b)=>b.date.localeCompare(a.date)||String(a.title).localeCompare(String(b.title),'ko'));
   table.replaceChildren();
   if(!sorted.length){notice('선택 기간에 수집한 해당 앱의 득표수가 없습니다.');return}
   for(const point of sorted){
     const change=byPair.get(point.event_id+'|'+point.date);
     const tr=document.createElement('tr');
     if(change?.spike)tr.className='trend-jump-row';
     const date=text('td',point.date);
     const title=text('td',point.title);
     const votes=text('td',fmt(point.total_votes)+'표');
     const delta=text('td',change?'+'+fmt(change.delta)+'표'+(change.spike?' · 급증':''):'비교 불가');
     const scopeCell=text('td',point.scope==='all_candidates'?'전체 후보':'부분 후보');
     const evidence=document.createElement('td');
     evidence.append(text('span',(point.observed_at||'수집 시각 미확인')+' '));
     const href=safeHref(point.source_url);
     if(href){const a=text('a','원문 ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';evidence.append(a)}
     tr.append(date,title,votes,delta,scopeCell,evidence);table.append(tr);
   }
 }
 $('#trendRange').addEventListener('change',renderTable);
 $('#trendScope').addEventListener('change',renderTable);
 renderTable();
})();
