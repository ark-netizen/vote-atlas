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
function renderAwards(){
 const q=$('#query').value.trim().toLocaleLowerCase('ko-KR'), cat=$('#category').value, platform=$('#platform').value, verified=$('#verification').value;
 const filtered=records.awards.filter(a=>{
  if(cat!=='all'&&a.category!==cat)return false;
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
 const rows=[['행사명','분류','회차 연도','투표확인','개최일','플랫폼','부문·운영방식','설명','공식 근거']];
 const awards=records.awards;
 for(const a of awards)rows.push([a.name,a.category,a.year,a.voting,a.event_date||'',(a.platforms||[]).map(p=>p.name).join(' / '),(a.platforms||[]).map(p=>p.name+' : '+p.role).join(' / '),a.note||'',(a.sources||[]).map(s=>s.url).join(' / ')]);
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
  for(const value of options){const opt=textNode('option','',value);opt.value=value;el.append(opt)}
  el.value=options.includes(prior)?prior:'all';
 }
 const status=records.discovery_status||{},t=status.last_checked_at?'마지막 검색: '+fmt(status.last_checked_at):'일일 자동 검색 실행 전';
 $('#discoveryStatus').textContent=t+' · '+(status.feed_status||'상태 미확인')+' · 검사 기사 '+(status.items_scanned||0)+'건 · 이번 실행 신규 후보 '+(status.new_candidates||0)+'건';
 discoverCards('#candidateList',records.discovered||[],'새로운 행사로 분류된 기사가 아직 없습니다.');
 discoverCards('#newsList',records.latest_news||[],'기존 시상식의 새로운 투표 관련 기사가 아직 없습니다.');
 renderAwards();
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
load();
