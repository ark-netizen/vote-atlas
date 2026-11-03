'use strict';
/** Presentation catalog: reward kinds, not one row per voting round. */
const VoteAtlasRewardGroups=(()=>{
 const normal=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,' ').trim();
 const unknown=s=>!s||/^(?:미확인|없음|unknown|n\/a|-|\s*)$/i.test(String(s).trim());
 const decorative=/^(?:1\s*위\s*)?(?:혜택|리워드|특전)(?:\s*안내)?$|변경될\s*수|영상\(?예시\)?|다음\s*내용|선물해\s*주세요|팬들의\s*투표가|^\*.*(?:영상|예시)/i;
 const benefit=/전광판|옥외|실내|광고|트로피|상패|포토카드|폴라로이드|방청권|초대권|기념품|굿즈|앨범\s*증정|송출|노출|홍보\s*영상/i;
 const kind=s=>/전광판|광고|옥외|실내|영상\s*송출|홍보/.test(s)?'advertising':/트로피|상패|메달/.test(s)?'trophy':/포토카드|폴라로이드|앨범|굿즈|기념품/.test(s)?'goods':/방청권|초대권|팬미팅|티켓/.test(s)?'experience':'other';
 const spot=s=>/초대형\s*실내\s*전광판/.test(s)?'MBC 본사 초대형 실내 전광판':/옥외\s*전광판/.test(s)?'MBC 본사 옥외 전광판':null;
 const rule=s=>{const day=s.match(/(\d{1,3})\s*(?:일간|일\s*동안|days?)/i);return day?Number(day[1])+'일간':/촬영일/.test(s)?'쇼! 음악중심 촬영일':/추후\s*(?:공지|안내)|월중\s*(?:안내|예정)/.test(s)?'원문에 명시된 추후 안내':null};
 const cond=s=>{const m=s.match(/(?:최종\s*)?([1-9])\s*(?:위|등)|([1-9])\ufe0f?\u20e3/);return m?(m[1]||m[2])+'위':null};
 const datePattern=/20\d{2}\s*[년./-]\s*\d{1,2}\s*[월./-]\s*\d{1,2}\s*일?/g;
 function signatureText(s){
  let x=normal(s).replace(/[🏆🏅🥇🎖️🎉🎁🎬1️⃣2️⃣3️⃣]/gu,'').replace(datePattern,'<date>')
     .replace(/\s*[~～–-]\s*<date>/g,'-<date>')
     .replace(/202\d년?\s*\d{1,2}월\s*\d{1,2}주차/g,'<round>');
  if(/stage m pick.*트로피|트로피.*stage m pick/i.test(x))return 'stage m pick 트로피 수여';
  if(/it's live best pick.*트로피|실물 트로피.*best pick/i.test(x))return "it's live best pick 실물 트로피 수여";
  if(/쇼! 음악중심 촬영일.*초대형 실내 전광판/.test(x))return '쇼! 음악중심 촬영일 mbc 본사 초대형 실내 전광판 광고 송출';
  if(/쇼! 음악중심 촬영일.*옥외 전광판/.test(x))return '쇼! 음악중심 촬영일 mbc 본사 옥외 전광판 광고 송출';
  return x.replace(/\s+/g,' ').trim();
 }
 const readableEntry=(item,e)=>{
  const source=item.source_url||e.source_url||null;
  return {
   id:item.id||null,app:e.app,text:String(item.text||item.reward||'').trim(),
   kind:item.kind||kind(String(item.text||'')),place:item.place||spot(String(item.text||''))||null,
   condition:item.condition||cond(String(item.text||''))||null,
   period_rule:item.period_rule||rule(String(item.text||''))||null,
   period_text:item.period_text||null,
   execution_start_at:item.execution_start_at||null,execution_end_at:item.execution_end_at||null,
   source_url:source,source_kind:item.source_kind||e.source_kind||e.source||'official_web',
   checked_at:item.checked_at||e.reward_checked_at||e.collected_at||null,
   event:e
  };
 };
 function extracted(e){
  if(Array.isArray(e.reward_entries)&&e.reward_entries.length)
   return e.reward_entries.filter(x=>!unknown(x.text)).map(x=>readableEntry(x,e));
  const raw=Array.isArray(e.reward_lines)&&e.reward_lines.length?e.reward_lines:String(e.reward||'').split(/\n/);
  const items=raw.map(x=>String(x||'').replace(/\s+/g,' ').trim())
    .filter(x=>x.length>6&&!decorative.test(x)&&benefit.test(x));
  // When a generic combined heading is followed by concrete benefits, omit the heading.
  const concrete=items.filter(x=>!/1\s*(?:위|등)\s*리워드\s*:/.test(x)||items.length===1);
  const trophies=concrete.filter(x=>/트로피\s*수여/i.test(x));
  if(trophies.length>1){
   const preferred=trophies.find(x=>/best\s*pick/i.test(x))||[...trophies].sort((a,b)=>b.length-a.length)[0];
   return concrete.filter(x=>!/트로피\s*수여/i.test(x)||x===preferred)
    .map(text=>readableEntry({text,condition:cond(trophies.join(' '))},e));
  }
  return concrete.map(text=>readableEntry({text},e));
 }
 function group(events,policies=[]){
  const map=new Map();
  const add=(r,policy=null)=>{
   if(unknown(r.text))return;
   const signature=[
    r.app,signatureText(r.text),normal(r.place||''),normal(r.condition||''),
    normal(r.period_rule||'')
   ].join('|');
   if(!map.has(signature))map.set(signature,{
     id:signature,app:r.app,text:r.text,kind:r.kind,place:r.place,condition:r.condition,
     period_rule:r.period_rule,period_text:r.period_text,
     checked_at:r.checked_at,source_url:r.source_url,
     source_kind:r.source_kind,history:[],policies:[],change_notes:[]
   });
   const g=map.get(signature);
   if(policy){if(!g.policies.some(p=>p.id===policy.id))g.policies.push(policy);return;}
   const event=r.event;
   if(!g.history.some(h=>h.event_id===event.id)){
    g.history.push({
     event_id:event.id,title:event.title,start:event.start,end:event.end,
     source_url:r.source_url,checked_at:r.checked_at,
     execution_start_at:r.execution_start_at,execution_end_at:r.execution_end_at,
     period_text:r.period_text,condition:r.condition,place:r.place,
     leader:event.leader||null,winner:event.winner||null
    });
   }
  };
  for(const e of events||[])for(const r of extracted(e))add(r);
  for(const p of policies||[]){
   if(p.unconfirmed_reward)continue;
   const r=readableEntry(p,{app:p.app,source_url:p.source_url,collected_at:p.checked_at});
   add(r,p);
  }
  return [...map.values()].map(g=>{
   g.history.sort((a,b)=>String(b.end||'').localeCompare(String(a.end||'')));
   g.last_observed_at=g.history.reduce((max,h)=>String(h.checked_at||'')>max?String(h.checked_at):max,String(g.checked_at||''));
   return g;
  });
 }
 return {group,extracted,signatureText,kind,rule};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoteAtlasRewardGroups;
