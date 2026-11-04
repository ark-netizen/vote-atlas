'use strict';
// GitHub Pages is publicly readable. This is a deterrent against casual URL access,
// not a security boundary: repository files and JSON remain accessible without auth.
(async function () {
  const current = document.currentScript;
  const appScript = current && current.dataset.appScript;
  const ALLOWED_APPS = new Set(['app.js', 'overview.js', 'rewards.js', 'awards.js']);
  const mount = document.createElement('div');
  mount.id = 'accessScreen';
  document.body.append(mount);
  function el(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value != null) element.textContent = String(value);
    return element;
  }
  const card = el('section', 'access-card');
  const mark = el('div', 'access-mark', 'V·');
  const eyebrow = el('span', 'access-eyebrow', 'VOTE ATLAS · VIEW LOCK');
  const heading = el('h1', '', '대시보드 잠금');
  const description = el('p', '', '이 화면을 열려면 설정된 접근 암호가 필요합니다.');
  const notice = el('p', 'access-error', '');
  const foot = el('p', 'access-note',
    '이 잠금은 웹 화면의 접근을 제한하는 편의 기능입니다. 공개 GitHub 저장소의 JSON이나 소스 파일까지 비공개로 만드는 기능은 아닙니다.');
  card.append(mark, eyebrow, heading, description, notice);
  mount.append(card);
  function setNotice(message) { notice.textContent = message; }
  function unlock() {
    mount.remove();
    document.body.classList.remove('protected-view');
    if (!ALLOWED_APPS.has(appScript)) {
      const block = el('p', '', '허용되지 않은 대시보드 파일입니다.');
      document.body.append(block);
      return;
    }
    const script = document.createElement('script');
    script.src = appScript;
    script.onerror = () => {
      document.body.classList.add('protected-view');
      mount.append(card);
      document.body.append(mount);
      setNotice('대시보드 로딩에 실패했습니다. 페이지를 다시 열어주세요.');
    };
    document.body.append(script);
  }
  // Temporary development preview. Bypass all network/crypto checks, including
  // CORS restrictions in sandboxed previews; lock can be restored later.
  const SCREEN_LOCK_TEMPORARILY_OFF = true;
  if (SCREEN_LOCK_TEMPORARILY_OFF) {
    unlock();
    return;
  }
  let config;
  try {
    const response = await fetch('access-config.json?v=' + Date.now(), {cache: 'no-store'});
    if (!response.ok) throw new Error('잠금 설정을 읽지 못했습니다.');
    config = await response.json();
    // Temporary public preview mode: retain the lock for future re-enablement.
    if (config.version === 1 && config.enabled === false) {
      unlock();
      return;
    }
    if (config.enabled !== true || config.version !== 1 ||
        !Number.isInteger(config.iterations) || config.iterations < 100000) {
      throw new Error('잠금 설정이 올바르지 않습니다.');
    }
  } catch (_error) {
    setNotice('잠금 설정을 확인할 수 없어 내용을 표시하지 않습니다.');
    return;
  }
  if (typeof config.salt !== 'string' || typeof config.verifier !== 'string' ||
      !config.salt || !config.verifier) {
    description.textContent = '접근 암호 등록 전입니다. 관리자가 설정한 뒤 사용할 수 있습니다.';
    const setup = el('a', '', '암호 설정 도구 열기');
    setup.href = 'lock-setup.html';
    card.append(setup, foot);
    setNotice('현재 모든 대시보드 화면은 잠겨 있습니다.');
    return;
  }
  // This session marker can be forged in developer tools, like all client-side checks.
  const sessionKey = 'vote-atlas-gate-' + config.verifier;
  try {
    if (sessionStorage.getItem(sessionKey) === 'unlocked') {
      unlock(); return;
    }
  } catch (_error) { /* private browser: continue with direct password */ }
  const form = el('form', '');
  const label = el('label', '', '접근 암호');
  label.htmlFor = 'accessPassword';
  const field = el('input', '');
  field.id = 'accessPassword';
  field.type = 'password';
  field.autocomplete = 'current-password';
  field.required = true;
  field.placeholder = '암호를 입력하세요';
  const submit = el('button', '', '잠금 해제');
  submit.type = 'submit';
  label.append(field);
  form.append(label, submit);
  card.append(form, foot);
  if (!window.VoteAtlasLockCrypto) {
    setNotice('암호 검증 기능을 불러오지 못했습니다.');
    submit.disabled = true;
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    setNotice('암호 확인 중입니다.');
    try {
      const supplied = await window.VoteAtlasLockCrypto.derive(
        field.value, config.salt, config.iterations
      );
      field.value = '';
      if (window.VoteAtlasLockCrypto.equal(supplied, config.verifier)) {
        try { sessionStorage.setItem(sessionKey, 'unlocked'); } catch (_error) {}
        unlock();
        return;
      }
      setNotice('접근 암호가 일치하지 않습니다.');
      field.focus();
    } catch (_error) {
      setNotice('암호를 확인할 수 없습니다. HTTPS 연결을 확인해주세요.');
    } finally {
      submit.disabled = false;
    }
  });
  field.focus();
})();
