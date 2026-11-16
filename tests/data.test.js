import test from 'node:test';
import assert from 'node:assert/strict';
import {HEADERS,validDate,groupEntries,parseRows,SheetsStore,validMinutes} from '../data.js';
test('browser fetch is called without binding it to the store',async()=>{
  let receiver;
  const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async function(){receiver=this;return{ok:true,json:async()=>({values:[HEADERS]})};});
  await store.read();
  assert.equal(receiver,undefined);
});
test('calendar dates and multiple entries per day',()=>{
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true);
  const rows=parseRows([['2026-11-15','sessie','Kanji','1','2026-11-15T10:00:00Z'],['2026-11-15','les','Grammatica','2','2026-11-15T12:00:00Z'],['2026-11-14','les','Lezen','3',''],['wrong','les','x']]);
  assert.equal(rows.length,3);assert.equal(groupEntries(rows).get('2026-11-15').length,2);
  assert.equal(groupEntries(rows,'les').get('2026-11-15')[0].subject,'Grammatica');
  assert.equal([...groupEntries(rows).keys()][0],'2026-11-15');
});
test('append stores literal text and never overwrites earlier entries',async()=>{
  const calls=[];const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'test-token',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>options.method==='POST'?{}:{values:[HEADERS]}};});
  await store.add({date:'2026-11-15',type:'sessie',subject:'=1+1 <script>',id:'unique',createdAt:'2026-11-15T12:00:00Z',minutes:25});
  assert.equal(calls.length,2);assert.match(calls[1].url,/:append\?valueInputOption=RAW/);
  assert.equal(JSON.parse(calls[1].options.body).values[0][2],'=1+1 <script>');
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
  assert.deepEqual(JSON.parse(calls[1].options.body).values[0].slice(5),['',25,0.4,'','','','','','','']);
});
test('retry after an uncertain save does not append the same ID twice',async()=>{
  let writes=0;const entry={date:'2026-11-15',type:'les',subject:'Les 1',id:'saved-id',createdAt:'',minutes:50};
  const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(_url,options)=>{if(options.method==='POST')writes++;return{ok:true,json:async()=>({values:[HEADERS,[entry.date,entry.type,entry.subject,entry.id,entry.createdAt]]})};});
  await store.add(entry);assert.equal(writes,0);
});
test('minutes are read from imported rows and missing values stay unknown',()=>{
  const rows=parseRows([['2026-11-15','les','Les','1','','',50,0.8],['2026-11-15','sessie','Oud item','2'],['2026-11-14','sessie','Tekstgetal','3','','','25']]);
  assert.deepEqual(rows.map(row=>row.minutes),[50,null,25]);
  for(const value of [-1,1.5,NaN,Infinity,'25'])assert.equal(validMinutes(value),false);
  assert.equal(validMinutes(0),true);
  assert.equal(validMinutes(43800),true);
});
test('editing resolves the current ID row and writes only editable fields',async()=>{
  const calls=[];
  const source=[HEADERS,['2026-11-15','les','Ander item','other','','',50,0.8],[],['2026-11-14','sessie','Oorspronkelijk','target','original-time','Notion-naam',25,0.4]];
  const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>options.method==='POST'?{}:{values:source}};});
  await store.update({date:'2026-11-13',type:'les',subject:'Aangepast',id:'target',minutes:65});
  assert.match(calls[1].url,/values:batchUpdate$/);
  const body=JSON.parse(calls[1].options.body);
  assert.equal(body.valueInputOption,'RAW');
  assert.deepEqual(body.data,[{range:"'Sheet1'!A4:C4",values:[['2026-11-13','les','Aangepast']]},{range:"'Sheet1'!G4:H4",values:[[65,1.1]]}]);
});
test('editing refuses missing and duplicate IDs and invalid durations',async()=>{
  let writes=0;
  const row=['2026-11-15','les','Les','duplicate','','',50,0.8];
  const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(_url,options)=>{if(options.method==='POST')writes++;return{ok:true,json:async()=>({values:[HEADERS,row,row]})};});
  const entry={date:'2026-11-15',type:'les',subject:'Les',id:'duplicate',minutes:50};
  await assert.rejects(store.update(entry),/dubbel/);
  await assert.rejects(store.update({...entry,id:'missing'}),/niet meer gevonden/);
  await assert.rejects(store.add({...entry,minutes:-5}),/minuten/);
  assert.equal(writes,0);
});
test('materials from Notion stay intact unless explicitly changed',async()=>{
 const calls=[],source=[HEADERS,['2026-11-15','les','Studie','id','created','Original',30,.5,'H6【とびら】 (https://app.notion.com/p/book)','Keep homework']];
 const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(url,options)=>{calls.push(options);return{ok:true,json:async()=>({values:source})};});
 const [entry]=await store.read();assert.equal(entry.materials,'Tobira H6');
 await store.update(entry);assert.equal(JSON.parse(calls.at(-1).body).data.length,2);
 await store.update({...entry,materials:'Tobira H5, =Literal'});const updates=JSON.parse(calls.at(-1).body).data;assert.deepEqual(updates[2],{range:"'Sheet1'!I2:I2",values:[['Tobira H5, =Literal']]});assert.equal(source[1][9],'Keep homework');
});
test('expired tokens and unexpected schema stop writes',async()=>{
  const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> '',()=>{throw Error('must not fetch');});
  await assert.rejects(store.read(),/Verbind eerst/);
  const mismatched=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async()=>({ok:true,json:async()=>({values:[['Other headers']]})}));
  await assert.rejects(mismatched.read(),/kolommen/);
});

