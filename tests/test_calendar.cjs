'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cal = require('../dist/calendar-utils.js');
const vote = {start:'2026-10-30',end:'2026-11-05'};
test('includes every start-to-deadline day, across month boundary',()=>{
  for(const date of ['2026-10-30','2026-10-31','2026-11-01','2026-11-03','2026-11-05'])
    assert.equal(cal.onDay(vote,date),true,date);
  for(const date of ['2026-10-29','2026-11-06'])assert.equal(cal.onDay(vote,date),false,date);
});
test('start and end only remain available as optional modes',()=>{
  assert.equal(cal.onDay(vote,'2026-10-30','start'),true);
  assert.equal(cal.onDay(vote,'2026-11-01','start'),false);
  assert.equal(cal.onDay(vote,'2026-11-05','end'),true);
  assert.equal(cal.onDay(vote,'2026-11-03','end'),false);
});
test('month overlap counts cross-month votes once',()=>{
  assert.equal(cal.overlapsMonth(vote,2026,9),true);
  assert.equal(cal.overlapsMonth(vote,2026,10),true);
  assert.equal(cal.overlapsMonth(vote,2026,11),false);
  assert.equal(cal.overlapsMonth(vote,2026,9,'end'),false);
});
test('same day vote and year boundary',()=>{
  const same={start:'2026-11-03',end:'2026-11-03'};
  assert.equal(cal.onDay(same,'2026-11-03'),true);
  const split={start:'2026-12-31',end:'2027-01-02'};
  assert.equal(cal.onDay(split,'2027-01-01'),true);
  assert.equal(cal.overlapsMonth(split,2027,0),true);
});
test('unknown or inverted dates are not shown as valid',()=>{
  assert.equal(cal.onDay({start:'2026-11-15',end:'2026-11-10'},'2026-11-12'),false);
  assert.equal(cal.onDay({},'2026-11-03'),false);
  assert.equal(cal.onDay(vote,'2026-13-01'),false);
});
test('status relative to Seoul calendar day',()=>{
  assert.equal(cal.state(vote,'2026-11-03'),'active');
  assert.equal(cal.state(vote,'2026-10-29'),'upcoming');
  assert.equal(cal.state(vote,'2026-11-06'),'ended');
});
