'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('dist/rewards.html','utf8');
const css=fs.readFileSync('dist/rewards-cost.css','utf8');
const script=fs.readFileSync('dist/rewards.js','utf8');

test('Calculator is no longer inside the stats container or page content flow',()=>{
 const statStart=html.indexOf('<section class="stats reward-stats"');
 const statEnd=html.indexOf('</section>',statStart);
 const calculator=html.indexOf('<aside id="voteCalcPanel"');
 const mainEnd=html.indexOf('</main>');
 assert.ok(statStart>-1&&statEnd>statStart);
 assert.ok(calculator>mainEnd,'calculator must be outside page layout');
 assert.doesNotMatch(html,/reward-analysis-row/);
 assert.ok(html.indexOf('<section class="panel reward-panel">')<calculator);
 assert.match(css,/\.vote-calc-panel\s*\{[\s\S]*?position:fixed/);
 assert.doesNotMatch(css,/\.reward-analysis-row/);
});

test('All calculator inputs and calculated outputs are preserved, exactly once',()=>{
 for(const id of [
  'calcVotes','calcCurrency','calcUnits','calcBundleUnits','calcBundlePrice',
  'calcPaidShare','calcTotalUnits','calcUnitPrice','calcValue','calcPaidValue',
  'calcCostStatus','calcContext'
 ]){
  const matches=html.match(new RegExp('id="'+id+'"','g'))||[];
  assert.equal(matches.length,1,'lost or duplicated '+id);
 }
 for(const id of ['countKnown','countActive','countSoon','countUnknown'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/src="cost-calculator\.js"/);
 assert.match(script,/VoteAtlasCost\.calculate\(fields\)/);
});

test('Fixed side panel can be opened and closed with accessible controls',()=>{
 for(const id of ['openVoteCalc','closeVoteCalc','voteCalcPanel','voteCalcBackdrop'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="openVoteCalc"[^>]*aria-controls="voteCalcPanel"[^>]*aria-expanded="false"/);
 assert.match(html,/id="voteCalcPanel"[^>]*tabindex="-1" hidden/);
 assert.match(html,/id="closeVoteCalc" aria-label="계산기 닫기"/);
 assert.match(css,/\.vote-calc-panel\[hidden\]\{display:none!important\}/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(script,/function openVoteCalc\(trigger\)/);
 assert.match(script,/function closeVoteCalc\(\)/);
 assert.match(script,/event\.key==='Escape'/);
 assert.match(script,/voteCalcLastFocus/);
 assert.match(script,/focus\(\{preventScroll:true\}\)/);
});

test('The row-level currency apply button updates values and opens the drawer, not page scrolling',()=>{
 assert.match(script,/function selectCostForCalc\(series,option,context\)/);
 const start=script.indexOf('function selectCostForCalc(');
 const end=script.indexOf('function renderCostRuleTable()',start);
 const section=script.slice(start,end);
 assert.match(section,/runCurrencyCalculator\(\)/);
 assert.match(section,/openVoteCalc\(\)/);
 assert.doesNotMatch(section,/scrollIntoView/);
 assert.match(script,/className\s*=\s*className|const element\s*=/);
 assert.match(script,/element\('button','vote-cost-apply','환산'\)/);
});

test('Panel is contained on mobile and does not cover desktop sidebar by default',()=>{
 assert.match(css,/width:min\(420px,calc\(100vw - 32px\)\)/);
 assert.match(css,/\.vote-calc-backdrop:not\(\[hidden\]\)/);
 assert.match(css,/\.vote-calc-panel\{width:100vw;max-width:100vw\}/);
 assert.match(css,/\.reward-stats\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/\.reward-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});


test('Opening the right dock reserves width for the reward table rather than covering records',()=>{
 assert.match(css,/--vote-calc-dock-width:clamp\(280px,30vw,390px\)/);
 assert.match(css,/@media\(min-width:761px\)/);
 assert.match(css,/body\.urban-interface\.modern-interface\.calc-drawer-open \.main\s*\{/);
 assert.match(css,/margin-right:var\(--vote-calc-dock-width\)/);
 assert.match(css,/\.vote-calc-panel\s*\{\s*width:var\(--vote-calc-dock-width\)/);
 assert.match(script,/document\.body\.classList\.add\('calc-drawer-open'\)/);
 assert.match(script,/document\.body\.classList\.remove\('calc-drawer-open'\)/);
 assert.match(css,/\.calc-drawer-open \.reward-stats/);
});

test('On mobile calculator occupies its own full screen with an explicit close button',()=>{
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.calc-drawer-open\{overflow:hidden\}/);
 assert.match(css,/\.vote-calc-panel\{width:100vw;max-width:100vw\}/);
 assert.match(html,/id="closeVoteCalc" aria-label="계산기 닫기"/);
});
