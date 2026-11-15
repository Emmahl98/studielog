import test from 'node:test';
import assert from 'node:assert/strict';
import {chartData,ChartStore,CHART_HEADERS,validateChart} from '../analytics.js';
import {materialList} from '../materials.js';
const config={id:'one',name:'Test',period:'3',group:'day',view:'bar',method:'',from:'',to:''};
const entries=[{date:'2026-11-12',minutes:500,type:'les',materials:'Tobira'},{date:'2026-11-13',minutes:60,type:'sessie',materials:'Tobira, Tobira H6'},{date:'2026-11-15',minutes:30,type:'les',materials:'Tobira H6'},{date:'2026-11-15',minutes:null,type:'les',materials:''},{date:'2026-11-16',minutes:500,type:'les',materials:''}];
test('rolling ranges include today, zero days, missing durations and exclude tomorrow',()=>{
 const d=chartData(entries,config,'2026-11-15');assert.equal(d.hours,1.5);assert.equal(d.missing,1);assert.deepEqual(d.points.map(p=>p.hours),[1,0,.5]);
 const week=chartData(entries,{...config,period:'7'},'2026-11-15');assert.equal(week.points.length,7);assert.equal(week.hours,590/60);
});
test('method grouping divides multi-method hours without double counting',()=>{
 const d=chartData(entries,{...config,group:'method'},'2026-11-15');assert.equal(d.points.reduce((sum,p)=>sum+p.hours,0),1.5);assert.equal(d.points.find(p=>p.label==='Tobira H6').hours,1);
 const filtered=chartData(entries,{...config,method:'Tobira H6'},'2026-11-15');assert.equal(filtered.hours,1.5);
 const custom=chartData(entries,{...config,period:'custom',from:'2026-11-13',to:'2026-11-13'},'2026-11-15');assert.equal(custom.hours,1);
 assert.throws(()=>validateChart({...config,period:'custom',from:'2026-11-20',to:'2026-11-01'}));
});
test('Notion material labels normalize without losing chapters or unrelated names',()=>{
 assert.deepEqual(materialList('H6【とびら】 (https://app.notion.com/p/abc), 上級へのとびら (https://app.notion.com/p/book), H5【とびら】, VOCAB N3, Tobira H6'),['Tobira H6','Tobira','Tobira H5','VOCAB N3']);
});
test('chart settings survive edits, retries and soft deletion in their own sheet',async()=>{
 const rows=[CHART_HEADERS];const store=new ChartStore({async request(path,options){assert.ok(decodeURIComponent(path).includes("'Grafieken'!"));if(!options)return{values:rows};const values=JSON.parse(options.body).values;if(options.method==='POST')rows.push(...values);else rows[Number(decodeURIComponent(path).match(/!A(\d+):I/)[1])-1]=values[0];return{};}});
 await store.save(config);await store.save(config);assert.equal(rows.length,2);await store.save({...config,name:'=Literal',period:'7',view:'line'});assert.equal((await store.read())[0].name,'=Literal');await store.remove(config.id);assert.equal((await store.read())[0].status,'verwijderd');await assert.rejects(()=>store.save(config),/verwijderd/);
});

test('today period only counts today and is a valid chart option',()=>{
 const chart={...config,period:'1'};validateChart(chart);
 const data=chartData(entries,chart,'2026-11-15');assert.equal(data.hours,.5);assert.equal(data.points.length,1);assert.equal(data.from,'2026-11-15');assert.equal(data.to,'2026-11-15');
});
