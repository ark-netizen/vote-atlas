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
