import test from 'node:test';
import assert from 'node:assert/strict';
import {AnkiConnect,dailyAnkiEntries,syncAnki,methodForDeck} from '../anki.js';
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
    return {ok:true,json:async()=>({error:null,result:request.action==='findCards'?Array.from({length:251},(_,i)=>i):request.action==='getDecks'?{'Tobira':request.params.cards}:Object.fromEntries(request.params.cards.map(id=>[id,[review(16,30000,{id:+now+id})]]))})};
  });
  await anki.reviews();
  assert.deepEqual(actions.map(x=>x.action),['findCards','getDecks','getReviewsOfCards','getDecks','getReviewsOfCards']);
  assert.equal(actions[2].params.cards.length,250);assert.equal(actions[4].params.cards.length,1);
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
