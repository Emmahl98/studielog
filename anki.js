import {localDate} from './data.js';
import {materialList} from './materials.js';

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
  async originalDecks(query='deck:filtered'){
    const filtered=await this.call('findCards',{query});
    if(!Array.isArray(filtered))throw Error('Ongeldige lijst met gefilterde Anki-kaarten.');
    const original=new Map();
    if(!filtered.length)return original;

    const current=new Map();
    for(let i=0;i<filtered.length;i+=250){
      const decks=await this.call('getDecks',{cards:filtered.slice(i,i+250)});
      for(const [name,ids] of Object.entries(decks)){
        for(const id of ids)current.set(id,name);
      }
    }
    const deckIds=Object.entries(await this.call('deckNamesAndIds'));
    for(let i=0;i<deckIds.length;i+=8){
      await Promise.all(deckIds.slice(i,i+8).map(async([name,id])=>{
        if(!Number.isSafeInteger(id)||id<1)throw Error('Ongeldig Anki-deck-ID.');
        // did: matches the original and current deck. Exclude the current match.
        const cards=await this.call('findCards',{query:`${query} did:${id}`});
        if(!Array.isArray(cards))throw Error('Ongeldige lijst met Anki-kaarten per deck.');
        for(const card of cards){
          if(current.has(card)&&current.get(card)!==name)original.set(card,name);
        }
      }));
    }
    return original;
  }
  async decksByTag(){
    const ids=await this.call('findNotes',{query:'-tag:none'});
    if(!Array.isArray(ids))throw Error('Ongeldige notitielijst van AnkiConnect.');
    const decksByTag=new Map();
    const original=ids.length?await this.originalDecks():new Map();
    for(let i=0;i<ids.length;i+=250){
      const notes=await this.call('notesInfo',{notes:ids.slice(i,i+250)});
      if(!Array.isArray(notes)||notes.some(note=>!Array.isArray(note?.tags)||!Array.isArray(note?.cards)))throw Error('Ongeldige notitiegegevens van AnkiConnect.');
      const tagsByCard=new Map(notes.flatMap(note=>note.cards.map(card=>[card,note.tags])));
      const cards=[...tagsByCard.keys()];
      for(let j=0;j<cards.length;j+=250){
        const decks=await this.call('getDecks',{cards:cards.slice(j,j+250)});
        if(!decks||typeof decks!=='object'||Array.isArray(decks)||Object.values(decks).some(value=>!Array.isArray(value)))throw Error('Ongeldige deckgegevens van AnkiConnect.');
        for(const [deck,cardIds] of Object.entries(decks)){
          for(const card of cardIds){
            for(const tag of tagsByCard.get(card)||[]){
              if(!decksByTag.has(tag))decksByTag.set(tag,new Set());
              decksByTag.get(tag).add(original.get(card)??deck);
            }
          }
        }
      }
    }
    return decksByTag;
  }
  async reviews(deck=''){
    const query=`rated:31${deck?` deck:${JSON.stringify(deck)}`:''}`;
    const cards=await this.call('findCards',{query});
    if(!Array.isArray(cards))throw new Error('Ongeldige kaartenlijst van AnkiConnect.');
    const original=cards.length?await this.originalDecks(`${query} deck:filtered`):new Map();
    const reviews=[];
    for(let i=0;i<cards.length;i+=250){
      const batch=cards.slice(i,i+250);
      const info=await this.call('cardsInfo',{cards:batch});
      if(!Array.isArray(info)||info.some(card=>!card||!Number.isSafeInteger(card.cardId)||!Number.isSafeInteger(card.note)||typeof card.deckName!=='string'||!card.deckName))throw new Error('Ongeldige kaartgegevens van AnkiConnect.');
      const cardsById=new Map(info.map(card=>[String(card.cardId),card]));
      const notes=await this.call('notesInfo',{notes:[...new Set(info.map(card=>card.note))]});
      if(!Array.isArray(notes)||notes.some(note=>!note||!Number.isSafeInteger(note.noteId)||!Array.isArray(note.tags)||note.tags.some(tag=>typeof tag!=='string'||!tag)))throw new Error('Ongeldige kaarttags van AnkiConnect.');
      const tagsByNote=new Map(notes.map(note=>[note.noteId,note.tags]));
      const result=await this.call('getReviewsOfCards',{cards:batch});
      if(!result||typeof result!=='object'||Object.values(result).some(value=>!Array.isArray(value)))throw new Error('Ongeldige herhalingen van AnkiConnect.');
      for(const [card,values] of Object.entries(result)){
        const metadata=cardsById.get(card);
        if(!metadata||!tagsByNote.has(metadata.note))throw new Error('Gegevens van een herhaalde kaart ontbreken.');
        for(const review of values)reviews.push({...review,card,deck:original.get(metadata.cardId)??metadata.deckName,tags:tagsByNote.get(metadata.note)});
      }
    }
    return reviews;
  }
}

