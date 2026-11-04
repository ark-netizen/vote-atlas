'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VoteAtlasAwardsCalendar = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
  function isDate(value) {
    if (typeof value !== 'string' || !DATE.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function monthKey(year, month, day) {
    return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  }
  function monthDays(year, month) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2000 || year > 2100 || month < 0 || month > 11) return [];
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const count = Math.ceil((first + last) / 7) * 7;
    return Array.from({length:count}, (_,index) => monthKey(year, month, index + 1 - first));
  }
  function buildSchedule(awards) {
    const result = [];
    for (const award of Array.isArray(awards) ? awards : []) {
      if (!award || !award.id || !award.name) continue;
      const base = {
        award_id:String(award.id),
        award_name:String(award.name),
        category:String(award.category || ''),
        year:award.year,
        platforms:(award.platforms || []).map(p => p.name).filter(Boolean),
      };
      const start = award.event_date;
      const end = award.event_end_date || start;
      if (isDate(start) && isDate(end) && start <= end) {
        result.push({...base, id:award.id+':ceremony',kind:'ceremony',title:'시상식 개최',
          start_date:start,end_date:end,platform:'',source_url:award.event_source_url || award.sources?.[0]?.url || '',
          detail:''});
      }
      for (const [index, period] of (award.voting_periods || []).entries()) {
        if (!isDate(period.start_date) || !isDate(period.end_date) || period.start_date > period.end_date) continue;
        result.push({...base,id:award.id+':vote:'+index,kind:'vote',
          title:String(period.title||'팬 투표'), platform:String(period.platform||'플랫폼 미확인'),
          start_date:period.start_date,end_date:period.end_date,source_url:period.source_url||'',
          detail:String(period.detail||'')});
      }
      for (const [index, point] of (award.voting_milestones || []).entries()) {
        if (!isDate(point.date)) continue;
        result.push({...base,id:award.id+':milestone:'+index,kind:'milestone',
          title:String(point.title||'투표 일정'),platform:String(point.platform||'플랫폼 미확인'),
          start_date:point.date,end_date:point.date,source_url:point.source_url||'',
          detail:String(point.detail||'종료일 미확인')});
      }
    }
    return result.sort((a,b) => a.start_date.localeCompare(b.start_date) || a.award_name.localeCompare(b.award_name,'ko') || a.id.localeCompare(b.id));
  }
  function onDay(item, date) {
    return isDate(date) && item.start_date <= date && date <= item.end_date;
  }
  function overlapsMonth(item,year,month) {
    const start = monthKey(year,month,1);
    const end = monthKey(year,month+1,0);
    return item.start_date <= end && item.end_date >= start;
  }
  function filteredItems(items,kind) {
    if (kind === 'ceremony') return items.filter(x => x.kind === 'ceremony');
    if (kind === 'vote') return items.filter(x => x.kind === 'vote' || x.kind === 'milestone');
    return items;
  }
  return {isDate,monthKey,monthDays,buildSchedule,onDay,overlapsMonth,filteredItems};
});
