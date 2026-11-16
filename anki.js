import {localDate} from './data.js';

export class AnkiConnect {
  constructor(fetcher=fetch){this.fetcher=(...args)=>fetcher(...args);}
  async call(action,params={}){
    let response;
    try{response=await this.fetcher('http://127.0.0.1:8765',{method:'POST',body:JSON.stringify({action,version:6,params}),signal:AbortSignal.timeout(15000)});}
    catch{throw new Error('Anki niet bereikbaar. Open Anki op deze pc met AnkiConnect. Sta deze website toe in AnkiConnect en geef je browser zo nodig toegang tot je lokale netwerk.');}
    if(!response.ok)throw new Error(`AnkiConnect gaf een fout (${response.status}).`);
    const data=await response.json();
    if(data.error)throw new Error(`AnkiConnect: ${data.error}`);
    if(!Object.hasOwn(data,'result'))throw new Error('Onverwacht antwoord van AnkiConnect.');
    return data.result;
  }
  async reviews(deck=''){
    const query=`rated:31${deck?` deck:${JSON.stringify(deck)}`:''}`;
    const cards=await this.call('findCards',{query});
    if(!Array.isArray(cards))throw new Error('Ongeldige kaartenlijst van AnkiConnect.');
    const reviews=[];
    for(let i=0;i<cards.length;i+=250){
      const result=await this.call('getReviewsOfCards',{cards:cards.slice(i,i+250)});
      if(!result||typeof result!=='object'||Object.values(result).some(value=>!Array.isArray(value)))throw new Error('Ongeldige herhalingen van AnkiConnect.');
      for(const values of Object.values(result))reviews.push(...values);
    }
    return reviews;
  }
}

export function dailyAnkiEntries(reviews,now=new Date()){
  const first=new Date(now.getFullYear(),now.getMonth(),now.getDate()-29);
  const today=localDate(now),days=new Map(),seen=new Set();
  for(const review of reviews){
    if(!Number.isSafeInteger(review.id)||!Number.isFinite(review.time)||review.time<0||![1,2,3,4].includes(review.ease)||![0,1,2,3].includes(review.type))continue;
    const date=localDate(new Date(review.id));
    if(review.id<+first||date>today||seen.has(review.id))continue;
    seen.add(review.id);
    const day=days.get(date)||{count:0,milliseconds:0};
    day.count++;day.milliseconds+=review.time;days.set(date,day);
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,day])=>({
    id:`anki-daily-${date}`,date,type:'sessie',materials:'Anki',
    subject:`Anki · ${day.count} herhalingen`,minutes:Math.round(day.milliseconds/60000),createdAt:now.toISOString()
  }));
}

export async function syncAnki(store,anki,now=new Date(),fromDate=localDate(now)){
  const wanted=dailyAnkiEntries(await anki.reviews(),now).filter(entry=>entry.date>=fromDate);
  const existing=await store.read();
  let changed=0;
  for(const entry of wanted){
    const matches=existing.filter(item=>item.id===entry.id);
    if(matches.length>1)throw new Error(`Dubbel Anki-item op ${entry.date}. Controleer je spreadsheet.`);
    const old=matches[0];
    if(old){
      if(old.minutes===entry.minutes&&old.subject===entry.subject&&old.materials===entry.materials)continue;
      await store.update({...entry,createdAt:old.createdAt});
    }else await store.add(entry);
    changed++;
  }
  return changed;
}