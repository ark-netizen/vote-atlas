'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const series=require('../dist/reward-series.js');
const rewards=require('../dist/reward-groups.js');
const text=[
 '🏆 1등 리워드 : 쇼! 음악중심 촬영일',
 '1️⃣ 쇼! 음악중심 촬영일 MBC 본사 초대형 실내 전광판 리워드 광고 송출',
 '2️⃣ 쇼! 음악중심 촬영일 MBC 본사 옥외 전광판 리워드 광고 송출'
];
const round=(id,title,votes,complete=true)=>({id,app:'muniverse',title,start:'2026-11-01',end:'2026-11-05',
 reward_lines:text,candidates:[{name:'A',rank:1,votes},{name:'B',rank:2,votes:100}],lineup_complete:complete,
 collected_at:'2026-11-03T14:00:00+09:00',source_url:'https://www.muniverse.io/votes/'+id});
test('month/week and special range normalize to one series',()=>{
 assert.equal(series.seriesTitle('WEEKLY M PICK 2026년 11월 1주차'),'WEEKLY M PICK');
 assert.equal(series.seriesTitle('WEEKLY M PICK 2026년 9월 4주차~10월 2주차'),'WEEKLY M PICK');
 assert.equal(series.seriesTitle('쇼! 음악중심 968회 | STAGE M PICK'),'쇼! 음악중심 | STAGE M PICK');
 assert.equal(series.seriesTitle('쇼! 음악중심 959회 STAGE M PICK'),'쇼! 음악중심 | STAGE M PICK');
});
test('one program aggregates two rounds, retains two distinct rewards and true 1st-place condition',()=>{
 const rows=series.build([
 round('a','WEEKLY M PICK 2026년 10월 5주차',200),
 round('b','WEEKLY M PICK 2026년 11월 1주차',400)
 ],[],rewards);
 assert.equal(rows.length,1);
 assert.equal(rows[0].rounds.length,2);
 assert.equal(rows[0].benefits.length,2);
 assert.ok(rows[0].benefits.every(b=>b.condition==='1위'));
 assert.equal(rows[0].metrics.meanVotes,400); // (300 + 500)/2
 assert.equal(rows[0].metrics.meanParticipants,null);
 assert.ok(rows[0].benefits.every(b=>/송출 일수 미확인/.test(b.period_rule)));
});
test('partial candidates excluded from comparable vote average',()=>{
 const rows=series.build([
 round('a','WEEKLY M PICK 2026년 10월 5주차',300),
 round('b','WEEKLY M PICK 2026년 11월 1주차',99999,false)
 ],[],rewards);
 assert.equal(rows[0].metrics.meanVotes,400);
 assert.equal(rows[0].metrics.knownVoteRounds,1);
 assert.equal(rows[0].metrics.partialVoteRounds,1);
});
test('different monthly editions are not mixed with unrelated event programs',()=>{
 const rounds=[round('a','WEEKLY M PICK 2026년 10월 5주차',250),
 round('b','BIRTHDAY M PICK 2026년 11월',350)];
 assert.equal(series.build(rounds,[],rewards).length,2);
});
