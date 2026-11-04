'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const loader = require('../dist/data-loader.js');
const sample = () => ({events: [{id:'vote-1',app:'muniverse'}], sources:[{id:'muniverse'}]});
const page = 'https://ark-netizen.github.io/vote-atlas/index.html';

test('Same-origin GitHub Pages data is preferred and does not call raw GitHub when successful', async () => {
  const calls=[];
  const loaded=await loader.loadEvents({
    baseUrl:page,stamp:123,fetcher:async (url,opts)=>{
      calls.push({url,opts});return {ok:true,json:async()=>sample()};
    }
  });
  assert.equal(loaded.source,'pages');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://ark-netizen.github.io/vote-atlas/data/events.json?v=123');
  assert.equal(calls[0].opts.cache,'no-store');
  assert.deepEqual(loaded.data,sample());
});

test('Retry same-origin failures and use GitHub raw as a last-resort fallback', async () => {
  const urls=[];
  const loaded=await loader.loadEvents({
    baseUrl:page,stamp:456,fetcher:async url=>{
      urls.push(url);
      if(url.includes('raw.githubusercontent.com'))return {ok:true,json:async()=>sample()};
      return {ok:false,status:503};
    }
  });
  assert.equal(urls.length,3);
  assert.match(urls[0],/vote-atlas\/data\/events\.json/);
  assert.match(urls[1],/events\.json\?v=456-retry/);
  assert.match(urls[2],/raw\.githubusercontent\.com\/ark-netizen\/vote-atlas\/main\/dist\/data\/events\.json/);
  assert.equal(loaded.source,'github-backup');
});

test('Invalid JSON/schema is rejected and triggers the other data source', async () => {
  let tries=0;
  const loaded=await loader.loadEvents({
    baseUrl:page,fetcher:async ()=>{
      tries++;
      return {ok:true,json:async()=>tries===1?{events:[],sources:null}:sample()};
    }
  });
  assert.equal(tries,2);
  assert.equal(loaded.source,'pages-retry');
});

test('All failing sources yield an actionable error, never an empty invented dataset', async () => {
  await assert.rejects(
    loader.loadEvents({baseUrl:page,fetcher:async()=>{throw new Error('Network unavailable')}}),
    /Voting data unavailable from both Pages and GitHub raw/
  );
  assert.throws(()=>loader.validate({events:[],sources:{}}),/Invalid voting-data schema/);
});

test('Pages path is resolved against the current site folder rather than domain root', async()=>{
  const urls=[];
  await loader.loadEvents({
    baseUrl:'https://example.org/a/nested/index.html',
    fetcher:async url=>{urls.push(url);return {ok:true,json:async()=>sample()};}
  });
  assert.equal(urls[0].startsWith('https://example.org/a/nested/data/events.json?'),true);
});

test('The calendar entrypoint loads the data loader before the app gate starts app.js',()=>{
  const html=fs.readFileSync('dist/index.html','utf8');
  const app=fs.readFileSync('dist/app.js','utf8');
  assert.ok(html.indexOf('src="data-loader.js"')>=0);
  assert.ok(html.indexOf('src="data-loader.js"')<html.indexOf('src="access-guard.js"'));
  assert.match(app,/VoteAtlasDataLoader\.loadEvents\(\)/);
  assert.doesNotMatch(app,/fetch\('https:\/\/raw\.githubusercontent\.com/);
});

test('Build artifact includes a non-empty voting-data file with the expected structure',()=>{
  const path='dist/data/events.json';
  const stat=fs.statSync(path);
  assert.ok(stat.size>1024,'Published voting-data file must not be missing or truncated');
  const data=JSON.parse(fs.readFileSync(path,'utf8'));
  assert.ok(Array.isArray(data.events));
  assert.ok(Array.isArray(data.sources));
});
