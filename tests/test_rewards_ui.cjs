'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const script = fs.readFileSync('dist/rewards.js', 'utf8');
const marker = "['query', 'app', 'type', 'status', 'known', 'sort']";
const cutoff = script.indexOf(marker);
assert.ok(cutoff > 0, 'listeners marker exists');
const inputs = Object.fromEntries(['query', 'app', 'type', 'status', 'known', 'sort']
  .map(key => ['#' + key, {value: key === 'known' ? 'known' : 'all'}]));
inputs['#query'].value = '';
inputs['#sort'].value = 'deadline';
const context = {document: {querySelector: selector => inputs[selector]},
  Intl, Date, URL, console};
vm.createContext(context);
vm.runInContext(script.slice(0, cutoff) + '\n' +
  'globalThis.api={rewardText,rewardTypes,condition,adPlace,adDates,' +
  'dateTimeText,safeLink,filtered,setData:d=>dataset=d};', context);
const api = context.api;

test('Generic reward headings and unknown placeholders are not confirmed rewards', () => {
  assert.equal(api.rewardText({reward: '1위 혜택 안내'}), '');
  assert.equal(api.rewardText({reward: '미확인'}), '');
  assert.equal(api.rewardText({reward: ''}), '');
});
test('Only explicit reward text is classified; ad execution fields stay unknown', () => {
  const example = {
    reward_lines: ['1위 혜택 안내', '삼성역 전광판 광고 송출', '1위 트로피 수여']
  };
  assert.equal(api.rewardText(example), '삼성역 전광판 광고 송출 / 1위 트로피 수여');
  assert.deepEqual(Array.from(api.rewardTypes(api.rewardText(example))), ['advertising', 'trophy']);
  assert.equal(api.condition(example), '1위 (리워드 설명에 명시)');
  assert.equal(api.adPlace(example), '미확인');
  assert.equal(api.adDates(example), '미확인');
});
test('Explicit advertisement location and period take precedence', () => {
  const example = {ad_location: '삼성역', ad_period: '2027-02-01 ~ 2027-02-07'};
  assert.equal(api.adPlace(example), '삼성역');
  assert.equal(api.adDates(example), '2027-02-01 ~ 2027-02-07');
});
test('KST vote date does not fabricate an exact clock time', () => {
  assert.equal(api.dateTimeText(null, '2027-02-01'), '2027-02-01 (시각 미확인)');
  assert.equal(api.dateTimeText(null, null), '미확인');
});
test('Untrusted or missing source URL is never rendered as a clickable link', () => {
  assert.equal(api.safeLink('javascript:alert(1)'), '');
  assert.equal(api.safeLink(''), '');
  assert.equal(api.safeLink('https://example.org/vote'), 'https://example.org/vote');
});
test('Default hides unknown rewards; filters and deadline sort work', () => {
  const events = [
    {id: 'later', app: 'mubeat', title: 'A', reward: '트로피 수여',
      start: '2099-01-01', end: '2099-01-10'},
    {id: 'soon', app: 'my1pick', title: 'B', reward: '지하철 광고',
      start: '2099-01-01', end: '2099-01-03'},
    {id: 'missing', app: 'mubeat', title: 'C', reward: '미확인',
      start: '2099-01-01', end: '2099-01-02'}
  ];
  api.setData({events, sources: [
    {id: 'my1pick', name: '마이원픽'},
    {id: 'mubeat', name: '뮤빗'}]});
  assert.deepEqual(Array.from(api.filtered(), e => e.id), ['soon', 'later']);
  inputs['#known'].value = 'missing';
  assert.deepEqual(Array.from(api.filtered(), e => e.id), ['missing']);
  inputs['#known'].value = 'all';
  inputs['#app'].value = 'mubeat';
  assert.deepEqual(Array.from(api.filtered(), e => e.id), ['missing', 'later']);
  inputs['#app'].value = 'all';
  inputs['#type'].value = 'advertising';
  assert.deepEqual(Array.from(api.filtered(), e => e.id), ['soon']);
});
