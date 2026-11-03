'use strict';
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const test = require('node:test');
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', {value: webcrypto});
const cryptoTools = require('../dist/access-crypto.js');
const html = readFileSync(join(__dirname, '../dist/lock-setup.html'), 'utf8');
const matches = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(matches.length > 0, 'setup page contains an inline generator');
const inline = matches.at(-1)[1];

function mockSetup({secure = true, sharedTool = false} = {}) {
  const keys = ['setupForm', 'status', 'setupHelp', 'password', 'confirm',
    'generate', 'result', 'configOut', 'copy'];
  const elements = Object.fromEntries(keys.map(key => [key, {
    id: key, textContent: '', value: '', hidden: true, disabled: false,
    listeners: {}, addEventListener(type, callback) {this.listeners[type] = callback;}
  }]));
  const browser = {
    isSecureContext: secure,
    crypto: secure ? webcrypto : undefined,
    ...(sharedTool ? {VoteAtlasLockCrypto: cryptoTools} : {})
  };
  const context = {
    window: browser, navigator: {clipboard: {writeText: async () => {}}},
    document: {getElementById: id => elements[id]},
    TextEncoder, Uint8Array, btoa, atob, Array, JSON, Error
  };
  runInNewContext(inline, context, {filename: 'lock-setup-inline.js'});
  async function submit(pass, confirm = pass) {
    elements.password.value = pass;
    elements.confirm.value = confirm;
    await elements.setupForm.listeners.submit({preventDefault() {}});
  }
  return {elements, submit};
}

test('Browser generates compatible PBKDF2 config with shared helper', async () => {
  const {elements, submit} = mockSetup({sharedTool: true});
  const pass = 'local-test-passphrase-67890';
  await submit(pass);
  const config = JSON.parse(elements.configOut.textContent);
  assert.equal(config.version, 1);
  assert.equal(config.enabled, true);
  assert.equal(config.iterations, 200000);
  assert.equal(config.salt.length, 24);
  assert.equal(await cryptoTools.derive(pass, config.salt, config.iterations), config.verifier);
  assert.equal(elements.result.hidden, false);
  assert.equal(elements.password.value, '');
});

test('Setup works even if shared helper did not load (inline fallback)', async () => {
  const {elements, submit} = mockSetup();
  const pass = 'local-test-passphrase-99999';
  await submit(pass);
  const config = JSON.parse(elements.configOut.textContent);
  assert.equal(await cryptoTools.derive(pass, config.salt, config.iterations), config.verifier);
  assert.equal(elements.result.hidden, false);
});

test('In insecure context, setup displays specific failure and direct HTTPS link', async () => {
  const {elements, submit} = mockSetup({secure: false});
  await submit('local-test-passphrase-56789');
  assert.equal(elements.result.hidden, true);
  assert.equal(elements.setupHelp.hidden, false);
  assert.match(elements.status.textContent, /보안 연결/);
  assert.match(html, /https:\/\/ark-netizen\.github\.io\/vote-atlas\/lock-setup\.html/);
});

test('Password mismatch is rejected before hashing', async () => {
  const {elements, submit} = mockSetup();
  await submit('local-test-passphrase-56789', 'another-passphrase-00000');
  assert.equal(elements.result.hidden, true);
  assert.match(elements.status.textContent, /두 암호가 다릅니다/);
});
