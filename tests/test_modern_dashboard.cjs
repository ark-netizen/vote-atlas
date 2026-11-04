'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..','dist',name),'utf8');
const pages=['overview.html','rewards.html','awards.html','index.html','trend-detail.html'];

test('Every page has compact styling and no redundant editorial/marketing mastheads',()=>{
 for(const name of pages){
  const html=read(name);
  const modern=html.indexOf('href="dashboard-modern.css"');
  const urban=html.indexOf('href="urban.css"');
  assert.ok(modern>urban,name+' stylesheet order');
  assert.match(html,/class="protected-view urban-interface modern-interface(?:\s+[^"]+)?"/);
  assert.doesNotMatch(html,/class="urban-utility"|class="eyebrow"/,name);
  assert.doesNotMatch(html,/YOUR FANDOM|INTELLIGENCE DESK|PERFORMANCE MONITORING|FANDOM VOTING INTELLIGENCE|놓치지 않는, 투표의 순간|한 번 연결하고,/,name);
  assert.ok(html.includes('src="access-guard.js"'),name+' must keep screen guard');
 }
});

test('Dashboard uses real KPI elements, per-app trends, real activity list and source status',()=>{
 const html=read('overview.html'),script=read('overview.js');
 for(const id of [
  'countAll','countActive','countSoon','countReward','countLineup',
  'voteTrends','trendAppCharts','trendAppCount','trendTopicCount','trendChangeCount',
  'trendSpikeCount','query','miniCalendar','votes','artistRows','sourceCards',
  'recentCount','recentActivityList'
 ])assert.ok(html.includes('id="'+id+'"'),'missing functional element '+id);
 assert.match(html,/class="dashboard-layout"/);
 assert.match(html,/class="dashboard-primary"/);
 assert.match(html,/class="dashboard-activity"/);
 assert.match(script,/renderSources\(\);renderActivity\(\)/);
 assert.match(script,/function renderActivity\(\)/);
 assert.match(script,/records\.events\|\|\[\]/);
 assert.doesNotMatch(html,/id="recentSourcesList"/);
 assert.match(script,/Date\.parse\(value\|\|''\)/);
 assert.match(script,/row\.onclick=\(\)=>openDetail\(vote\)/);
 assert.match(script,/timeline\.replaceChildren\(\)/);
 assert.doesNotMatch(script,/Math\.random\(\)/);
});

test('Reference-derived light style contains distinct sidebar, cards, chart modules and real activity panel',()=>{
 const css=read('dashboard-modern.css');
 for(const token of [
  '--dash-bg:#f5f7fb', '--dash-card:#ffffff', '.dashboard-layout',
  '.dashboard-activity', '.activity-panel', '.activity-entry',
  '.activity-source', '.trend-app-charts', '.trend-per-app',
  '.stats>.stat', '.metrics>.metric-card', '.nav.active',
  '.calendar-panel', '.reward-table', '.award-calendar-panel',
  '@media(max-width:760px)', 'position:fixed','position:static'
 ]) assert.ok(css.includes(token),'missing style '+token);
 let depth=0;
 for(const char of css){
  if(char==='{')depth++;
  if(char==='}')depth--;
  assert.ok(depth>=0,'extra closing rule');
 }
 assert.equal(depth,0,'unclosed CSS block');
});

test('Dashboard copy is replaced by functional headings and optional methodology',()=>{
 const overview=read('overview.html');
 assert.match(overview,/<h1>통합 대시보드<\/h1>/);
 assert.match(overview,/<h2>앱별 득표 추이<\/h2>/);
 assert.match(overview,/<h2>투표 목록<\/h2>/);
 assert.match(overview,/<summary>앱별 수집 상세<\/summary>/);
 assert.match(overview,/<details class="method-disclosure"><summary>집계 기준<\/summary>/);
 assert.match(read('awards.html'),/<details class="method-disclosure"><summary>확인 기준<\/summary>/);
 assert.match(read('rewards.html'),/<details class="method-disclosure"><summary>집계 기준<\/summary>/);
 assert.match(read('index.html'),/<h1 id="pageTitle">투표 캘린더<\/h1>/);
});

test('Sidebar small CSS squares are preserved and active navigation is visually distinct',()=>{
 const css=read('dashboard-modern.css');
 assert.match(css,/body\.urban-interface\.modern-interface \.rail,/);
 assert.match(css,/body\.urban-interface\.modern-interface \.sidebar/);
 assert.match(css,/\.nav\.active \.nav-glyph/);
 for(const name of pages){
  const html=read(name);
  const nav=html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0]||'';
  assert.ok((nav.match(/class="nav-glyph"/g)||[]).length>=5,name+' icons');
 }
});

test('Overview dashboard markup has balanced div and aside elements',()=>{
 const html=read('overview.html');
 for(const tag of ['div','aside','main','section','nav']){
  const opens=(html.match(new RegExp('<'+tag+'(?:\\s|>)','g'))||[]).length;
  const closes=(html.match(new RegExp('</'+tag+'>','g'))||[]).length;
  assert.equal(opens,closes,tag+' unbalanced: '+opens+' vs '+closes);
 }
});
