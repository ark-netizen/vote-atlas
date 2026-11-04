'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname,'..','dist',name),'utf8');
const pages = [
 ['overview.html','overview.css','01 / INTELLIGENCE DESK'],
 ['rewards.html','rewards.css','02 / REWARD DIRECTORY'],
 ['awards.html','awards.css','03 / AWARDS INDEX'],
 ['index.html','style.css','04 / VOTING CALENDAR'],
 ['trend-detail.html','overview.css','01 / VOTE TREND DETAIL']
];

test('All four pages opt into the editorial design and use an information masthead',()=>{
 for(const [name,source,label] of pages){
  const html=read(name);
  assert.match(html, /class="protected-view urban-interface"/,name);
  assert.match(html, /class="urban-utility"/,name);
  assert.ok(html.includes(label),name+' missing desk label');
  const sourcePosition=html.indexOf('href="'+source+'"');
  const urbanPosition=html.indexOf('href="urban.css"');
  assert.ok(urbanPosition>sourcePosition,name+' layout overrides must load last');
  assert.ok(html.includes('src="access-guard.js"'),name+' gate must remain wired');
 }
});

test('The urban design changes structure, component shapes and navigation rather than only colors',()=>{
 const css=read('urban.css');
 for(const token of [
   'position:fixed','--urban-display','font:700 clamp(',
   '.urban-utility','grid-template-columns:repeat(5,minmax(0,1fr))',
   '.stats>.stat:first-child','.metrics>:first-child','.panelhead',
   '.reward-table thead','.award-calendar-panel','.trend-chart-card'
 ])assert.ok(css.includes(token),'missing design transformation '+token);
 assert.match(css,/body\.urban-interface \.sidebar,\s*body\.urban-interface \.rail/);
 assert.match(css,/\.urban-interface \.nav-button\.active/);
 assert.match(css,/\.urban-interface \.nav-button>span\.nav-glyph/);
 assert.match(css, /@media\(max-width:760px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/\.trend-spike-badge/);
});

test('Urban stylesheet has balanced rules and keeps editor background monochrome',()=>{
 const css=read('urban.css');
 let depth=0;
 for(const char of css){
  if(char==='{')depth++;
  if(char==='}')depth--;
  assert.ok(depth>=0,'unexpected closing brace');
 }
 assert.equal(depth,0,'unclosed stylesheet block');
 for(const color of ['#f3f3f3','#ffffff','#191919','#1b1b1b','#dddddd']){
  assert.ok(css.includes(color),'missing neutral theme token: '+color);
 }
 assert.ok(css.length>12000,'must be a substantive redesign');
});

test('Workspace navigation retains functional DOM and CSS squares, no fragile glyphs',()=>{
 for(const [name] of pages){
  const html=read(name);
  const nav=html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav,name+' nav missing');
  assert.ok((nav.match(/class="nav-glyph"/g)||[]).length>=5,name);
  assert.doesNotMatch(nav,/[◈◇♧▦♛◎↻✳☷]/);
 }
 assert.match(read('urban.css'),/border:1px solid #8b8b8b/);
});
