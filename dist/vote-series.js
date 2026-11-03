'use strict';
/**
 * Voting series: one row per recurring voting project, not one per reward.
 * Reward variants and each voting round remain independently traceable.
 * No participant numbers are derived from votes.
 */
const VoteAtlasSeries = (() => {
  const norm = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,' ').trim();
  const tidy = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const numeric = value => (value !== null && value !== undefined && value !== '' &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0) ? Number(value) : null;
  function seriesName(event) {
    const title = tidy(event.title);
    if (/weekly\s*m\s*pick/i.test(title)) return 'WEEKLY M PICK';
    if (/birthday\s*m\s*pick/i.test(title)) return 'BIRTHDAY M PICK';
    if (/show\s*music\s*core|쇼!\s*음악중심/i.test(title)) {
      const type=title.split('|').slice(1).join('|').trim();
      if(type) return '쇼! 음악중심 | '+type.replace(/\s*\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}주차)?\s*$/,'').trim();
    }
    if (/it.?s\s*live\s*best\s*pick/i.test(title)) {
      const stage=/결선/.test(title)?' | 결선':/예선/.test(title)?' | 예선':'';
      return "it's Live BEST PICK"+stage;
    }
    if (/come\s*back\s*spotlight/i.test(title)) return 'Comeback SPOTLIGHT';
    const withoutDate = title
      .replace(/\s*20\d{2}년\s*\d{1,2}월(?:\s*\d{1,2}주차)?(?:\s*~\s*\d{1,2}월\s*\d{1,2}주차)?/g,'')
      .replace(/\s*(?:20\d{2}\s*[./-]\s*)?\d{1,2}\s*[./-]\s*\d{1,2}\s*~\s*\d{1,2}\s*[./-]\s*\d{1,2}/g,'')
      .replace(/(?<!\w)\d+(?:st|nd|rd|th)\b/gi,'')
      .replace(/\s*\d{1,4}회(?:차)?\b/g,'')
      .trim().replace(/[\s\-·|]+$/g,'').trim();
    return withoutDate || title || '이름 미확인 투표';
  }
  function policySeriesName(policy) {
    const title = tidy(policy.title || policy.id);
    if (/spotlight/i.test(title)) return 'Comeback SPOTLIGHT';
    if (/방청 이벤트/.test(title)) return '쇼! 음악중심 방청 이벤트';
    if (/생일 투표/.test(title)) return '생일 투표';
    if (/MAMA/i.test(title)) return 'MAMA 이벤트';
    return title.split(/\s*[·|]\s*/)[0] || title;
  }
  function eventScale(event) {
    const candidates=Array.isArray(event.candidates)?event.candidates:[];
    const participants=numeric(event.participant_count ?? event.participantCount ?? event.unique_participants);
    const sampleVotes=event.lineup_complete===true && candidates.length>0 &&
      candidates.every(c=>numeric(c.votes)!==null) ?
      candidates.reduce((sum,c)=>sum+numeric(c.votes),0) : null;
    return {
      votes:sampleVotes,
      candidates: candidates.length || null,
      participants,
      observedAt:event.collected_at || null
    };
  }
  function durationKey(rule) {
    const str=norm(rule);
    if(!str) return '미확인';
    const match=str.match(/(\d{1,3})\s*(?:일간|일 동안|days?)/);
    if(match) return match[1]+'일간';
    if(/촬영일/.test(str)) return '방송 촬영일 · 송출 일수 미확인';
    return str.replace(/\([^)]*\)/g,'').trim() || '미확인';
  }
  function aggregate(events) {
    const entries = events.map(eventScale);
    const valid = entries.filter(x=>x.votes!==null);
    const people = entries.filter(x=>x.participants!==null);
    const candidateCounts=entries.filter(x=>x.candidates!==null);
    const average = (list,key) => list.length ? Math.round(list.reduce((t,x)=>t+x[key],0)/list.length):null;
    return {
      rounds:events.length,
      observedVoteAverage:average(valid,'votes'),
      observedVoteSamples:valid.length,
      observedVoteMin:valid.length ? Math.min(...valid.map(x=>x.votes)):null,
      observedVoteMax:valid.length ? Math.max(...valid.map(x=>x.votes)):null,
      uniqueParticipantAverage:average(people,'participants'),
      participantSamples:people.length,
      candidateAverage:average(candidateCounts,'candidates'),
      candidateSamples:candidateCounts.length
    };
  }
  function build(events,policies=[],rewardCatalog){
    const map=new Map();
    const ensure=(app,title)=>{
      const name=tidy(title);
      const key=app+'|'+norm(name);
      if(!map.has(key)) map.set(key,{
        id:key,app,title:name,events:[],policies:[],rewards:[],scale:null,latestObservedAt:null
      });
      return map.get(key);
    };
    for(const event of events||[]){
      if(!event?.app || !event?.id)continue;
      const series=ensure(event.app,seriesName(event));
      if(!series.events.some(e=>e.id===event.id))series.events.push(event);
    }
    for(const policy of policies||[]){
      if(policy?.unconfirmed_reward||!policy?.app ||!policy?.id)continue;
      const series=ensure(policy.app,policySeriesName(policy));
      if(!series.policies.some(p=>p.id===policy.id))series.policies.push(policy);
    }
    for(const series of map.values()){
      series.events.sort((a,b)=>String(b.end||'').localeCompare(String(a.end||'')));
      series.scale=aggregate(series.events);
      const initial=rewardCatalog.group(series.events,series.policies);
      const variants=new Map();
      for(const reward of initial){
        const sig=[
          rewardCatalog.signatureText(reward.text),
          norm(reward.place),norm(reward.condition),durationKey(reward.period_rule||reward.period_text)
        ].join('|');
        if(!variants.has(sig)) variants.set(sig,{
          ...reward,history:[],policies:[],periodRules:[],periodTexts:[],sourceUrls:[],
          durationKey:durationKey(reward.period_rule||reward.period_text)
        });
        const one=variants.get(sig);
        for(const history of reward.history||[]){
          if(!one.history.some(h=>h.event_id===history.event_id))one.history.push(history);
        }
        for(const p of reward.policies||[]){
          if(!one.policies.some(q=>q.id===p.id))one.policies.push(p);
        }
        for(const part of [reward.period_rule,reward.period_text]){
          const key=part===reward.period_rule?'periodRules':'periodTexts';
          if(part&&!one[key].includes(part))one[key].push(part);
        }
        if(reward.source_url&&!one.sourceUrls.includes(reward.source_url))one.sourceUrls.push(reward.source_url);
      }
      series.rewards=[...variants.values()];
      series.latestObservedAt=series.events.reduce((best,e)=>String(e.collected_at||'')>best?String(e.collected_at):best,
        series.policies.reduce((best,p)=>String(p.checked_at||'')>best?String(p.checked_at):best,''));
    }
    return [...map.values()];
  }
  return {build,seriesName,policySeriesName,eventScale,aggregate,durationKey};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoteAtlasSeries;
