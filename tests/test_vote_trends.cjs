'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
globalThis.VoteAtlasSeries=require('../dist/reward-series.js');
const t=require('../dist/vote-trends.js');
const date=(day,id,votes,extra={})=>({
 date:day,app:'muniverse',event_id:id,title:'WEEKLY M PICK 2026년 11월 1주차',
 total_votes:votes,scope:'all_candidates',roster_hash:'same',
 observed_at:day+'T12:23:00+09:00',...extra
});
test('normalizes recurring voting topic without merging apps',()=>{
 const rows=t.normalizeHistory({observations:[
  date('2026-11-02','m1',10),date('2026-11-03','m1',30),
  date('2026-11-03','f1',50,{app:'fannstar',title:'WEEKLY M PICK 2026년 11월 1주차'})]});
 assert.equal(t.groups(rows).length,2);
 assert.equal(rows[0].topic,'WEEKLY M PICK');
});
test('calculates only consecutive within-round increases',()=>{
 const rows=t.normalizeHistory({observations:[
  date('2026-11-01','a',100),date('2026-11-02','a',120),
  date('2026-11-04','a',300),
  date('2026-11-02','new-round',1)]});
 const increases=t.changes(rows);
 assert.equal(increases.length,1);
 assert.equal(increases[0].delta,20);
 assert.equal(increases[0].percent,20);
});
test('cannot mistake roster changes, partial/full switches or vote corrections for growth',()=>{
 const rows=t.normalizeHistory({observations:[
  date('2026-11-01','a',100),
  date('2026-11-02','a',200,{roster_hash:'changed'}),
  date('2026-11-01','b',100),
  date('2026-11-02','b',300,{scope:'visible_candidates'}),
  date('2026-11-01','c',500),
  date('2026-11-02','c',100)]});
 assert.equal(t.changes(rows).length,0);
});
test('detects meaningful relative + absolute spikes and skips ordinary rises',()=>{
 const input=t.normalizeHistory({observations:[
  date('2026-11-01','a',20000),date('2026-11-02','a',35000),
  date('2026-11-01','b',20000),date('2026-11-02','b',21000)]});
 const d=t.changes(input);
 assert.equal(d.length,2);
 assert.equal(d.find(x=>x.event_id==='a').spike,true);
 assert.equal(d.find(x=>x.event_id==='b').spike,false);
 assert.equal(t.groupChanges(input).find(x=>x.date==='2026-11-02').delta,16000);
});
test('invalid/missing observations excluded without implied zero values',()=>{
 const rows=t.normalizeHistory({observations:[
   date('2026-11-01','a',500),
   date('2026-11-02','a',null),
   date('2026-11-03','a',300,{scope:'unknown'})]});
 assert.equal(rows.length,1);
 assert.equal(t.changes(rows).length,0);
});
