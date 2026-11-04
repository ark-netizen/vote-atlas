'use strict';
/** Vote programs are the primary entities; different months/weeks/episodes are observations. */
const VoteAtlasSeries = (() => {
  const plain=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const norm=s=>plain(s).toLocaleLowerCase('ko-KR');
  function seriesTitle(title){
    let x=plain(title)
      .replace(/^\[(?:예선|결선|본선|최종|파이널)\s*투표\]\s*/i,'')
      .replace(/\s*[-–—]?\s*\d{1,3}(?:st|nd|rd|th)\s*$/i,'');
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
  const benefitName=(r,programTitle='')=>{
    if(r.kind==='trophy'&&/it.s\s*live\s*best\s*pick/i.test(programTitle))return 'it’s Live BEST PICK 트로피';
    if(r.kind==='advertising'&&/실내\s*전광판/.test(r.place||r.text))return '초대형 실내 전광판 광고';
    if(r.kind==='advertising'&&/옥외\s*전광판/.test(r.place||r.text))return '옥외 전광판 광고';
    if(r.kind==='trophy'&&/stage m pick/i.test(r.text))return 'STAGE M PICK 트로피';
    if(r.kind==='trophy'&&/best pick/i.test(r.text))return 'BEST PICK 실물 트로피';
    return plain(r.text);
  };
  const signature=(r,programTitle='')=>[
    norm(benefitName(r,programTitle)),norm(r.place),norm(r.condition),norm(rewardRule(r))
  ].join('|');
  function stageName(title){
    if(/^\s*\[예선\s*투표\]/.test(title||''))return '예선';
    if(/^\s*\[결선\s*투표\]/.test(title||''))return '결선';
    return null;
  }
  function eventEntries(event,rewardGroups){
    const sharedFirst=[...(Array.isArray(event.reward_lines)?event.reward_lines:[]),event.reward||'']
      .some(x=>/1\s*(?:등|위)\s*리워드/.test(x));
    return rewardGroups.extracted(event).map(entry=>{
      const enumerated=/^[1-9]\ufe0f?\u20e3/.test(String(entry.text||'').trim());
      return enumerated?{...entry,condition:sharedFirst?'1위':null}:entry;
    });
  }
  function rewardFingerprint(entries,programTitle){
    if(!entries.length)return 'reward-unverified';
    return [...new Set(entries.map(entry=>signature(entry,programTitle)))].sort().join('||');
  }
  function build(events,policies=[],rewardGroups){
    const index=new Map();
    const ensure=(app,title,rewardVersion='reward-unverified')=>{
      const name=seriesTitle(title);
      const key=app+'|'+norm(name)+'|'+rewardVersion;
      if(!index.has(key))index.set(key,{key,app,title:name,rounds:[],benefits:[],policies:[],lastChecked:null});
      return index.get(key);
    };
    const benefit=(series,entry,event=null,policy=null)=>{
      const key=signature(entry,series.title);
      let b=series.benefits.find(v=>v.key===key);
      if(!b){b={
        key,title:benefitName(entry,series.title),kind:entry.kind,text:entry.text,place:entry.place||null,
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
      const entries=eventEntries(e,rewardGroups);
      const row=ensure(e.app,e.title,rewardFingerprint(entries,seriesTitle(e.title)));
      if(!row.rounds.some(v=>v.id===e.id))row.rounds.push(e);
      for(const entry of entries)benefit(row,entry,e);
    }
    for(const p of policies||[]){
      if(p.unconfirmed_reward||!p.app||!p.text)continue;
      const groupTitle=p.program_name||p.title?.split(' · ')[0]||'공식 리워드 안내';
      // Program name is explicit in provider documentation, not derived from a vote date.
      const s=ensure(p.app,groupTitle,'official-guidance');
      const entry={...p,period_rule:p.period_rule||null};
      benefit(s,entry,null,p);s.policies.push(p);
    }
    const rows=[...index.values()].map(row=>{
      row.rounds.sort((a,b)=>String(b.end||'').localeCompare(String(a.end||'')));
      row.metrics=metric(row.rounds);
      const stages=new Map();
      for(const e of row.rounds){
        const name=stageName(e.title);
        if(name){if(!stages.has(name))stages.set(name,[]);stages.get(name).push(e)}
      }
      row.stageMetrics=[...stages.entries()].map(([name,rounds])=>({
        name,rounds:rounds.length,metrics:metric(rounds)
      }));
      row.lastChecked=row.rounds.reduce((latest,e)=>String(e.collected_at||'')>latest?e.collected_at:latest,null);
      return row;
    }).sort((a,b)=>a.app.localeCompare(b.app)||b.rounds.length-a.rounds.length||a.title.localeCompare(b.title,'ko'));
    const siblings=new Map();
    for(const row of rows){
      const base=row.app+'|'+norm(row.title);
      if(!siblings.has(base))siblings.set(base,[]);
      siblings.get(base).push(row);
    }
    for(const family of siblings.values()){
      if(family.length<2)continue;
      family.sort((a,b)=>String(b.rounds[0]?.end||'').localeCompare(String(a.rounds[0]?.end||'')));
      family.forEach((row,i)=>{
        row.rewardVersion=i+1;
        row.rewardVariantLabel=row.benefits.length?'리워드 구성 '+(i+1):'리워드 미확인';
      });
    }
    return rows;
  }
  return {seriesTitle,votesSnapshot,metric,build,rewardRule,signature,stageName,rewardFingerprint};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoteAtlasSeries;
