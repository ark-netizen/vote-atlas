'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../dist/cost-calculator.js');
test('413776 votes by 10 Lumi equals 45515360 KRW purchase-equivalent',()=>{
 const r=C.calculate({votes:413776,unitsPerVote:10,bundleUnits:100,bundlePrice:1100,paidShare:100});
 assert.equal(r.totalUnits,4137760);assert.equal(r.equivalent,45515360);
});
test('missing price never returns fake revenue',()=>{
 assert.equal(C.calculate({votes:100,unitsPerVote:3,bundleUnits:'',bundlePrice:'',paidShare:100}),null);
});
test('each program has separate options and mixed series cannot claim one cost',()=>{
 const s={rounds:[
  {vote_cost:{scope:'program',options:[{currency:'팬포인트',units_per_vote:30},{currency:'GEM',units_per_vote:8}]}},
  {vote_cost:{scope:'program',options:[{currency:'팬포인트',units_per_vote:3},{currency:'GEM',units_per_vote:1}]}}
 ]};
 const summary=C.summarizeSeries(s);
 assert.equal(summary.variants.length,2);assert.equal(summary.exact,null);
 assert.match(C.display(s.rounds[0].vote_cost),/30개\/표/);
});
test('vote cost only exact when every round has the same verified cost',()=>{
 const cost={status:'verified_vote_page',options:[{currency:'루미',units_per_vote:10}]};
 assert.ok(C.summarizeSeries({rounds:[{vote_cost:cost},{vote_cost:cost}]}).exact);
 assert.equal(C.summarizeSeries({rounds:[{vote_cost:cost},{}]}).exact,null);
});
test('rainbow star five votes per star is not five stars per vote',()=>{
 assert.match(C.display({options:[{currency:'무지개 별',units_per_vote:0.2,votes_per_unit:5}]}),/1개당 5표/);
});
test('reward screen includes per-app source costs and calculator',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../dist/rewards.html'),'utf8');
 const js=fs.readFileSync(path.resolve(__dirname,'../dist/rewards.js'),'utf8');
 for(const id of ['calcVotes','calcUnits','calcBundlePrice','calcValue','costRuleRows'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/vote_cost/);
 assert.match(js,/renderCostRuleTable/);
});
