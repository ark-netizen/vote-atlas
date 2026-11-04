'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..','dist',n),'utf8');

test('Dashboard preserves all chart targets while avoiding repeated metric blocks',()=>{
 const html=read('overview.html');
 assert.match(html,/class="trend-kpis"/);
 assert.doesNotMatch(html,/class="trend-quick-stats"/);
 for(const id of ['trendAppCount','trendTopicCount','trendChangeCount','trendSpikeCount'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.doesNotMatch(html,/id="recentSourcesList"/);
 assert.match(html,/class="sources-disclosure"/);
 assert.match(html,/id="sourceCards"/);
});
test('Filtered vote list and calendar share one region',()=>{
 const html=read('overview.html');
 const grid=html.indexOf('class="dashboard-bottom-grid"');
 const calendar=html.indexOf('class="panel calendar"');
 const votes=html.indexOf('class="panel vote-panel"');
 const artists=html.indexOf('id="artists"');
 assert.ok(grid>=0&&grid<calendar&&calendar<votes&&votes<artists);
 for(const id of ['miniCalendar','votes','clearOverviewFilters','clearDay','monthLabel','listCount'])
   assert.ok(html.includes('id="'+id+'"'),id);
});
test('Long vote list is progressive and resets on relevant filter changes',()=>{
 const js=read('overview.js');
 assert.match(js,/visibleVoteLimit=12/);
 assert.match(js,/list\.slice\(0,visibleVoteLimit\)/);
 assert.match(js,/lastVoteFilterKey/);
 assert.match(js,/vote-load-more/);
 assert.match(js,/more\.onclick=/);
 assert.doesNotMatch(js,/list\.slice\(0,500\)/);
});
test('Activity deduplicates actual vote records and retains click-through',()=>{
 const js=read('overview.js');
 assert.match(js,/const seen=new Set\(\)/);
 assert.match(js,/seen\.has\(key\)/);
 assert.match(js,/\.slice\(0,6\)/);
 assert.match(js,/row\.onclick=\(\)=>openDetail\(vote\)/);
 assert.doesNotMatch(js,/recentSourcesList/);
});
test('Award day is visible, while month-wide duplicate is optional',()=>{
 const html=read('awards.html');
 assert.match(html,/<details class="award-month-details">/);
 assert.match(html,/<summary>이달 전체 일정 <span id="awardMonthCount"/);
 assert.match(html,/id="awardDayAgenda"/);
 assert.match(html,/id="awardMonthAgenda"/);
 assert.match(html,/value="exclude-subculture"/);
});
test('Calendar visible page heading follows active view',()=>{
 const js=read('app.js');
 assert.match(js,/\$\('#pageTitle'\)\.textContent=/);
 assert.match(js,/sources:'수집 현황'/);
});
test('Small screens, keyboard focus and sticky reward header supported',()=>{
 const css=read('dashboard-modern.css');
 for(const token of ['.trend-kpis','.dashboard-bottom-grid','.vote-load-more',
 '.award-month-details','.reward-table th{position:sticky',
 '@media(max-width:760px)','@media(min-width:1550px)'])
  assert.ok(css.includes(token),token);
 assert.match(css,/\.vote-load-more:focus-visible/);
});
