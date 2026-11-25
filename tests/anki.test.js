import test from 'node:test';
import assert from 'node:assert/strict';
import {AnkiConnect,dailyAnkiEntries,syncAnki,methodForDeck} from '../anki.js';
import {summarizeAnkiTags} from '../anki-stats-ui.js';
const now=new Date(2026,10,16,18);
const review=(day,time=30000,extra={})=>({id:+new Date(2026,10,day,12),time,ease:3,type:1,...extra});
test('calendar grouping, deduplication, rounding and exclusion of non-study logs',()=>{
  const a=review(16),b=review(16,40000,{id:a.id+1});
  const result=dailyAnkiEntries([a,a,b,review(15),review(16,90000,{id:a.id+2,ease:0,type:4}),review(17),{...a,time:-1},review(1,30000,{id:+new Date(2026,9,1,12)})],now);
  assert.equal(result.length,2);
  assert.equal(result[1].subject,'Anki · 2 herhalingen');
  assert.equal(result[1].minutes,1);
  assert.equal(result[0].date,'2026-11-15');
});
test('repeat sync is idempotent and further reviews update the same day',async()=>{
  let rows=[],reviews=[review(16)],adds=0,updates=0;
  const store={read:async()=>rows,add:async entry=>{rows.push(entry);adds++;},update:async entry=>{rows=rows.map(row=>row.id===entry.id?entry:row);updates++;}};
  const anki={reviews:async()=>reviews};
  assert.equal(await syncAnki(store,anki,now),1);
  assert.equal(await syncAnki(store,anki,now),0);
  reviews.push(review(16,60000,{id:reviews[0].id+1}));
  assert.equal(await syncAnki(store,anki,now),1);
  assert.equal(rows.length,1);assert.equal(adds,1);assert.equal(updates,1);assert.equal(rows[0].minutes,2);
});
test('Anki errors never result in writes',async()=>{
  const anki=new AnkiConnect(async()=>({ok:true,json:async()=>({error:'permission denied',result:null})}));
  await assert.rejects(syncAnki({read:()=>assert.fail('must not write')},anki,now),/permission denied/);
});
test('activation date avoids duplicating manually recorded history and catches missed days later',async()=>{
  const rows=[];
  const store={read:async()=>rows,add:async e=>rows.push(e)};
  const anki={reviews:async()=>[review(14),review(15),review(16)]};
  await syncAnki(store,anki,now,'2026-11-15');
  assert.deepEqual(rows.map(e=>e.date),['2026-11-15','2026-11-16']);
});
test('read-only API batches card history and uses loopback only',async()=>{
  const actions=[];
  const anki=new AnkiConnect(async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:8765');
    const request=JSON.parse(options.body);actions.push(request);
    const batch=request.params.cards;
    const result={
      findCards:()=>request.params.query.includes('deck:filtered')?[]:Array.from({length:251},(_,i)=>i),
      cardsInfo:()=>batch.map(cardId=>({cardId,note:Math.floor(cardId/2),deckName:'Tobira'})).reverse(),
      notesInfo:()=>request.params.notes.map(noteId=>({noteId,tags:noteId%2?[]:['H5']})).reverse(),
      getReviewsOfCards:()=>Object.fromEntries(batch.map(id=>[id,[review(16,30000,{id:+now+id})]]))
    }[request.action]();
    return {ok:true,json:async()=>({error:null,result})};
  });
  const reviews=await anki.reviews();
  assert.deepEqual(actions.map(x=>x.action),['findCards','findCards','cardsInfo','notesInfo','getReviewsOfCards','cardsInfo','notesInfo','getReviewsOfCards']);
  assert.equal(actions[4].params.cards.length,250);assert.equal(actions[7].params.cards.length,1);
  assert.equal(actions[3].params.notes.length,125);
  assert.deepEqual(reviews[0],{...review(16,30000,{id:+now}),card:'0',deck:'Tobira',tags:['H5']});
  assert.deepEqual(reviews[1].tags,['H5']);
  assert.deepEqual(reviews[2].tags,[]);
});
test('matched tags override deck and split time once per distinct method',()=>{
  const tagged=review(16,120000,{deck:'Main::Child',tags:['A','B','Unmapped']});
  const fallback=review(16,60000,{id:tagged.id+1,deck:'Main::Child',tags:['Unmapped']});
  const [entry]=dailyAnkiEntries([tagged,fallback],now,{Main:'Deck method'},{A:'One, Two',B:'Two'});
  assert.equal(entry.minutes,3);
  assert.equal(entry.subject,'Anki · 2 herhalingen');
  assert.deepEqual(Object.keys(entry.weights),['Deck method','One','Two']);
  for(const percent of Object.values(entry.weights))assert.ok(Math.abs(percent-100/3)<1e-9);
});

