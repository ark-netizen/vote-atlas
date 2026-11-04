'use strict';
/* Client-side purchase-equivalent value only. This is never a revenue estimate. */
const VoteAtlasCost = (() => {
 const asNumber=(value,max=1e12)=>{
   const n=typeof value==='number'?value:Number(String(value??'').replace(/,/g,'').trim());
   return Number.isFinite(n)&&n>=0&&n<=max?n:null;
 };
 function calculate({votes,unitsPerVote,bundleUnits,bundlePrice,paidShare}){
   const v=asNumber(votes),perVote=asNumber(unitsPerVote,1e7);
   const bundle=asNumber(bundleUnits,1e8),price=asNumber(bundlePrice,1e9);
   const paid=asNumber(paidShare,100);
   if([v,perVote,bundle,price,paid].some(x=>x===null)||bundle===0) return null;
   const totalUnits=v*perVote,unitPrice=price/bundle,equivalent=totalUnits*unitPrice;
   const adjusted=equivalent*paid/100;
   if(![totalUnits,unitPrice,equivalent,adjusted].every(Number.isFinite))return null;
   return {votes:v,unitsPerVote:perVote,totalUnits,unitPrice,equivalent,adjusted,paidShare:paid};
 }
 function summarizeSeries(series){
   const rounds=series?.rounds||[];
   const observed=rounds.filter(e=>e.vote_cost && Array.isArray(e.vote_cost.cost_options)&&e.vote_cost.cost_options.length);
   const missing=rounds.length-observed.length;
   const formats=new Map();
   for(const e of observed){
     const c=e.vote_cost;
     const key=String(c.currency||'재화')+'|'+c.cost_options.join(',')+'|'+c.status;
     if(!formats.has(key))formats.set(key,{currency:c.currency||'재화',options:c.cost_options,
       status:c.status,source_url:c.source_url,checked_at:c.checked_at,count:0});
     formats.get(key).count++;
   }
   const variants=[...formats.values()];
   const exact=variants.length===1&&variants[0].options.length===1
     &&variants[0].status==='verified'?variants[0]:null;
   return {variants,observed:observed.length,total:rounds.length,missing,exact};
 }
 const amount=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(value);
 return {calculate,summarizeSeries,amount};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoteAtlasCost;