export function methodForDeck(deck,mappings={}){
  let name=deck||'';
  while(name){if(Object.hasOwn(mappings,name)&&mappings[name])return mappings[name];const split=name.lastIndexOf('::');if(split<0)break;name=name.slice(0,split);}
  return 'Anki';
}
export function* recentAnkiReviews(reviews,now=new Date()){
  const first=new Date(now.getFullYear(),now.getMonth(),now.getDate()-29);
  const today=localDate(now),seen=new Set();
  for(const review of reviews){
    if(!Number.isSafeInteger(review.id)||!Number.isFinite(review.time)||review.time<0||![1,2,3,4].includes(review.ease)||![0,1,2,3].includes(review.type))continue;
    const date=localDate(new Date(review.id));
    if(review.id<+first||date>today||seen.has(review.id))continue;
    seen.add(review.id);
    yield {...review,date};
  }
}

export function dailyAnkiEntries(reviews,now=new Date(),mappings={},tagMappings={}){
  const days=new Map();
  for(const review of recentAnkiReviews(reviews,now)){
    const {date}=review;
    const day=days.get(date)||{count:0,milliseconds:0,methods:new Map()};
    const tagged=[...new Set((review.tags||[]).flatMap(tag=>Object.hasOwn(tagMappings,tag)?materialList(tagMappings[tag]):[]))];
    const methods=tagged.length?tagged:materialList(methodForDeck(review.deck,mappings));
    for(const method of methods){
      const part=day.methods.get(method)||{time:0,count:0};
      part.time+=review.time/methods.length;part.count+=1/methods.length;day.methods.set(method,part);
    }
    day.count++;day.milliseconds+=review.time;days.set(date,day);
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,day])=>({
    id:`anki-daily-${date}`,date,type:'sessie',materials:[...day.methods.keys()].sort().join(', '),
    weights:Object.fromEntries([...day.methods].sort(([a],[b])=>a.localeCompare(b)).map(([name,part])=>[name,100*(day.milliseconds?part.time/day.milliseconds:part.count/day.count)])),
    subject:`Anki · ${day.count} herhalingen`,minutes:Math.round(day.milliseconds/60000),createdAt:now.toISOString()
  }));
}

export async function syncAnki(store,anki,now=new Date(),fromDate=localDate(now),mappings={},tagMappings={}){
  const wanted=dailyAnkiEntries(await anki.reviews(),now,mappings,tagMappings).filter(entry=>entry.date>=fromDate);
  const existing=await store.read();
  let changed=0;
  for(const entry of wanted){
    const matches=existing.filter(item=>item.id===entry.id);
    if(matches.length>1)throw new Error(`Dubbel Anki-item op ${entry.date}. Controleer je spreadsheet.`);
    const old=matches[0];
    if(old){
      if(old.minutes===entry.minutes&&old.subject===entry.subject&&old.materials===entry.materials&&JSON.stringify(old.weights)===JSON.stringify(entry.weights))continue;
      await store.update({...entry,createdAt:old.createdAt});
    }else await store.add(entry);
    changed++;
  }
  return changed;
}
