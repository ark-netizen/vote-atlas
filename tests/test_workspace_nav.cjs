'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const root=require('node:path').resolve(__dirname,'../dist');
const pages=['overview.html','index.html','rewards.html','awards.html','trend-detail.html'];
const expected=['overview','calendar','list','rewards','awards','trends','artists','sources','collect'];
const names=['통합 대시보드','투표 캘린더','전체 투표','리워드','어워즈·시상식','득표 추이','아티스트 순위','수집 현황','자동 수집 내역'];
test('all five pages show the same WORKSPACE labels, count, sequence and link targets',()=>{
 const baselines=[];
 for(const name of pages){
   const html=fs.readFileSync(root+'/'+name,'utf8');
   const items=[...html.matchAll(/<a\s+class="nav nav-button workspace-menu-item[^"]*"[^>]*data-nav-key="([^"]+)"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span class="workspace-menu-text">([^<]+)<\/span><\/a>/g)];
   assert.equal(items.length,9,name);
   assert.deepEqual(items.map(x=>x[1]),expected,name);
   assert.deepEqual(items.map(x=>x[3]),names,name);
   assert.equal((html.match(/<nav class="workspace-menu"/g)||[]).length,1);
   assert.ok(html.includes('workspace-nav.css'),name);
   assert.ok(html.includes('workspace-nav.js'),name);
   baselines.push(items.map(x=>x[2]));
 }
 for(const hrefs of baselines.slice(1))assert.deepEqual(hrefs,baselines[0]);
});
test('each menu label stays on one line and keeps the same height',()=>{
 const css=fs.readFileSync(root+'/workspace-nav.css','utf8');
 assert.match(css,/white-space:nowrap/);
 assert.match(css,/height:40px/);
 assert.match(css,/text-overflow:ellipsis/);
});
test('direct links to list and sources are supported on the calendar',()=>{
 const js=fs.readFileSync(root+'/app.js','utf8');
 assert.match(js,/const initialView=new URLSearchParams/);
 assert.match(js,/preventDefault/);
 assert.match(js,/setView\(\['calendar','list','sources'\]/);
});
