'use strict';
/* All comparisons use YYYY-MM-DD dates already converted to KST by the collectors. */
const VoteAtlasCalendar = (() => {
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
  const rangeOk = e => valid(e?.start) && valid(e?.end) && e.start <= e.end;
  function onDay(event, date, mode='range') {
    if (!rangeOk(event) || !valid(date)) return false;
    if(mode==='start') return event.start === date;
    if(mode==='end') return event.end === date;
    return event.start <= date && date <= event.end;
  }
  function overlapsMonth(event, year, month, mode='range') {
    if (!rangeOk(event) || !Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) return false;
    const first = String(year).padStart(4,'0')+'-'+String(month+1).padStart(2,'0')+'-01';
    const last = new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10);
    if(mode==='start') return event.start >= first && event.start <= last;
    if(mode==='end') return event.end >= first && event.end <= last;
    return event.start <= last && event.end >= first;
  }
  function state(event,today) {
    if (!rangeOk(event) || !valid(today)) return 'unknown';
    if (event.end < today) return 'ended';
    if (event.start > today) return 'upcoming';
    return 'active';
  }
  return {onDay,overlapsMonth,state,rangeOk};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VoteAtlasCalendar;
