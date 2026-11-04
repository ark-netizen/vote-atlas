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

  // Place one continuous range bar across adjacent dates within each week.
  // Keep ongoing events on the same lane across week boundaries whenever possible.
  function layoutMonthBars(items, year, month) {
    const days = monthDays(year, month);
    const monthStart = monthKey(year, month, 1);
    const monthEnd = monthKey(year, month + 1, 0);
    const valid = (Array.isArray(items) ? items : []).filter(item =>
      item && item.id && isDate(item.start_date) && isDate(item.end_date) &&
      item.start_date <= item.end_date &&
      item.start_date <= monthEnd && item.end_date >= monthStart
    );
    const weeks = [];
    let previousLanes = new Map();
    for (let offset = 0; offset < days.length; offset += 7) {
      const dates = days.slice(offset, offset + 7);
      const weekStart = dates[0], weekEnd = dates[6];
      const active = valid.filter(item =>
        item.start_date <= weekEnd && item.end_date >= weekStart
      ).map(item => {
        const firstDate = [item.start_date, weekStart, monthStart].sort().at(-1);
        const lastDate = [item.end_date, weekEnd, monthEnd].sort()[0];
        return {item, firstDate, lastDate,
          first: dates.indexOf(firstDate), last: dates.indexOf(lastDate)};
      }).filter(entry => entry.first >= 0 && entry.last >= entry.first);
      // Carry-over ranges are assigned first so their lanes don't jump
      // when a different award starts in the next week.
      active.sort((a, b) => {
        const previousA = previousLanes.has(a.item.id), previousB = previousLanes.has(b.item.id);
        if (previousA !== previousB) return previousA ? -1 : 1;
        if (previousA && previousB) return previousLanes.get(a.item.id) - previousLanes.get(b.item.id);
        return a.first - b.first ||
          b.last - a.last ||
          a.item.start_date.localeCompare(b.item.start_date) ||
          String(a.item.id).localeCompare(String(b.item.id));
      });
      const occupied = new Map(), nextLanes = new Map(), segments = [];
      for (const entry of active) {
        const free = lane => {
          const taken = occupied.get(lane) || new Set();
          for (let day = entry.first; day <= entry.last; day++) {
            if (taken.has(day)) return false;
          }
          return true;
        };
        let lane = previousLanes.get(entry.item.id);
        if (lane === undefined || !free(lane)) {
          lane = 0;
          while (!free(lane)) lane++;
        }
        if (!occupied.has(lane)) occupied.set(lane, new Set());
        for (let day = entry.first; day <= entry.last; day++) occupied.get(lane).add(day);
        nextLanes.set(entry.item.id, lane);
        segments.push({
          item:entry.item, lane, first:entry.first, last:entry.last,
          firstDate:entry.firstDate, lastDate:entry.lastDate,
          continuesBefore:entry.item.start_date < entry.firstDate,
          continuesAfter:entry.item.end_date > entry.lastDate
        });
      }
      segments.sort((a,b) => a.lane - b.lane || a.first - b.first || a.item.id.localeCompare(b.item.id));
      weeks.push({dates,segments,laneCount:Math.max(0,...segments.map(s => s.lane + 1))});
      previousLanes = nextLanes;
    }
    return weeks;
  }
  return {isDate,monthKey,monthDays,buildSchedule,onDay,overlapsMonth,filteredItems,layoutMonthBars};
});
