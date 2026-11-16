import test from 'node:test';
import assert from 'node:assert/strict';
import {AnkiMappingsStore} from '../anki-mappings.js';
test('missing mapping sheet is read without creating it; saving creates it and writes literal values',async()=>{
  const calls=[];
  const store=new AnkiMappingsStore({request:async(path,options)=>{calls.push({path,options});return {sheets:[]};}});
  assert.deepEqual(await store.read('User'),{});assert.equal(calls.length,1);
  await store.save('User',{'Deck':'=Tobira'});
  assert.equal(calls[2].path,':batchUpdate');
  assert.deepEqual(JSON.parse(calls[3].options.body).values,[['Profiel','Deck','Lesmethode'],['User','Deck','=Tobira']]);
  assert.match(calls[3].path,/valueInputOption=RAW/);
});
test('updating a profile preserves others and clears old trailing mappings',async()=>{
  const values=[['Profiel','Deck','Lesmethode'],['Other','X','Other method'],['User','A','A'],['User','B','B']];
  let written;
  const store=new AnkiMappingsStore({request:async(path,options)=>{if(options){written=JSON.parse(options.body).values;return{};}return path.startsWith('?')?{sheets:[{properties:{title:'AnkiDecks'}}]}:{values};}});
  await store.save('User',{'C':'C'});
  assert.deepEqual(written,[values[0],values[1],['User','C','C'],['','','']]);
  await store.save('User',{'D':'A, B, A'});
  assert.deepEqual(written[2],['User','D','A, B']);
  await assert.rejects(store.save('User',{'D':'A'.repeat(2001)}),/2000 tekens/);
});
test('unexpected schema prevents writing',async()=>{
  const store=new AnkiMappingsStore({request:async(path,options)=>{assert.equal(options,undefined);return path.startsWith('?')?{sheets:[{properties:{title:'AnkiDecks'}}]}:{values:[['Wrong']]};}});
  await assert.rejects(store.save('User',{D:'M'}),/kolommen/);
});
