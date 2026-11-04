'use strict';
/** Read-only analytics over recorded daily samples. No inferred missing dates. */
const VoteAtlasTrends=(()=>{
 const normalize=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ko-KR');
 function topic(title) {
   const name=typeof VoteAtlasSeries!=='undefined' ? VoteAtlasSeries.seriesTitle(title) : String(title||'');
   return String(name).replace(/\s*[|·-]\s*\d{1,2}\s*월(?:\s*\d+\s*주차)?$/,'').trim();
 }
 const day=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?s:'';
 function differenceDays(a,b){
   if(!day(a)||!day(b))return NaN;
   return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
 }
 function dateAgo(dayString,n){
   if(!day(dayString))return '';
   const date=new Date(dayString+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-n);
   return date.toISOString().slice(0,10);
 }
 function normalizeHistory(data){
   const rows=Array.isArray(data?.observations)?data.observations:[];
   return rows.filter(x=>day(x.date)&&x.app&&x.title&&x.event_id&&
     Number.isSafeInteger(x.total_votes)&&x.total_votes>=0&&
     (x.scope==='all_candidates'||x.scope==='visible_candidates'))
   .map(x=>({...x,topic:topic(x.title)}))
   .sort((a,b)=>a.date.localeCompare(b.date)||String(a.event_id).localeCompare(String(b.event_id)));
 }
 function groups(rows){
   const map=new Map();
   for(const row of rows){
     const key=row.app+'|'+normalize(row.topic);
     if(!map.has(key))map.set(key,{key,app:row.app,topic:row.topic,points:[],eventCount:new Set()});
     const item=map.get(key);item.points.push(row);item.eventCount.add(row.event_id);
   }
   return [...map.values()].map(x=>({...x,eventCount:x.eventCount.size}))
      .sort((a,b)=>b.points.length-a.points.length||a.topic.localeCompare(b.topic,'ko'));
 }
 function changes(rows){
   const byEvent=new Map();
   for(const row of rows){
     if(!byEvent.has(row.event_id))byEvent.set(row.event_id,[]);
     byEvent.get(row.event_id).push(row);
   }
   const out=[];
   for(const values of byEvent.values()){
     values.sort((a,b)=>a.date.localeCompare(b.date)||String(a.observed_at||'').localeCompare(String(b.observed_at||'')));
     for(let i=1;i<values.length;i++){
       const prev=values[i-1],current=values[i];
       // Different dated observations of the *same* vote round, never a new
       // monthly/weekly round reset. Changing candidate roster is also excluded.
       if(differenceDays(prev.date,current.date)!==1)continue;
       if(prev.scope!==current.scope || prev.roster_hash!==current.roster_hash)continue;
       const delta=current.total_votes-prev.total_votes;
       if(delta<0)continue; // corrections/reset cannot be called added votes
       out.push({...current,previous_date:prev.date,previous_votes:prev.total_votes,
         delta,percent:prev.total_votes>0?delta/prev.total_votes*100:null,
         spike:(delta>=10000&&(prev.total_votes>0 && delta/prev.total_votes>=0.5))||delta>=100000});
     }
   }
   return out.sort((a,b)=>b.date.localeCompare(a.date)||b.delta-a.delta);
 }
 function groupChanges(rows){
   const map=new Map();
   for(const row of changes(rows)){
     const key=row.app+'|'+normalize(row.topic)+'|'+row.date;
     if(!map.has(key))map.set(key,{app:row.app,topic:row.topic,date:row.date,delta:0,count:0,spikes:0});
     const x=map.get(key);x.delta+=row.delta;x.count++;if(row.spike)x.spikes++;
   }
   return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
 }
 function eventSeries(rows,limit=8){
   const map=new Map();
   for(const row of rows){
     if(!map.has(row.event_id))map.set(row.event_id,{id:row.event_id,title:row.title,scope:row.scope,points:[]});
     map.get(row.event_id).points.push(row);
   }
   return [...map.values()].map(s=>({...s,points:s.points.sort((a,b)=>a.date.localeCompare(b.date))}))
     .sort((a,b)=>String(b.points.at(-1)?.date||'').localeCompare(String(a.points.at(-1)?.date||''))||
        b.points.length-a.points.length).slice(0,limit);
 }
 return {topic,normalizeHistory,groups,changes,groupChanges,eventSeries,differenceDays,dateAgo};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoteAtlasTrends;
