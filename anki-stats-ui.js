import {recentAnkiReviews} from './anki.js?v=38';
import {displayDate} from './dates.js?v=14';

const seconds=new Intl.NumberFormat('nl-NL',{maximumFractionDigits:3});
const alphabetical=(a,b)=>a.localeCompare(b,'nl',{numeric:true});
const $=id=>document.getElementById(`anki-stats-${id}`);

export function summarizeAnkiTags(reviews,day='',deck=''){
  const groups=new Map();
  for(const review of reviews){
    if((day&&review.date!==day)||(deck&&review.deck!==deck))continue;
    for(const tag of new Set(review.tags.length?review.tags:[null])){
      if(!groups.has(tag))groups.set(tag,{milliseconds:0,reviews:0,cards:new Map()});
      const group=groups.get(tag);
      const card=group.cards.get(review.card)||{milliseconds:0,reviews:0,deck:review.deck};
      card.milliseconds+=review.time;
      card.reviews++;
      group.cards.set(review.card,card);
      group.milliseconds+=review.time;
      group.reviews++;
    }
  }
  return groups;
}

function setOptions(select,label,values,format){
  const previous=select.value;
  select.replaceChildren(new Option(label,''),...values.map(value=>new Option(format(value),value)));
  if(values.includes(previous))select.value=previous;
}

const duration=milliseconds=>`${seconds.format(milliseconds/1000)} s`;
const reviewsLabel=count=>`${count} ${count===1?'herhaling':'herhalingen'}`;

export class AnkiStatsUI {
  constructor(anki,checkProfile){
    this.anki=anki;
    this.checkProfile=checkProfile;
    $('load').addEventListener('click',()=>this.load());
    $('day').addEventListener('change',()=>this.render());
    $('deck').addEventListener('change',()=>this.render());
  }

  async load(){
    $('load').disabled=true;
    $('status').textContent='Anki-statistieken ophalen…';
    try{
      const profile=await this.anki.call('getActiveProfile');
      this.checkProfile(profile);
      const reviews=await this.anki.reviews();
      if(await this.anki.call('getActiveProfile')!==profile)throw Error('Het Anki-profiel is gewijzigd. Haal de statistieken opnieuw op.');
      this.reviews=[...recentAnkiReviews(reviews)];
      const days=[...new Set(this.reviews.map(review=>review.date))].sort().reverse();
      const decks=[...new Set(this.reviews.map(review=>review.deck))].sort(alphabetical);
      setOptions($('day'),'Alle dagen',days,displayDate);
      setOptions($('deck'),'Alle decks',decks,value=>value);
      $('filters').hidden=!this.reviews.length;
      this.render();
    }catch(error){
      $('filters').hidden=true;
      $('results').replaceChildren();
      $('status').textContent=error.message;
    }finally{
      $('load').disabled=false;
    }
  }

  render(){
    const groups=summarizeAnkiTags(this.reviews,$('day').value,$('deck').value);
    const results=$('results');
    results.replaceChildren();
    $('status').textContent=groups.size?'':'Geen herhalingen gevonden voor deze selectie.';
    for(const [tag,group] of [...groups].sort(([a],[b])=>alphabetical(a??'',b??''))){
      const details=document.createElement('details');
      details.className='anki-stats-group';
      const summary=document.createElement('summary');
      const count=group.cards.size;
      summary.textContent=`${tag??'Zonder tag'} · ${count} ${count===1?'kaart':'kaarten'} · ${reviewsLabel(group.reviews)} · ${duration(group.milliseconds)}`;
      details.append(summary);
      details.addEventListener('toggle',()=>{
        if(!details.open||details.children.length>1)return;
        const list=document.createElement('ul');
        for(const [id,card] of group.cards){
          const item=document.createElement('li');
          item.textContent=`Kaart ${id} · ${card.deck} · ${reviewsLabel(card.reviews)} · ${duration(card.milliseconds)}`;
          list.append(item);
        }
        details.append(list);
      });
      results.append(details);
    }
  }
}
