'use strict';
/* Client-side purchase-equivalent value only. This is never a revenue estimate. */
const VoteAtlasCost = (() => {
 const asNumber=(value,max=1e12)=>{
   if(value===null||value===undefined||String(value).trim()==='')return null;
   const n=typeof value==='number'?value:Number(String(value).replace(/,/g,'').trim());
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
 function normalizeOptions(cost){
   if(!cost)return [];
   if(Array.isArray(cost.options)&&cost.options.length)
     return cost.options.filter(o=>o&&typeof o.currency==='string'&&
       Number.isFinite(Number(o.units_per_vote))&&Number(o.units_per_vote)>=0)
       .map(o=>({currency:o.currency,units_per_vote:Number(o.units_per_vote),
         votes_per_unit:o.votes_per_unit||null}));
   if(Array.isArray(cost.cost_options)&&cost.cost_options.length)
     return cost.cost_options.filter(v=>Number.isFinite(Number(v))&&Number(v)>=0)
       .map(v=>({currency:cost.currency||'재화 종류 미확인',units_per_vote:Number(v)}));
   return [];
 }
 function summarizeSeries(series){
   const rounds=series?.rounds||[];
   const observed=rounds.filter(e=>normalizeOptions(e.vote_cost).length);
   const signatures=new Map();
   for(const e of observed){
     const cost=e.vote_cost,options=normalizeOptions(cost);
     const key=JSON.stringify(options);
     if(!signatures.has(key))signatures.set(key,{options,source_url:cost.source_url,
       checked_at:cost.checked_at,count:0,scope:cost.scope,
       evidence:cost.evidence,status:cost.status});
     signatures.get(key).count++;
   }
   const variants=[...signatures.values()];
   const exact=variants.length===1&&variants[0].options.length===1
      &&variants[0].count===rounds.length?variants[0]:null;
   return {variants,observed:observed.length,total:rounds.length,
     missing:rounds.length-observed.length,exact};
 }
 function display(cost){
   const options=normalizeOptions(cost);
   if(!options.length)return '미확인';
   return options.map(x=>x.votes_per_unit
     ? x.currency+' 1개당 '+x.votes_per_unit+'표'
     : x.currency+' '+x.units_per_vote+'개/표').join(' 또는 ');
 }
 const amount=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(value);
 return {calculate,summarizeSeries,amount};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoteAtlasCost;
