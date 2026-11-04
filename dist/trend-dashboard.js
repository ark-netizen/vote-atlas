'use strict';
/* One independent line graph per app. Each actual vote round is a separate line.
 * Yellow background bands identify abrupt, verified same-round daily increases.
 * No extrapolation through missing dates and no joining independent rounds.
 */
const VoteAtlasTrendDashboard=(()=>{
 const $=q=>document.querySelector(q);
 const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n};
 const svg=(name,attrs={},label)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(label){const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=label;n.append(t)}return n};
 const fmt=n=>Number(n).toLocaleString('ko-KR');
 const short=n=>new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1}).format(Number(n));
 const colors=['#3f6d7d','#7a63aa','#44866d','#ba705f','#758446','#b07b43','#6685b4','#975f86','#4b8e94','#8e8862','#725b95','#a46b6b','#55797d','#718f5b'];
 const kst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let dataset={sources:[]},history=[],initialized=false,ready=false;
 const topicFilter=new Map();
 function active(){
   const days=Number($('#trendRange').value)||14;
   const min=VoteAtlasTrends.dateAgo(kst(),days-1),scope=$('#trendScope').value;
   return history.filter(x=>x.date>=min && (scope==='all'||x.scope===scope));
 }
 function addOption(select,value,label){
   const n=el('option','',label);n.value=value;select.append(n);
 }
 function drawAppChart(app,observations,days){
   const shell=el('section','trend-per-app');
   const head=el('div','trend-per-app-head');
   const h3=el('h3','',app.name);
   const spikes=VoteAtlasTrends.changes(observations).filter(c=>c.spike);
   const stats=el('span','trend-per-app-meta',
     new Set(observations.map(x=>x.event_id)).size+'개 투표 · '+observations.length+'개 날짜별 기록 · 급증 '+spikes.length+'건');
   head.append(h3,stats);
   shell.append(head);

   const optionRow=el('div','trend-app-filter');
   const label=el('label','','투표 주제');
   const select=el('select','','');
   select.setAttribute('aria-label',app.name+' 투표 주제 선택');
   addOption(select,'all','모든 투표 표시');
   const topics=VoteAtlasTrends.groups(observations).sort((a,b)=>a.topic.localeCompare(b.topic,'ko'));
   for(const topic of topics)addOption(select,topic.topic,topic.topic+' ('+topic.eventCount+'개 투표)');
   select.value=topics.some(x=>x.topic===topicFilter.get(app.id))?topicFilter.get(app.id):'all';
   select.onchange=()=>{topicFilter.set(app.id,select.value);render()};
   label.append(select);
   optionRow.append(label);
   shell.append(optionRow);

   const plotRows=observations.filter(x=>select.value==='all'||x.topic===select.value);
   const series=VoteAtlasTrends.eventSeries(plotRows,Infinity);
   if(!series.length){
     shell.append(el('p','trend-chart-empty', '선택한 주제에서 기록된 득표수가 없습니다.'));
     return shell;
   }
   const diff=VoteAtlasTrends.changes(plotRows).filter(x=>x.spike);
   const totalSpikes=diff.length;
   const W=920,H=340,L=81,R=23,T=26,B=47;
   const innerW=W-L-R,innerH=H-T-B,begin=VoteAtlasTrends.dateAgo(kst(),days-1);
   const px=date=>L+VoteAtlasTrends.differenceDays(begin,date)*innerW/Math.max(1,days-1);
   const highest=Math.max(1,...series.flatMap(s=>s.points.map(p=>p.total_votes)));
   const yMax=highest*1.08;
   const py=v=>T+innerH*(1-v/yMax);
   const graph=svg('svg',{viewBox:'0 0 '+W+' '+H,role:'img',
     'aria-label':app.name+' 투표별 날짜별 득표수 선그래프, 급증 구간은 노란색 배경',preserveAspectRatio:'xMidYMid meet'});
   for(let i=0;i<=4;i++){
     const y=T+innerH*i/4;
     graph.append(svg('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#e6e8ea','stroke-width':1}));
     const txt=svg('text',{x:L-10,y:y+4,'text-anchor':'end','font-size':12,fill:'#7d8489'});
     txt.textContent=short(Math.round(yMax*(1-i/4)));graph.append(txt);
   }
   const xstep=days<=7?1:Math.max(1,Math.ceil(days/7));
   for(let i=0;i<days;i+=xstep){
     const x=L+i*innerW/Math.max(1,days-1);
     const label=svg('text',{x,y:H-13,'text-anchor':'middle',fill:'#828b90','font-size':11});
     label.textContent=VoteAtlasTrends.dateAgo(kst(),days-1-i).slice(5);graph.append(label);
   }
   // Yellow BACKGROUND around the specific vote's jump, not an ambiguous yellow line.
   for(const p of diff){
     const first=plotRows.find(row=>row.event_id===p.event_id&&row.date===p.previous_date);
     if(!first)continue;
     const x1=px(p.previous_date),x2=px(p.date),y1=py(first.total_votes),y2=py(p.total_votes);
     graph.append(svg('rect',{
       x:Math.min(x1,x2)-7,y:Math.max(T,Math.min(y1,y2)-14),
       width:Math.abs(x2-x1)+14,
       height:Math.min(H-B-Math.max(T,Math.min(y1,y2)-14),Math.abs(y2-y1)+28),
       rx:7,fill:'#ffe56b',opacity:0.38
     },p.title+' / '+p.previous_date+' → '+p.date+' / 전일 대비 +'+fmt(p.delta)+'표'));
   }
   series.forEach((s,index)=>{
     const color=colors[index%colors.length],points=s.points;
     let segments=[],segment=[];
     const flush=()=>{if(segment.length)segments.push(segment);segment=[]};
     for(const p of points){
       if(segment.length){
         const last=segment[segment.length-1];
         if(VoteAtlasTrends.differenceDays(last.date,p.date)!==1||
           last.roster_hash!==p.roster_hash||last.scope!==p.scope)flush();
       }
       segment.push(p);
     }
     flush();
     for(const part of segments){
       if(part.length<2)continue;
       const coords=part.map(p=>px(p.date).toFixed(2)+','+py(p.total_votes).toFixed(2)).join(' ');
       graph.append(svg('polyline',{points:coords,stroke:color,'stroke-width':2.9,
         fill:'none','stroke-linejoin':'round','stroke-linecap':'round'}));
     }
     for(const p of points){
       const isSpike=diff.some(d=>d.event_id===p.event_id&&d.date===p.date);
       graph.append(svg('circle',{
         cx:px(p.date),cy:py(p.total_votes),r:isSpike?5.7:3.8,
         fill:isSpike?'#ffce32':color,stroke:isSpike?'#72591b':'#fff',
         'stroke-width':isSpike?1.5:1.2},
         s.title+'\n'+p.date+' · '+fmt(p.total_votes)+'표'+
         (p.scope==='visible_candidates'?' (부분 후보 기준)':' (전체 후보 기준)')+
         (isSpike?' · 노란색: 전일 대비 급증':'')
       ));
     }
   });
   const plot=el('div','trend-app-plot');plot.append(graph);shell.append(plot);
   const key=el('div','trend-legend');
   series.forEach((s,i)=>{
     const item=el('span','trend-legend-item');
     const line=el('span','trend-line-key');line.style.background=colors[i%colors.length];
     item.append(line,el('span','',s.title+(s.scope==='visible_candidates'?' (부분 후보)':'')));
     item.title=s.title;key.append(item);
   });
   shell.append(key);
   const bottom=el('p','trend-app-note','노란색 배경: '+totalSpikes+'개 급증 구간 · 마우스를 올리면 개별 투표명과 득표수를 확인할 수 있습니다.');
   shell.append(bottom);
   return shell;
 }
 function render(){
   if(!ready)return;
   const rows=active(),comparisons=VoteAtlasTrends.changes(rows),spikes=comparisons.filter(x=>x.spike);
   $('#trendAppCount').textContent=new Set(rows.map(r=>r.app)).size+'개';
   $('#trendTopicCount').textContent=VoteAtlasTrends.groups(rows).length+'종';
   $('#trendChangeCount').textContent=fmt(comparisons.length)+'건';
   $('#trendSpikeCount').textContent=fmt(spikes.length)+'건';
   $('#trendUpdated').textContent=history.length?'최근 관측 '+history[history.length-1].date+' · 총 '+history.length+'개 기록':'관측 기록 없음';
   $('#trendNotice').textContent=rows.length?
     '앱별로 구분된 그래프에 각 투표를 별도 선으로 표시합니다. 현재 '+fmt(rows.length)+'개 날짜별 기록, 급증 '+spikes.length+'건을 노란색 배경으로 표시했습니다.':
     '선택한 기간에 날짜별 득표 기록이 없습니다. 수집되지 않은 날짜는 임의로 연결하지 않습니다.';
   const root=$('#trendAppCharts'),missing=$('#trendAppMissing');root.replaceChildren();missing.replaceChildren();
   const sources=dataset.sources||[];
   const appIds=[...new Set(rows.map(x=>x.app))];
   const ordered=appIds.map(id=>sources.find(s=>s.id===id)||{id,name:id});
   const days=Number($('#trendRange').value)||14;
   for(const app of ordered){
     const filtered=rows.filter(x=>x.app===app.id);
     root.append(drawAppChart(app,filtered,days));
   }
   if(!ordered.length)root.append(el('p','trend-chart-empty','아직 그래프로 표시할 앱의 투표 기록이 없습니다.'));
   const emptyApps=sources.filter(a=>!appIds.includes(a.id));
   if(emptyApps.length)missing.append(el('p','trend-no-data-apps',
     '기록이 아직 없는 앱: '+emptyApps.map(a=>a.name).join(' · ')+' — 자동 수집으로 날짜별 득표가 확인되면 앱별 그래프가 추가됩니다.'));
 }
 async function load(data){
   dataset=data||dataset;
   const ids=['trendRange','trendScope'];
   if(!initialized){
     for(const id of ids)$('#'+id).addEventListener('change',render);
     initialized=true;
   }
   try{
     const res=await fetch('data/vote_history.json?t='+Date.now(),{cache:'no-store'});
     if(!res.ok)throw Error('HTTP '+res.status);
     const value=await res.json();
     if(!Array.isArray(value.observations))throw Error('Missing observations');
     history=VoteAtlasTrends.normalizeHistory(value);
   }catch(_err){
     history=[];
     $('#trendNotice').textContent='수집 이력 파일을 읽지 못했습니다. GitHub Actions 수집 상태를 확인해 주세요.';
   }
   ready=true;render();
 }
 return {load,render};
})();
