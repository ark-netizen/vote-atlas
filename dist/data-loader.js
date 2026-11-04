'use strict';
/** Load published voting data from the current GitHub Pages site before trying GitHub raw. */
const VoteAtlasDataLoader = (() => {
  const REMOTE_BACKUP = 'https://raw.githubusercontent.com/ark-netizen/vote-atlas/main/dist/data/events.json';
  function validate(value) {
    if (!value || !Array.isArray(value.events) || !Array.isArray(value.sources)) {
      throw new Error('Invalid voting-data schema: expected events and sources arrays');
    }
    return value;
  }
  async function loadEvents(options = {}) {
    const fetcher = options.fetcher || fetch;
    const baseUrl = options.baseUrl || document.baseURI;
    const stamp = options.stamp === undefined ? Date.now() : options.stamp;
    const local = new URL('data/events.json', baseUrl).href;
    const suffix = (value) => (value.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(String(stamp));
    // Pages already publishes this 1MB+ JSON beside index.html. Keep reads on the
    // same origin to avoid intermittent cross-origin / GitHub raw connection failures.
    const attempts = [
      {source: 'pages', url: local + suffix(local)},
      {source: 'pages-retry', url: local + suffix(local) + '-retry'},
      {source: 'github-backup', url: REMOTE_BACKUP + suffix(REMOTE_BACKUP)}
    ];
    const errors = [];
    for (const attempt of attempts) {
      try {
        const response = await fetcher(attempt.url, {cache: 'no-store'});
        if (!response || !response.ok) {
          throw new Error('HTTP ' + (response && response.status !== undefined ? response.status : 'unavailable'));
        }
        return {data: validate(await response.json()), source: attempt.source};
      } catch (error) {
        errors.push(attempt.source + ': ' + String(error && error.message || error));
      }
    }
    throw new Error('Voting data unavailable from both Pages and GitHub raw (' + errors.join(' | ') + ')');
  }
  return {loadEvents, validate};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VoteAtlasDataLoader;