test('tag statistics count each card once and retain its full answer time and review count',()=>{
  const base={date:'2026-11-16',deck:'Main',tags:['A','B','A'],card:'1',time:1400};
  const groups=summarizeAnkiTags([
    base,{...base,time:600},
    {...base,card:'2',tags:['A']},
    {...base,card:'3',tags:[]},
    {...base,date:'2026-11-15'},{...base,deck:'Other'}
  ],'2026-11-16','Main');
  assert.equal(groups.get('A').cards.size,2);
  assert.equal(groups.get('A').reviews,3);
  assert.equal(groups.get('A').milliseconds,3400);
  assert.deepEqual(groups.get('B').cards.get('1'),{milliseconds:2000,reviews:2,deck:'Main'});
  assert.equal(groups.get(null).cards.size,1);
});

test('a tag lists every deck containing a card from its notes, including subdecks',async()=>{
  const anki=new AnkiConnect();
  anki.call=async(action,params)=>{
    if(action==='findNotes'){
      assert.equal(params.query,'-tag:none');
      return [1,2,3];
    }
    if(action==='findCards'){assert.equal(params.query,'deck:filtered');return [];}
    if(action==='notesInfo')return [
      {tags:['Unit'],cards:[10,11]},
      {tags:['Unit','Unit::Extra'],cards:[12]},
      {tags:['Unused'],cards:[]}
    ];
    assert.equal(action,'getDecks');
    assert.deepEqual(params.cards,[10,11,12]);
    return {Main:[10],'Main::Subdeck':[11,12]};
  };
  assert.deepEqual(await anki.decksByTag(),new Map([
    ['Unit',new Set(['Main','Main::Subdeck'])],
    ['Unit::Extra',new Set(['Main::Subdeck'])]
  ]));
});
test('most specific mapping wins and time is allocated without counting parent decks twice',()=>{
  const mappings={'Tobira':'Tobira','Tobira::H5':'Tobira H5','Other':'Tobira H5'};
  assert.equal(methodForDeck('Tobira::H5::Kanji',mappings),'Tobira H5');
  assert.equal(methodForDeck('Tobira::H6',mappings),'Tobira');
  assert.equal(methodForDeck('TobiraOther',mappings),'Anki');
  const result=dailyAnkiEntries([review(16,60000,{deck:'Tobira::H5'}),review(16,30000,{id:review(16).id+1,deck:'Other'}),review(16,30000,{id:review(16).id+2,deck:'Unmapped'})],now,mappings)[0];
  assert.equal(result.minutes,2);assert.equal(result.subject,'Anki · 3 herhalingen');
  assert.deepEqual(result.weights,{'Anki':25,'Tobira H5':75});
});
test('mapping changes update the same daily row even with unchanged minutes',async()=>{
  let rows=[],updates=0;
  const store={read:async()=>rows,add:async e=>rows.push(e),update:async e=>{rows=[e];updates++;}};
  const anki={reviews:async()=>[review(16,60000,{deck:'Deck'})]};
  await syncAnki(store,anki,now);
  await syncAnki(store,anki,now,'2026-11-16',{'Deck':'Tobira'});
  assert.equal(updates,1);assert.equal(rows.length,1);assert.equal(rows[0].materials,'Tobira');
});
test('multiple methods share a deck time equally and merge with other decks without duplicate time',()=>{
  const a=review(16,60000,{deck:'Main::Child'}),b=review(16,60000,{id:a.id+1,deck:'Other'});
  const entry=dailyAnkiEntries([a,b],now,{'Main':'A, B, A','Other':'B'})[0];
  assert.equal(entry.minutes,2);assert.equal(entry.subject,'Anki · 2 herhalingen');
  assert.deepEqual(entry.weights,{A:25,B:75});
  const zero=dailyAnkiEntries([{...a,time:0},{...b,time:0}],now,{'Main':'A, B','Other':'B'})[0];
  assert.deepEqual(zero.weights,{A:25,B:75});
});

test('one filtered deck routes reviews to each original deck and exact subdeck',async()=>{
 const anki=new AnkiConnect();
 anki.call=async(action,params)=>{
  if(action==='findCards')return {
   'rated:31':[10,11,12],
   'rated:31 deck:filtered':[10,11],
   'rated:31 deck:filtered did:1':[10,11],
   'rated:31 deck:filtered did:2':[10],
   'rated:31 deck:filtered did:3':[11],
   'rated:31 deck:filtered did:4':[]
  }[params.query];
  if(action==='getDecks')return {'Custom Study Session':[10,11]};
  if(action==='deckNamesAndIds')return {'Custom Study Session':1,Main:2,'Main::Subdeck':3,Other:4};
  if(action==='cardsInfo')return params.cards.map(cardId=>({cardId,note:20,deckName:cardId===12?'Other':'Custom Study Session'}));
  if(action==='notesInfo')return [{noteId:20,tags:[]}];
  assert.equal(action,'getReviewsOfCards');
  return Object.fromEntries(params.cards.map(id=>[id,[review(16,id===11?60000:30000,{id:review(16).id+id,type:id===12?1:3})]]));
 };
 const reviews=await anki.reviews();
 assert.deepEqual(reviews.map(item=>item.deck),['Main','Main::Subdeck','Other']);
 const [entry]=dailyAnkiEntries(reviews,now,{Main:'Book','Main::Subdeck':'Chapter',Other:'Other'});
 assert.deepEqual(entry.weights,{Book:25,Chapter:50,Other:25});
});
