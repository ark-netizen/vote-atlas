'use strict';
const test = require('node:test'), assert=require('node:assert/strict');
const g=require('../dist/reward-groups.js');
const vote=(id,title,rewardLines,start,end)=>({
 id,app:'muniverse',title,reward_lines:rewardLines,source_url:'https://www.muniverse.io/votes/'+id,
 collected_at:'2026-11-03T12:00:00+09:00',start,end,
 candidates:[]
});
test('same repeat reward groups across different weeks into one type',()=>{
 const v=[
 vote('a','WEEKLY M PICK 11월 1주차',['1️⃣ 쇼! 음악중심 촬영일 MBC 본사 초대형 실내 전광판 리워드 광고 송출'], '2026-11-01','2026-11-05'),
 vote('b','WEEKLY M PICK 11월 2주차',['1️⃣ 쇼! 음악중심 촬영일 MBC 본사 초대형 실내 전광판 리워드 광고 송출'], '2026-11-08','2026-11-12')
 ];
 const rows=g.group(v);
 assert.equal(rows.length,1);
 assert.equal(rows[0].history.length,2);
});
test('two benefits in one round and change of venue are distinct',()=>{
 const v=[
 vote('a','Weekly',['1️⃣ 쇼! 음악중심 촬영일 MBC 본사 초대형 실내 전광판 리워드 광고 송출','2️⃣ 쇼! 음악중심 촬영일 MBC 본사 옥외 전광판 리워드 광고 송출'], '2026-11-01','2026-11-05')
 ];
 assert.equal(g.group(v).length,2);
});
test('duration rule changes never merge',()=>{
 const v=[
 vote('a','A',['1위 아티스트 강남역 전광판 광고 7일간 송출'],'2026-11-01','2026-11-05'),
 vote('b','B',['1위 아티스트 강남역 전광판 광고 14일간 송출'],'2026-11-08','2026-11-12')
 ];
 assert.equal(g.group(v).length,2);
});
test('confirmed official rules not presented as fabricated individual votes',()=>{
 const x=g.group([],[{id:'linc-live',app:'linc',title:'spotlight',text:'1위 영상 앱 광고 송출',
 condition:'실시간 1위',place:'Charging Station',period_rule:'투표 중 순위 유지',
 source_url:'https://help.stayge.io/en/articles/example',kind:'advertising'}]);
 assert.equal(x.length,1);assert.equal(x[0].history.length,0);assert.equal(x[0].policies.length,1);
});
