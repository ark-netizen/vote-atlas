'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const calendar = require('../dist/awards-calendar.js');
test('invalid dates are excluded, including nonexistent Feb 30', () => {
 assert.equal(calendar.isDate('2026-02-30'), false);
 assert.equal(calendar.isDate('2026-11-04'), true);
 assert.equal(calendar.isDate('2026-13-01'), false);
});
test('calendar starts Sunday, spans cross-month and has 35 or 42 days', () => {
 const days = calendar.monthDays(2026,10);
 assert.equal(days[0], '2026-11-01');
 assert.equal(days[days.length-1], '2026-12-05');
 assert.equal(days.length,35);
});
test('structured ceremonies and voting periods appear separately', () => {
 const awards=[{id:'mma',name:'MMA',category:'음악',year:2026,
 event_date:'2026-11-14',event_end_date:'2026-11-15',
 platforms:[{name:'멜론'}],
 voting_periods:[{title:'부문별',platform:'멜론',start_date:'2026-10-30',end_date:'2026-11-13'}]}];
 const items=calendar.buildSchedule(awards);
 assert.equal(items.length,2);
 assert.equal(items.find(x=>x.kind==='ceremony').end_date,'2026-11-15');
 assert.equal(items.filter(x=>calendar.onDay(x,'2026-11-14')).length,1);
 assert.equal(items.filter(x=>calendar.onDay(x,'2026-11-13')).length,1);
 assert.equal(items.filter(x=>calendar.onDay(x,'2026-11-16')).length,0);
});
test('milestone does not imply an unconfirmed vote end date', () => {
 const items=calendar.buildSchedule([{id:'apan',name:'APAN',voting_milestones:[{title:'예선 시작',date:'2026-11-06'}]}]);
 assert.equal(items[0].kind,'milestone');
 assert.equal(calendar.onDay(items[0],'2026-11-06'),true);
 assert.equal(calendar.onDay(items[0],'2026-11-07'),false);
});
test('cross-year votes are shown in both December and January', () => {
 const item=calendar.buildSchedule([{id:'gda',name:'GDA',voting_periods:[{start_date:'2025-12-22',end_date:'2026-01-05'}]}])[0];
 assert.equal(calendar.overlapsMonth(item,2025,11),true);
 assert.equal(calendar.overlapsMonth(item,2026,0),true);
 assert.equal(calendar.overlapsMonth(item,2026,1),false);
});
test('confirmed and unconfirmed date fields are not guessed', () => {
 const events=calendar.buildSchedule([{id:'unknown',name:'미공개',year:2026,platforms:[{name:'유픽'}]},{id:'bad',name:'오류',event_date:'2026-11-40'}]);
 assert.equal(events.length,0);
});
test('vote filter includes milestone but not ceremony', () => {
 const events=[{kind:'ceremony'},{kind:'vote'},{kind:'milestone'}];
 assert.equal(calendar.filteredItems(events,'vote').length,2);
 assert.equal(calendar.filteredItems(events,'ceremony').length,1);
});


test('a multi-day vote is one continuous bar per week, not repeated day chips', () => {
 const item={id:'vote-a',kind:'vote',start_date:'2026-11-03',end_date:'2026-11-12'};
 const weeks=calendar.layoutMonthBars([item],2026,10);
 assert.equal(weeks.length,5);
 assert.deepEqual(weeks[0].segments.map(s=>[s.first,s.last,s.lane,s.continuesBefore,s.continuesAfter]),[[2,6,0,false,true]]);
 assert.deepEqual(weeks[1].segments.map(s=>[s.first,s.last,s.lane,s.continuesBefore,s.continuesAfter]),[[0,4,0,true,false]]);
 assert.equal(weeks.slice(2).flatMap(w=>w.segments).length,0);
});
test('overlapping ranges get separate lanes; separate ranges can share a row',()=>{
 const items=[
  {id:'a',kind:'vote',start_date:'2026-11-02',end_date:'2026-11-05'},
  {id:'b',kind:'vote',start_date:'2026-11-04',end_date:'2026-11-07'},
  {id:'c',kind:'vote',start_date:'2026-11-06',end_date:'2026-11-07'}
 ];
 const week=calendar.layoutMonthBars(items,2026,10)[0];
 const byId=Object.fromEntries(week.segments.map(s=>[s.item.id,s]));
 assert.notEqual(byId.a.lane,byId.b.lane);
 assert.equal(byId.c.lane,byId.a.lane);
 assert.equal(week.laneCount,2);
});
test('long-running ranges retain the same lane across weeks even with new entries',()=>{
 const items=[
  {id:'long',start_date:'2026-11-02',end_date:'2026-11-23'},
  {id:'short',start_date:'2026-11-08',end_date:'2026-11-12'},
  {id:'another',start_date:'2026-11-15',end_date:'2026-11-19'}
 ];
 const weeks=calendar.layoutMonthBars(items,2026,10);
 const lanes=weeks.slice(0,4).flatMap(w=>w.segments.filter(s=>s.item.id==='long').map(s=>s.lane));
 assert.deepEqual(lanes,[0,0,0,0]);
});
test('cross-month ranges clip to the displayed month without losing continuation markers',()=>{
 const items=[
  {id:'from-oct',kind:'vote',start_date:'2026-10-27',end_date:'2026-11-04'},
  {id:'into-dec',kind:'vote',start_date:'2026-11-29',end_date:'2026-12-04'}
 ];
 const weeks=calendar.layoutMonthBars(items,2026,10);
 const first=weeks[0].segments.find(s=>s.item.id==='from-oct');
 const last=weeks.at(-1).segments.find(s=>s.item.id==='into-dec');
 assert.deepEqual([first.first,first.last,first.firstDate,first.lastDate,first.continuesBefore,first.continuesAfter],
 [0,3,'2026-11-01','2026-11-04',true,false]);
 assert.deepEqual([last.first,last.last,last.firstDate,last.lastDate,last.continuesBefore,last.continuesAfter],
 [0,1,'2026-11-29','2026-11-30',false,true]);
});
test('a one-day award stays a single-slot bar, and filtering removes unwanted types',()=>{
 const schedules=[
  {id:'ceremony',kind:'ceremony',start_date:'2026-11-07',end_date:'2026-11-07'},
  {id:'vote',kind:'vote',start_date:'2026-11-07',end_date:'2026-11-09'}
 ];
 const all=calendar.layoutMonthBars(schedules,2026,10);
 const single=all[0].segments.find(s=>s.item.id==='ceremony');
 assert.deepEqual([single.first,single.last,single.continuesBefore,single.continuesAfter],[6,6,false,false]);
 const vote=calendar.layoutMonthBars(calendar.filteredItems(schedules,'vote'),2026,10);
 assert.equal(vote.flatMap(w=>w.segments).some(s=>s.item.id==='ceremony'),false);
});
