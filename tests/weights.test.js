import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWeights,parseWeights,methodShares,equalPercentages} from '../weights.js';
import {chartData} from '../analytics.js';
import {SheetsStore,HEADERS,parseRows,validateEntry} from '../data.js';
const materials='Tobira H1, Tobira H2, VOCAB N3';
const entry={id:'weighted',date:'2026-11-15',type:'sessie',subject:'Anki',minutes:60,materials,weights:{'Tobira H1':10,'Tobira H2':30,'VOCAB N3':60}};
const chart={period:'1',group:'method',method:''};
test('weighted hours sum to total and filters use only allocated hours for every grouping',()=>{
 const data=chartData([entry],chart,'2026-11-15');assert.equal(data.hours,1);assert.equal(data.points.find(p=>p.label==='Tobira H1').hours,.1);
 for(const group of ['day','type','method'])assert.equal(chartData([entry],{...chart,group,method:JSON.stringify(['Tobira H1','Tobira H2'])},'2026-11-15').hours,.4);
 assert.deepEqual(methodShares({...entry,weights:null}).map(([,share])=>share),[1/3,1/3,1/3]);
});
test('invalid weights cannot be silently normalized or saved',()=>{
 for(const weights of [{},{'Tobira H1':100},{...entry.weights,'VOCAB N3':59},{...entry.weights,'VOCAB N3':NaN},{...entry.weights,'VOCAB N3':-1}])assert.throws(()=>validateWeights(materials,weights),/100%/);
 assert.throws(()=>parseWeights('bad',materials));assert.equal(parseWeights('',materials),null);
 assert.equal(Object.values(equalPercentages(['a','b','c'])).reduce((s,v)=>s+v,0),100);
 assert.throws(()=>validateEntry({...entry,materials:'Tobira',weights:null}),/hoofdstuk/);
});
test('weights round trip in O while updates preserve all Notion fields J:N',async()=>{
 const row=[entry.date,entry.type,entry.subject,entry.id,'original','name',60,1,materials,'homework',true,'notion date',0,'notion studied',JSON.stringify(entry.weights)];
 const source=[HEADERS,row],calls=[];
 const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({values:source})};});
 const [read]=await store.read();assert.deepEqual(read.weights,entry.weights);
 await store.update({...read,weights:null});const updates=JSON.parse(calls.at(-1).options.body).data;
 assert.deepEqual(updates.at(-1),{range:"'Sheet1'!O2:O2",values:[['']]});
 assert.ok(!updates.some(u=>/![J-N]/.test(u.range)));assert.deepEqual(row.slice(9,14),['homework',true,'notion date',0,'notion studied']);
 const newStore=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({values:[HEADERS]})};});
 await newStore.add(entry);const saved=JSON.parse(calls.at(-1).options.body).values[0];assert.equal(saved.length,15);assert.deepEqual(parseRows([saved])[0].weights,entry.weights);
});
