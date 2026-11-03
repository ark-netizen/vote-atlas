'use strict';
// Client-side convenience gate only. Published Pages assets and JSON are public.
(function (root) {
  function b64(bytes) {
    let chars = '';
    for (const byte of bytes) chars += String.fromCharCode(byte);
    return btoa(chars);
  }
  function fromB64(value) {
    const chars = atob(value);
    return Uint8Array.from(chars, ch => ch.charCodeAt(0));
  }
  function newSalt() {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return b64(salt);
  }
  async function derive(password, saltBase64, iterations) {
    if (!crypto || !crypto.subtle) throw new Error('HTTPS 환경이 필요합니다.');
    if (!Number.isInteger(iterations) || iterations < 100000) {
      throw new Error('PBKDF2 반복 횟수가 적절하지 않습니다.');
    }
    if (typeof password !== 'string' || !password) throw new Error('암호가 없습니다.');
    const salt = fromB64(saltBase64);
    if (salt.length !== 16) throw new Error('잘못된 salt');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    return b64(new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
    )));
  }
  function equal(valueA, valueB) {
    if (typeof valueA !== 'string' || typeof valueB !== 'string') return false;
    let diff = valueA.length ^ valueB.length;
    for (let i = 0; i < Math.max(valueA.length, valueB.length); i++) {
      diff |= (valueA.charCodeAt(i) || 0) ^ (valueB.charCodeAt(i) || 0);
    }
    return diff === 0;
  }
  const api = Object.freeze({ b64, fromB64, newSalt, derive, equal });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.VoteAtlasLockCrypto = api;
})(typeof window !== 'undefined' ? window : null);
