'use strict';
/**
 * Analyze one saved observation per event (not an all-time vote ledger).
 * Artist names are grouped only when normalized literal names match.
 * Do not infer alias/group membership.
 */
const VoteAtlasRankings = (() => {
  const normalizeName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
  const validVotes = value => value !== null && value !== undefined && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  function build(events, appId = 'all') {
    const artists = new Map();
    for (const event of (events || [])) {
      if (appId !== 'all' && event.app !== appId) continue;
      const seenInEvent = new Set();
      for (const candidate of (event.candidates || [])) {
        const name = String(candidate.name || '').trim().replace(/\s+/g, ' ');
        const key = normalizeName(name);
        if (!key || seenInEvent.has(key)) continue;
        seenInEvent.add(key);
        if (!artists.has(key)) artists.set(key, {key, name, entries: [], observedFirsts:0, finalWins:0, snapshotVotes:0, votesKnown:0, voteCount:0});
        const artist = artists.get(key);
        const rank = Number(candidate.rank);
        const observedFirst = rank === 1 && validVotes(candidate.votes) && Number(candidate.votes) > 0;
        const finalWin = observedFirst && Boolean(event.winner) && event.result_status === 'published';
        const votes = validVotes(candidate.votes) ? Number(candidate.votes) : null;
        artist.voteCount++;
        if (votes !== null) {
          artist.votesKnown++;
          artist.snapshotVotes += votes;
        }
        if (observedFirst) artist.observedFirsts++;
        if (finalWin) artist.finalWins++;
        artist.entries.push({
          eventId: String(event.id || ''), app:event.app, title:event.title,
          rank:Number.isFinite(rank) && rank > 0 ? rank : null, votes,
          observedFirst, finalWin, observedAt:event.leader_observed_at || event.collected_at || null,
          end:event.end || null
        });
      }
    }
    return [...artists.values()];
  }
  function sort(artists, sortBy = 'observedFirsts') {
    const options = new Set(['observedFirsts','finalWins','snapshotVotes']);
    const field = options.has(sortBy) ? sortBy : 'observedFirsts';
    return [...artists].sort((a,b) =>
      b[field] - a[field] ||
      b.observedFirsts - a.observedFirsts ||
      b.snapshotVotes - a.snapshotVotes ||
      a.name.localeCompare(b.name, 'ko')
    );
  }
  return {build,sort,normalizeName};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VoteAtlasRankings;
