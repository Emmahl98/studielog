import test from 'node:test';
import assert from 'node:assert/strict';
import {HEADERS,validDate,groupEntries,parseRows,SheetsStore} from '../data.js';
test('calendar dates and multiple entries per day',()=>{
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true);
  const rows=parseRows([['2026-11-15','sessie','Kanji','1','2026-11-15T10:00:00Z'],['2026-11-15','les','Grammatica','2','2026-11-15T12:00:00Z'],['2026-11-14','les','Lezen','3',''],['wrong','les','x']]);
  assert.equal(rows.length,3);assert.equal(groupEntries(rows).get('2026-11-15').length,2);
  assert.equal(groupEntries(rows,'les').get('2026-11-15')[0].subject,'Grammatica');
  assert.equal([...groupEntries(rows).keys()][0],'2026-11-15');
});
test('append stores literal text and never overwrites earlier entries',async()=>{
  const calls=[];const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'test-token',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>options.method==='POST'?{}:{values:[HEADERS]}};});
  await store.add({date:'2026-11-15',type:'sessie',subject:'=1+1 <script>',id:'unique',createdAt:'2026-11-15T12:00:00Z'});
  assert.equal(calls.length,2);assert.match(calls[1].url,/:append\?valueInputOption=RAW/);
  assert.equal(JSON.parse(calls[1].options.body).values[0][2],'=1+1 <script>');
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
});
test('retry after an uncertain save does not append the same ID twice',async()=>{
  let writes=0;const entry={date:'2026-11-15',type:'les',subject:'Les 1',id:'saved-id',createdAt:''};
  const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(_url,options)=>{if(options.method==='POST')writes++;return{ok:true,json:async()=>({values:[HEADERS,[entry.date,entry.type,entry.subject,entry.id,entry.createdAt]]})};});
  await store.add(entry);assert.equal(writes,0);
});
test('expired tokens and unexpected schema stop writes',async()=>{
  const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> '',()=>{throw Error('must not fetch');});
  await assert.rejects(store.read(),/Verbind eerst/);
  const mismatched=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async()=>({ok:true,json:async()=>({values:[['Other headers']]})}));
  await assert.rejects(mismatched.read(),/kolommen/);
});
