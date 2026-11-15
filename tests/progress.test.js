import test from 'node:test';
import assert from 'node:assert/strict';
import {studyProgress,validGoal} from '../progress.js';
import {SheetsStore} from '../data.js';
test('hours use minutes rather than rounded exported hours',()=>{
  const result=studyProgress([{minutes:50},{minutes:25},{minutes:null}],2);
  assert.equal(result.hours,1.25);assert.equal(result.percentage,62.5);assert.equal(result.remaining,0.75);assert.equal(result.ratio,0.625);
});
test('empty and exceeded goals have valid ring values',()=>{
  assert.equal(studyProgress([],null).ratio,0);assert.equal(studyProgress([],null).percentage,null);
  const exceeded=studyProgress([{minutes:120}],1);assert.equal(exceeded.ratio,1);assert.equal(exceeded.percentage,200);assert.equal(exceeded.remaining,0);
  for(const value of [0,-1,NaN,Infinity,'10'])assert.equal(validGoal(value),false);
  assert.equal(validGoal(0.5),true);
});
test('goal is read and saved only in its settings cell',async()=>{
  const calls=[];const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>options.method?{}:{values:[['Instelling','Waarde'],['Urendoel',1000]]}};});
  assert.equal(await store.readGoal(),1000);await store.saveGoal(1200.5);
  assert.equal(calls.at(-1).options.method,'PUT');assert.match(decodeURIComponent(calls.at(-1).url),/'Instellingen'!B2/);assert.deepEqual(JSON.parse(calls.at(-1).options.body),{values:[[1200.5]]});
  await assert.rejects(store.saveGoal(0),/groter dan 0/);
});
test('blank goal stays unset and damaged settings prevent writes',async()=>{
  const blank=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async()=>({ok:true,json:async()=>({values:[['Instelling','Waarde'],['Urendoel']]})}));
  assert.equal(await blank.readGoal(),null);
  const damaged=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async()=>({ok:true,json:async()=>({values:[['Other']]})}));
  await assert.rejects(damaged.saveGoal(100),/gewijzigd/);
});
