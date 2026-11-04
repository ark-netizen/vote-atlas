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

test('1st, incorrect 2st, 3rd, 4th share one program if the reward remains the same',()=>{
 const titles=[
  '[결선투표] it’s Live BEST PICK - 1st',
  '[결선투표] it’s Live BEST PICK - 2st',
  '[결선투표] it’s Live BEST PICK - 3rd',
  '[예선투표] it’s Live BEST PICK - 1st',
  '[예선투표] it’s Live BEST PICK - 2nd',
  '[예선투표] it’s Live BEST PICK - 3st',
  '[예선투표] it’s Live BEST PICK - 4th'
 ];
 const events=titles.map((title,i)=>({
  id:String(i),app:'muniverse',title,start:'2026-08-01',end:'2026-08-06',
  reward:i===6?'최종 1위 아티스트에게 트로피 수여\n→ it’s Live BEST PICK 실물 트로피 수여':'최종 1위 아티스트에게 트로피 수여',
  candidates:[{name:'가수',rank:1,votes:i+1}],
  lineup_complete:true,source_url:'https://www.muniverse.io/votes/test'+i
 }));
 const result=series.build(events,[],rewards);
 assert.equal(result.length,1);
 assert.equal(result[0].title,'it’s Live BEST PICK');
 assert.equal(result[0].rounds.length,7);
 assert.equal(result[0].benefits.length,1);
 assert.equal(result[0].benefits[0].condition,'1위');
 assert.deepEqual(result[0].stageMetrics.map(s=>[s.name,s.rounds]),[['결선',3],['예선',4]]);
});
test('same program but truly changed benefit or duration stays separate',()=>{
 const events=[
  {...round('a','[결선투표] it’s Live BEST PICK - 1st',200),reward:'최종 1위 아티스트에게 트로피 수여',reward_lines:[]},
  {...round('b','[결선투표] it’s Live BEST PICK - 2nd',300),reward:'최종 1위 강남역 전광판 광고 7일간 송출',reward_lines:[]}
 ];
 const result=series.build(events,[],rewards);
 assert.equal(result.length,2);
 assert.equal(result[0].rounds.length,1);
 assert.ok(result.every(row=>row.rewardVariantLabel));
 assert.ok(result.some(row=>row.benefits[0].period_rule==='7일간'));
});

test('median resists a single high-volume round and uses all confirmed rounds',()=>{
 const values=[100,120,130,140,150,160,170,180,190,200,210,220,20000];
 const events=values.map((votes,i)=>({id:'outlier-'+i,
   candidates:[{name:'A',rank:1,votes}],lineup_complete:true}));
 const m=series.metric(events);
 assert.equal(m.knownVoteRounds,13);
 assert.equal(m.medianVotes,170);
 assert.equal(m.meanVotes,1690);
});
test('even-sized samples use the arithmetic midpoint of two middle values',()=>{
 const m=series.metric([1,2,3,4].map((votes,i)=>({
   id:'middle-'+i,candidates:[{name:'A',votes}],lineup_complete:true,
 })));
 assert.equal(m.meanVotes,3); // rounded 2.5, legacy mean rounding retained
 assert.equal(m.medianVotes,2.5); // exact median of [1,2,3,4]
});
test('missing and partial votes are excluded from both central tendency estimates',()=>{
 const complete=votes=>({candidates:[{name:'A',votes}],lineup_complete:true});
 const partial=votes=>({candidates:[{name:'A',votes}],lineup_complete:false});
 const m=series.metric([complete(100),complete(300),partial(100000),{candidates:[],lineup_complete:true}]);
 assert.equal(m.knownVoteRounds,2);
 assert.equal(m.partialVoteRounds,1);
 assert.equal(m.meanVotes,200);
 assert.equal(m.medianVotes,200);
 assert.equal(m.avgPartialMinimum,100000);
 assert.equal(m.medianPartialMinimum,100000);
 const missing=series.metric([{candidates:[],lineup_complete:false}]);
 assert.equal(missing.meanVotes,null);
 assert.equal(missing.medianVotes,null);
 assert.equal(missing.meanParticipants,null);
 assert.equal(missing.medianParticipants,null);
});
test('participant medians use the same known participant observations and never substitute vote totals',()=>{
 const m=series.metric([
   {participant_count:20,candidates:[]},
   {participant_count:50,candidates:[]},
   {participant_count:500,candidates:[]},
   {candidates:[{name:'A',votes:600}],lineup_complete:true},
 ]);
 assert.equal(m.knownParticipantRounds,3);
 assert.equal(m.meanParticipants,190);
 assert.equal(m.medianParticipants,50);
 assert.equal(m.knownVoteRounds,1);
 assert.equal(m.medianVotes,600);
});
test('separately aggregated prelim/final stages each have their own vote medians',()=>{
 const rounds=[
   {id:'pre1',app:'muniverse',title:'[예선투표] it’s Live BEST PICK - 1st',start:'2026-01-01',
     end:'2026-01-02',reward:'최종 1위 아티스트에게 트로피 수여',
     candidates:[{name:'A',votes:100}],lineup_complete:true},
   {id:'pre2',app:'muniverse',title:'[예선투표] it’s Live BEST PICK - 2nd',start:'2026-01-03',
     end:'2026-01-04',reward:'최종 1위 아티스트에게 트로피 수여',
     candidates:[{name:'A',votes:1000}],lineup_complete:true},
   {id:'fin1',app:'muniverse',title:'[결선투표] it’s Live BEST PICK - 1st',start:'2026-01-05',
     end:'2026-01-06',reward:'최종 1위 아티스트에게 트로피 수여',
     candidates:[{name:'A',votes:700}],lineup_complete:true},
 ];
 const row=series.build(rounds,[],rewards)[0];
 const stages=Object.fromEntries(row.stageMetrics.map(s=>[s.name,s.metrics]));
 assert.equal(stages['예선'].medianVotes,550);
 assert.equal(stages['예선'].meanVotes,550);
 assert.equal(stages['결선'].medianVotes,700);
 assert.equal(row.metrics.medianVotes,700);
});
test('reward list and detail show median alongside every average indicator',()=>{
 const fs=require('node:fs');
 const js=fs.readFileSync('dist/rewards.js','utf8');
 const html=fs.readFileSync('dist/rewards.html','utf8');
 assert.match(html,/평균·중앙값 득표 규모/);
 assert.match(js,/medianVotes/);
 assert.match(js,/medianParticipants/);
 assert.match(js,/중앙값 득표 \(수집 시점\)/);
 assert.match(js,/중앙값 실제 참여자 수/);
 assert.match(js,/중앙값 득표'/);
});
