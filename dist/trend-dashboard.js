'use strict';
/* Accessible SVG: actual collected samples only, gaps never interpolated. */
const VoteAtlasTrendDashboard=(()=>{
 const $=s=>document.querySelector(s);
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};
 const svgEl=(tag,attrs={},tooltip=null)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(tooltip){const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=tooltip;n.append(t);}return n;};
 const colors=['#467b57','#8b6fb4','#cf8b48','#3d91a3','#ca7188','#7a9f49','#ae8e62','#63778e'];
 const fmt=n=>Number(n).toLocaleString('ko-KR');
 const compact=n=>new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1}).format(Number(n));
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let source={events:[],sources:[]},rows=[],ready=false,bound=false,initialized=false;
 const set=(id,value)=>{$(id).textContent=String(value)};
 const appName=id=>source.sources.find(s=>s.id===id)?.name||id;
 function options(selector,items,previous){
   const e=$(selector);e.replaceChildren();
   for(const [key,label] of items){const node=el('option','',label);node.value=key;e.append(node)}
   if(items.some(([k])=>k===previous))e.value=previous;
 }
 function currentRows(){
   const cutoff=VoteAtlasTrends.dateAgo(today(),Number($('#trendRange').value)-1),scope=$('#trendScope').value;
   return rows.filter(r=>r.date>=cutoff&&(scope==='all'||r.scope===scope));
 }
 function chosen(input){
   const app=$('#trendApp').value,topic=$('#trendTopic').value;
   return input.filter(r=>(app==='all'||r.app===app)&&(topic==='all'||r.topic===topic));
 }
 function rebuildTopics(){
   const a=$('#trendApp').value,items=VoteAtlasTrends.groups(currentRows().filter(x=>a==='all'||x.app===a));
   const map=new Map();
   for(const x of items)map.set(x.topic,(map.get(x.topic)||0)+x.points.length);
   const prev=$('#trendTopic').value;
   options('#trendTopic',[['all','모든 투표 주제'],...[...map].sort((x,y)=>y[1]-x[1]||x[0].localeCompare(y[0],'ko')).map(([name])=>[name,name])],prev);
 }
 function frame(name,max,days){
   const svg=svgEl('svg',{viewBox:'0 0 800 270',role:'img','aria-label':name,preserveAspectRatio:'xMidYMid meet'});
   const L=68,R=20,T=18,B=40,W=800,H=270,innerW=W-L-R,innerH=H-T-B,anchor=today(),first=VoteAtlasTrends.dateAgo(anchor,days-1);
   const px=date=>L+VoteAtlasTrends.differenceDays(first,date)*innerW/Math.max(1,days-1);
   const py=value=>T+innerH*(1-value/max);
   for(let i=0;i<=4;i++){
     const y=T+i*innerH/4;
     svg.append(svgEl('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'#e4ede4','stroke-width':1}));
     const label=svgEl('text',{x:L-8,y:y+3,'text-anchor':'end',fill:'#829385','font-size':11});
     label.textContent=compact(Math.round(max*(1-i/4)));svg.append(label);
   }
   const step=days===7?1:Math.max(1,Math.ceil(days/6));
   for(let i=0;i<days;i+=step){
     const label=svgEl('text',{x:L+i*innerW/Math.max(1,days-1),y:H-12,'text-anchor':'middle',fill:'#839687','font-size':10});
     label.textContent=VoteAtlasTrends.dateAgo(anchor,days-1-i).slice(5);svg.append(label);
   }
   return {svg,px,py,innerW,innerH,L,T,first,anchor};
 }
 const empty=(id,msg)=>$(id).replaceChildren(el('p','trend-chart-empty',msg));
 function lineChart(data,days){
   const root=$('#trendLineChart'),legend=$('#trendLegend');root.replaceChildren();legend.replaceChildren();
   const series=VoteAtlasTrends.eventSeries(data,8);
   if(!series.length){empty('#trendLineChart','선택한 조건에서 관측된 득표 기록이 없습니다.');return}
   const max=Math.max(1,...series.flatMap(s=>s.points.map(p=>p.total_votes)))*1.06;
   const {svg,px,py}=frame('회차별 일별 누적 득표, 누락 일자는 연결하지 않음',max,days);
   series.forEach((s,i)=>{
     const color=colors[i%colors.length];let segment=[];
     function stroke(){
       if(segment.length>=2)svg.append(svgEl('polyline',{
         points:segment.map(p=>px(p.date).toFixed(1)+','+py(p.total_votes).toFixed(1)).join(' '),
         stroke:color,fill:'none','stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'}));
       segment=[];
     }
     for(const p of s.points){
       if(segment.length&&VoteAtlasTrends.differenceDays(segment.at(-1).date,p.date)>1)stroke();
       segment.push(p);
     }stroke();
     for(const p of s.points)svg.append(svgEl('circle',{cx:px(p.date),cy:py(p.total_votes),r:3.6,fill:color,stroke:'#fff','stroke-width':1.2},
       appName(p.app)+' · '+s.title+'\n'+p.date+' '+fmt(p.total_votes)+'표\n'+(p.scope==='visible_candidates'?'부분 후보 합계':'전체 후보 합계')+'\n'+p.observed_at));
     const label=el('span','trend-legend-item'),dot=el('span','trend-dot');dot.style.background=color;
     label.append(dot,el('span','',appName(s.points[0].app)+' · '+s.title+(s.scope==='visible_candidates'?' (부분)':'')));
     legend.append(label);
   });
   root.append(svg);
 }
 function deltaChart(data,days){
   const list=VoteAtlasTrends.groupChanges(data),root=$('#trendDeltaChart');root.replaceChildren();
   if(!list.length){empty('#trendDeltaChart','동일 회차가 연속된 두 날짜에 수집되면 증가량이 표시됩니다.');return}
   const map=new Map();
   for(const entry of list){if(!map.has(entry.date))map.set(entry.date,{date:entry.date,delta:0,count:0});const x=map.get(entry.date);x.delta+=entry.delta;x.count+=entry.count}
   const max=Math.max(1,...[...map.values()].map(x=>x.delta))*1.1;
   const {svg,py,innerW,innerH,L,T,anchor}=frame('동일 회차의 전일 대비 득표 증가량',max,days);
   for(let i=0;i<days;i++){
     const date=VoteAtlasTrends.dateAgo(anchor,days-1-i),record=map.get(date);
     if(!record)continue; // No observation is not a zero vote count.
     const width=Math.min(innerW/days*.7,24),h=record.delta/max*innerH;
     svg.append(svgEl('rect',{x:L+(i+.5)*innerW/days-width/2,y:T+innerH-h,
       width,height:Math.max(1,h),rx:2,fill:'#74a081'},
       date+' · +'+fmt(record.delta)+'표 · '+record.count+'개 회차'));
   }root.append(svg);
 }
 function alertsView(input){
   const host=$('#trendAlerts');host.replaceChildren();
   const all=VoteAtlasTrends.changes(input).filter(x=>x.delta>0)
     .sort((a,b)=>Number(b.spike)-Number(a.spike)||b.delta-a.delta||b.date.localeCompare(a.date)).slice(0,14);
   if(!all.length){host.append(el('p','trend-chart-empty','아직 비교 가능한 연속 일자의 증가 기록이 없습니다.'));return}
   for(const p of all){
     const button=el('button','trend-alert');button.type='button';
     const l=el('span','trend-alert-main');
     l.append(el('strong','',appName(p.app)+' · '+p.topic),el('small','',p.title+' · '+p.previous_date+' → '+p.date));
     const r=el('span','trend-alert-values');
     if(p.spike)r.append(el('span','trend-spike-badge','급증 후보'));
     r.append(el('strong','','+'+fmt(p.delta)+'표'));
     r.append(el('small','',p.percent===null?'이전 기록 0표':'+'+p.percent.toFixed(1)+'%'));
     button.append(l,r);
     button.onclick=()=>{$('#trendApp').value=p.app;rebuildTopics();$('#trendTopic').value=p.topic;render();$('#voteTrends').scrollIntoView({behavior:'smooth',block:'start'})};
     host.append(button);
   }
 }
 function render(){
   if(!ready)return;
   const input=currentRows(),show=chosen(input),changes=VoteAtlasTrends.changes(input);
   set('#trendAppCount',new Set(input.map(x=>x.app)).size+'개');
   set('#trendTopicCount',VoteAtlasTrends.groups(input).length+'종');
   set('#trendChangeCount',fmt(changes.length)+'건');
   set('#trendSpikeCount',fmt(changes.filter(x=>x.spike).length)+'건');
   const partial=show.some(x=>x.scope==='visible_candidates');
   set('#trendNotice',show.length?
     '선택 조건 관측 '+fmt(show.length)+'건 · '+new Set(show.map(x=>x.event_id)).size+'개 회차 · '+
     (partial?'부분 후보 합계 포함 · 전체 투표수와 다를 수 있음':'전체 후보 기준')+
     ' · 결측 날짜는 표시하지 않음':
     '이 기간에 수집한 투표 관측 기록이 없습니다. 없는 날짜의 득표수는 추정하지 않습니다.');
   set('#trendUpdated',rows.length?'최근 관측 '+rows.at(-1).date+' · '+fmt(rows.length)+'개 기록':'관측 데이터 없음');
   const days=Number($('#trendRange').value)||14;
   lineChart(show,days);deltaChart(show,days);alertsView(input);
 }
 function bind(){
   if(bound)return;bound=true;
   $('#trendApp').onchange=()=>{rebuildTopics();render()};
   $('#trendTopic').onchange=render;
   $('#trendRange').onchange=()=>{rebuildTopics();render()};
   $('#trendScope').onchange=()=>{rebuildTopics();render()};
 }
 async function load(data){
   source=data||source;bind();
   try{
     const r=await fetch('data/vote_history.json?t='+Date.now(),{cache:'no-store'});
     if(!r.ok)throw Error('HTTP '+r.status);
     const document=await r.json();
     if(!Array.isArray(document.observations))throw Error('Invalid vote history');
     rows=VoteAtlasTrends.normalizeHistory(document);
   }catch(_error){rows=[]}
   ready=true;
   const counts=new Map();
   for(const p of currentRows())counts.set(p.app,(counts.get(p.app)||0)+1);
   const appPrev=$('#trendApp').value;
   options('#trendApp',[['all','모든 앱'],...(source.sources||[]).map(a=>[a.id,a.name+' ('+(counts.get(a.id)||0)+'건)'])],appPrev);
   if(!initialized&&counts.size)$('#trendApp').value=[...counts].sort((a,b)=>b[1]-a[1])[0][0];
   rebuildTopics();
   if(!initialized){
     const groups=VoteAtlasTrends.groups(currentRows().filter(x=>$('#trendApp').value==='all'||x.app===$('#trendApp').value));
     if(groups.length)$('#trendTopic').value=groups[0].topic;
   }
   initialized=true;render();
 }
 return {load,render};
})();
