'use strict';
/** Vote programs are the primary entities; different months/weeks/episodes are observations. */
const VoteAtlasSeries = (() => {
  const plain=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const norm=s=>plain(s).toLocaleLowerCase('ko-KR');
  function seriesTitle(title){
    let x=plain(title);
    // Retain rounds like prelim/final, channel and named artist editions. Remove ONLY dates/episodes.
    x=x.replace(/20\d{2}\s*년\s*\d{1,2}\s*월\s*(?:\d{1,2}\s*주\s*차)?/g,'')
      .replace(/\d{1,2}\s*월\s*\d{1,2}\s*주\s*차/g,'')
      .replace(/(?:제\s*)?\d{2,4}\s*회(?=\s*(?:\||·|STAGE|글로벌|생방송|$))/gi,'')
      .replace(/\b(?:20\d{2}[./-])?\d{1,2}[./-]\d{1,2}\b/g,'')
      .replace(/\s*[|·\-/~～–]\s*$/,'').replace(/^\s*[|·\-/~～–]\s*/,'')
      .replace(/\s{2,}/g,' ').trim();
    // A year/month edition has never been evidence of a different contest type.
    if(/^쇼!\s*음악중심\s*\|?\s*STAGE M PICK$/i.test(x)) x='쇼! 음악중심 | STAGE M PICK';
    if(!x) x=plain(title);
    return x;
  }
  function votesSnapshot(event){
    const candidates=Array.isArray(event.candidates)?event.candidates:[];
    const valid=candidates.length>0 && candidates.every(c=>
      c.votes!==null && c.votes!==undefined && c.votes!=='' &&
      Number.isSafeInteger(Number(c.votes)) && Number(c.votes)>=0);
    const sum=valid?candidates.reduce((n,c)=>n+Number(c.votes),0):null;
    return {
      votes:sum,complete:valid&&event.lineup_complete===true,
      partial:valid&&event.lineup_complete!==true,
      candidateCount:candidates.length,
      participantCount:Number.isSafeInteger(event.participant_count)&&event.participant_count>=0?event.participant_count:null,
    };
  }
  function metric(events){
    const complete=events.map(votesSnapshot).filter(s=>s.complete);
    const partial=events.map(votesSnapshot).filter(s=>s.partial);
    const knownParticipants=events.map(votesSnapshot).filter(s=>s.participantCount!==null);
    const mean=samples=>samples.length?Math.round(samples.reduce((sum,s)=>sum+s,0)/samples.length):null;
    return {
      meanVotes:mean(complete.map(s=>s.votes)), knownVoteRounds:complete.length,
      partialVoteRounds:partial.length, avgPartialMinimum:mean(partial.map(s=>s.votes)),
      meanParticipants:mean(knownParticipants.map(s=>s.participantCount)),
      knownParticipantRounds:knownParticipants.length,
      scope:'후보별 공개 득표의 마지막 수집값. 전체 후보 확인된 회차만 평균에 포함하며 확정 최종 득표가 아닐 수 있습니다.',
    };
  }
  const rewardRule=r=>{
    const text=plain(r.period_rule||'');
    if(/촬영일/.test(text))return '쇼! 음악중심 촬영일 (정확한 송출 일수 미확인)';
    return text||null;
  };
  const benefitName=r=>{
    if(r.kind==='advertising'&&/실내\s*전광판/.test(r.place||r.text))return '초대형 실내 전광판 광고';
    if(r.kind==='advertising'&&/옥외\s*전광판/.test(r.place||r.text))return '옥외 전광판 광고';
    if(r.kind==='trophy'&&/stage m pick/i.test(r.text))return 'STAGE M PICK 트로피';
    if(r.kind==='trophy'&&/best pick/i.test(r.text))return 'BEST PICK 실물 트로피';
    return plain(r.text);
  };
  const signature=r=>[
    norm(benefitName(r)),norm(r.place),norm(r.condition),norm(rewardRule(r))
  ].join('|');
  function build(events,policies=[],rewardGroups){
    const index=new Map();
    const ensure=(app,title,policy=false)=>{
      const name=seriesTitle(title);
      const key=app+'|'+norm(name);
      if(!index.has(key))index.set(key,{key,app,title:name,rounds:[],benefits:[],policies:[],lastChecked:null});
      return index.get(key);
    };
    const benefit=(series,entry,event=null,policy=null)=>{
      const key=signature(entry);
      let b=series.benefits.find(v=>v.key===key);
      if(!b){b={
        key,title:benefitName(entry),kind:entry.kind,text:entry.text,place:entry.place||null,
        condition:entry.condition||null,period_rule:rewardRule(entry),
        period_text:entry.period_text||null,examples:[],evidence:[],sources:[],
        execution:[],policy:false
      };series.benefits.push(b);}
      if(event && !b.examples.some(x=>x.id===event.id)){
        b.examples.push({id:event.id,title:event.title,period:event.start+' ~ '+event.end,
          checked_at:entry.checked_at||event.collected_at,source_url:entry.source_url||event.source_url});
      }
      if(entry.execution_start_at||entry.execution_end_at)
        b.execution.push({start:entry.execution_start_at||null,end:entry.execution_end_at||null,
          source_url:entry.source_url,linked_event_id:event?.id||null});
      if(entry.source_url && !b.sources.some(s=>s.url===entry.source_url))
        b.sources.push({url:entry.source_url,checked_at:entry.checked_at||event?.collected_at});
      if(policy)b.policy=true;
    };
    for(const e of events||[]){
      if(!e?.app || !e?.title || !e?.id)continue;
      const row=ensure(e.app,e.title);
      if(!row.rounds.some(v=>v.id===e.id))row.rounds.push(e);
      for(const entry of rewardGroups.extracted(e)){
        // The 1️⃣, 2️⃣ symbols enumerate benefits; they do not signify 1st/2nd-place prizes.
        const sharedFirst=[...(Array.isArray(e.reward_lines)?e.reward_lines:[]),e.reward||''].some(x=>/1\s*(?:등|위)\s*리워드/.test(x));
        const enumerated=/^[1-9]\ufe0f?\u20e3/.test(String(entry.text||'').trim());
        const cleanEntry=enumerated?{...entry,condition:sharedFirst?'1위':null}:entry;
        benefit(row,cleanEntry,e);
      }
    }
    for(const p of policies||[]){
      if(p.unconfirmed_reward||!p.app||!p.text)continue;
      const groupTitle=p.program_name||p.title?.split(' · ')[0]||'공식 리워드 안내';
      // Program name is explicit in provider documentation, not derived from a vote date.
      const s=ensure(p.app,groupTitle,true);
      const entry={...p,period_rule:p.period_rule||null};
      benefit(s,entry,null,p);s.policies.push(p);
    }
    return [...index.values()].map(row=>{
      row.rounds.sort((a,b)=>String(b.end||'').localeCompare(String(a.end||'')));
      row.metrics=metric(row.rounds);
      row.lastChecked=row.rounds.reduce((latest,e)=>String(e.collected_at||'')>latest?e.collected_at:latest,null);
      return row;
    }).sort((a,b)=>a.app.localeCompare(b.app)||b.rounds.length-a.rounds.length||a.title.localeCompare(b.title,'ko'));
  }
  return {seriesTitle,votesSnapshot,metric,build,rewardRule,signature};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoteAtlasSeries;
