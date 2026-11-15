import test from 'node:test';
import assert from 'node:assert/strict';
import {GoalsStore,GOAL_HEADERS,parseGoals} from '../goals.js';
function backend(){
  const rows=[GOAL_HEADERS,['initial','Mijn urendoel',1000,'actief','created','updated','','']];
  const calls=[];const sheets={async request(path,options={}){
    calls.push({path,options});
    if(!options.method)return{values:rows.map(row=>[...row])};
    const body=JSON.parse(options.body);
    if(path.includes(':append'))rows.push(...body.values);
    else{const match=decodeURIComponent(path).match(/!A(\d+):J/);assert.ok(match);rows[Number(match[1])-1]=body.values[0];}
    return{};
  }};
  return{rows,calls,store:new GoalsStore(sheets,()=> '2026-11-15T14:00:00Z')};
}
test('create and retry use a stable ID, names are literal, updates preserve creation',async()=>{
  const {store,rows}=backend();const goal={id:'new',name:'=Japans <1000>',hours:500.5};
  await store.create(goal);await store.create(goal);assert.equal(rows.length,3);assert.equal(rows[2][1],goal.name);
  const created=rows[2][4];await store.update({...goal,name:'Nieuwe naam',hours:600});
  assert.equal(rows[2][1],'Nieuwe naam');assert.equal(rows[2][2],600);assert.equal(rows[2][4],created);
});
test('archive freezes hours, restoring reactivates, removing never touches study rows',async()=>{
  const {store,rows,calls}=backend();
  await store.setStatus('initial','gearchiveerd',955.5);assert.equal(rows[1][3],'gearchiveerd');assert.equal(rows[1][7],955.5);
  await store.update({id:'initial',name:'Archiefnaam',hours:1200});assert.equal(rows[1][7],955.5);
  await store.setStatus('initial','gearchiveerd',999);assert.equal(rows[1][7],955.5);
  await store.setStatus('initial','actief');assert.equal(rows[1][6],'');assert.equal(rows[1][7],'');
  await store.setStatus('initial','verwijderd');await store.setStatus('initial','verwijderd');assert.equal(rows[1][3],'verwijderd');
  assert.ok(calls.every(call=>decodeURIComponent(call.path).includes("'Doelen'!")));
  await assert.rejects(store.setStatus('initial','actief'),/verwijderd/);
});
test('sorting and blank rows do not misdirect goal updates',async()=>{
  const {store,rows}=backend();rows.push([]);rows.push(rows.splice(1,1)[0]);
  await store.update({id:'initial',name:'Correcte rij',hours:123});assert.deepEqual(rows[1],[]);assert.equal(rows[2][1],'Correcte rij');
});
test('schedule dates survive reload and archive and can be cleared',async()=>{
 const {store,rows}=backend();
 await store.update({id:'initial',name:'Planning',hours:20,startDate:'2026-11-20',deadline:'2026-12-01'});
 let [goal]=await store.read();assert.equal(goal.startDate,'2026-11-20');assert.equal(goal.deadline,'2026-12-01');
 await store.setStatus(goal.id,'gearchiveerd',0);assert.deepEqual(rows[1].slice(8),['2026-11-20','2026-12-01']);
 await store.update({...goal,startDate:'',deadline:''});[goal]=await store.read();assert.equal(goal.startDate,'');assert.equal(goal.deadline,'');
});
test('bad names, hours, missing IDs and duplicate IDs block writes',async()=>{
  const {store,rows}=backend();
  for(const change of [{name:''},{hours:0},{hours:Infinity},{name:'x'.repeat(101)}])await assert.rejects(store.create({id:'new',name:'Doel',hours:100,...change}),/Vul/);
  await assert.rejects(store.update({id:'missing',name:'Doel',hours:100}),/niet meer gevonden/);
  rows.push([...rows[1]]);await assert.rejects(store.update({id:'initial',name:'Doel',hours:100}),/dubbel/);
  assert.throws(()=>parseGoals([['id','Doel',100,'onbekend']]),/ongeldige/);
});
test('highlight uses one settings cell, replaces the prior goal and can be cleared',async()=>{
 let selected='first';const calls=[];
 const sheets={async request(path,options){calls.push({path,options});const decoded=decodeURIComponent(path);
  if(decoded.includes("'Doelen'!"))return{values:[GOAL_HEADERS,['first','Een',10,'actief'],['second','Twee',20,'actief'],['archived','Oud',10,'gearchiveerd']]};
  if(!options)return{values:[['HighlightDoelID',selected]]};
  assert.ok(decoded.includes("'Instellingen'!B3"));selected=JSON.parse(options.body).values[0][0];return{};
 }};const store=new GoalsStore(sheets);
 await store.setHighlight('second');assert.equal(await store.readHighlight(),'second');
 await store.setHighlight('first');assert.equal(selected,'first');
 await assert.rejects(()=>store.setHighlight('archived'),/actief/);
 await store.setHighlight('');assert.equal(selected,'');
 assert.equal(calls.filter(c=>c.options).length,3);
});
