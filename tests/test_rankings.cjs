'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const rankings=require('../dist/rankings.js');
const event=(id,app,candidates,overrides={})=>({
 id,app,title:'투표 '+id,leader:null,winner:null,result_status:'not_final',
 collected_at:'2026-11-03T14:00:00+09:00',candidates,...overrides
});
test('leader observations, published winners and vote snapshots are separate',()=>{
 const result=rankings.build([
   event('a','muniverse',[{name:'가수 A',rank:1,votes:123},{name:'가수 B',rank:2,votes:50}]),
   event('b','muniverse',[{name:'가수 A',rank:1,votes:300}],{winner:'가수 A',result_status:'published'}),
   event('c','fannstar',[{name:'가수 B',rank:1,votes:900}],{winner:null}),
 ]);
 const a=result.find(r=>r.name==='가수 A');
 assert.equal(a.observedFirsts,2);
 assert.equal(a.finalWins,1);
 assert.equal(a.snapshotVotes,423);
 const b=result.find(r=>r.name==='가수 B');
 assert.equal(b.finalWins,0);
 assert.equal(b.observedFirsts,1);
 assert.equal(b.snapshotVotes,950);
 assert.equal(rankings.sort(result,'snapshotVotes')[0].name,'가수 B');
 assert.equal(rankings.build([event('c','fannstar',[{name:'B',rank:1,votes:100}])],'muniverse').length,0);
});
test('dedupe repeated candidates inside one event and preserve alias distinctions',()=>{
 const result=rankings.build([event('a','x',[
  {name:'  그룹  A ',rank:1,votes:20},{name:'그룹 A',rank:1,votes:20},
  {name:'Group A',rank:1,votes:30}
 ])]);
 assert.equal(result.length,2);
 assert.equal(result.find(x=>x.name==='그룹 A').snapshotVotes,20);
});
test('unknown, invalid or zero votes do not produce false first-place counts',()=>{
 const result=rankings.build([event('a','x',[
  {name:'A',rank:1,votes:null},{name:'B',rank:1,votes:0},
  {name:'C',rank:1,votes:'not-a-number'},{name:'D',rank:1,votes:7}
 ])]);
 assert.equal(result.reduce((sum,r)=>sum+r.observedFirsts,0),1);
});
