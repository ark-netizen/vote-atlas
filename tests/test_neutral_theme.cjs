'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'dist', name), 'utf8');
const pages = ['index.html', 'overview.html', 'rewards.html', 'awards.html'];
const cssFiles = ['style.css', 'overview.css', 'rewards.css', 'awards.css', 'access.css'];

const isNeutral = hex => {
  const value = hex.slice(1).toLowerCase();
  if (value.length === 3 || value.length === 4)
    return value[0] === value[1] && value[1] === value[2];
  if (value.length === 6 || value.length === 8)
    return value.slice(0,2) === value.slice(2,4) &&
      value.slice(2,4) === value.slice(4,6);
  return false;
};

test('Interface colors remain neutral except documented vote-spike highlights', () => {
  const spikeColors = new Set(['#65541d','#ffe56b','#dfc04b','#fff9d9','#ebc43e']);
  for (const file of cssFiles) {
    const css = read(file);
    const colors = css.match(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/g) || [];
    assert.ok(colors.length > 5, file);
    for (const color of colors)
      assert.ok(isNeutral(color) || (file === 'overview.css' && spikeColors.has(color)), file + ': unexplained color ' + color);
  }
});

test('Each workspace menu draws a small CSS square instead of an emoji glyph', () => {
  for (const file of pages) {
    const html = read(file);
    const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, file + ' missing navigation');
    assert.ok((nav.match(/class="nav-glyph"/g) || []).length >= 5, file);
    assert.doesNotMatch(nav, /[◈◇♧▦♛◎↻✳☷]/, file);
    assert.match(nav, /aria-hidden="true"/, file);
  }
  // The unified sidebar no longer renders the redundant workspace card icon.
  assert.doesNotMatch(read('index.html'), /class="workspace-icon"/);
  assert.match(read('style.css'), /\.nav-button>span\.nav-glyph/);
  assert.match(read('overview.css'), /\.rail nav \.nav-glyph/);
});

test('App-sourced colors are overridden without changing source data', () => {
  const css = read('style.css');
  assert.match(css, /--c:#777777!important/);
  assert.match(css, /\.app-filter,\.event-chip/);
  assert.match(read('overview.css'), /\.tag,\.app-name\{color:#565656!important\}/);
  assert.match(read('rewards.css'), /#rewardDetail \.tag\{color:#565656!important\}/);
});

test('Trend chart uses only grayscale series colors', () => {
  const script = read('trend-dashboard.js');
  const m = script.match(/const colors=\[([^\]]+)\]/);
  assert.ok(m);
  const colors = m[1].match(/#[0-9a-fA-F]{6}\b/g) || [];
  assert.ok(colors.length >= 8);
  assert.ok(new Set(colors).size >= 7);
  assert.ok(colors.every(isNeutral));
});

test('Fixed desktop sidebars and mobile header layout are preserved', () => {
  assert.match(read('overview.css'), /\.rail\{position:fixed;inset:0 auto 0 0/);
  assert.match(read('style.css'), /\.sidebar\{width:244px;background:#ffffff;position:fixed/);
  assert.match(read('overview.css'), /@media\(max-width:760px\)\{\.shell\{display:block\}\.rail\{position:static/);
  assert.match(read('style.css'), /@media\(max-width:760px\)\{\.sidebar\{position:static/);
});
