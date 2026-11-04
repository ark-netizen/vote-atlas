'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', {value: webcrypto});
const cryptoTools = require('../dist/access-crypto.js');
const read = p => fs.readFileSync(path.join(__dirname, '..', 'dist', p), 'utf8');

test('Temporary preview mode disables the view lock without setting a password', () => {
  const config = JSON.parse(read('access-config.json'));
  assert.equal(config.enabled, false);
  assert.equal(config.version, 1);
  assert.equal(config.salt, '');
  assert.equal(config.verifier, '');
  assert.ok(config.iterations >= 100000);
});
test('PBKDF2 verifier derives reproducibly without putting a password in config', async () => {
  const salt = cryptoTools.newSalt();
  assert.equal(cryptoTools.fromB64(salt).length, 16);
  const value = await cryptoTools.derive('example-only-not-a-production-secret!', salt, 100000);
  const match = await cryptoTools.derive('example-only-not-a-production-secret!', salt, 100000);
  const wrong = await cryptoTools.derive('another-password-not-the-same!', salt, 100000);
  assert.equal(value, match);
  assert.notEqual(value, wrong);
  assert.ok(cryptoTools.equal(value, match));
  assert.equal(cryptoTools.equal(value, wrong), false);
  assert.equal(cryptoTools.equal(value, value.slice(1)), false);
});
test('Every dashboard is hidden and only loads its main JavaScript after guard', () => {
  const pages = [['index.html', 'app.js'], ['overview.html', 'overview.js'], ['rewards.html', 'rewards.js']];
  for (const [page, script] of pages) {
    const html = read(page);
    assert.match(html, /<body class="protected-view(?:\s+[^"]+)?">/);
    assert.ok(html.includes('<link rel="stylesheet" href="access.css">'));
    assert.match(html, /src="access-crypto\.js"/);
    assert.ok(html.includes('src="access-guard.js" data-app-script="' + script + '"'));
    assert.doesNotMatch(html, new RegExp('<script\\s+src="' + script.replace(/\./g, '\\.') + '"'));
  }
});
test('Lock setup page generates verifier locally and links to owner-only GitHub edit', () => {
  const page = read('lock-setup.html');
  assert.match(page, /VoteAtlasLockCrypto\.derive/);
  assert.match(page, /\/edit\/main\/dist\/access-config\.json/);
  assert.match(page, /minlength="12"/);
});
test('Temporary bypass does not fetch config before unlocking', () => {
  const gate = read('access-guard.js');
  assert.ok(gate.includes('const SCREEN_LOCK_TEMPORARILY_OFF = true'));
  assert.ok(gate.indexOf('if (SCREEN_LOCK_TEMPORARILY_OFF)') < gate.indexOf("fetch('access-config.json"));
});
test('Dashboard gate validates configuration before considering browser session', () => {
  const gate = read('access-guard.js');
  assert.ok(gate.indexOf('config.enabled === false') < gate.indexOf('sessionStorage.getItem(sessionKey)'));
  assert.match(gate, /if \(config\.version === 1 && config\.enabled === false\) \{/);
  assert.match(gate, /!config\.salt \|\| !config\.verifier/);
  assert.match(gate, /window\.VoteAtlasLockCrypto\.derive/);
  assert.match(gate, /document\.body\.classList\.remove\('protected-view'\)/);
});
