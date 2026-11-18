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
 const filtered=chartData(entries,{...config,method:'Tobira H6'},'2026-11-15');assert.equal(filtered.hours,1);
 const custom=chartData(entries,{...config,period:'custom',from:'2026-11-13',to:'2026-11-13'},'2026-11-15');assert.equal(custom.hours,1);
 assert.throws(()=>validateChart({...config,period:'custom',from:'2026-11-20',to:'2026-11-01'}));
});
test('Notion material labels normalize without losing chapters or unrelated names',()=>{
 assert.deepEqual(materialList('H6【とびら】 (https://app.notion.com/p/abc), 上級へのとびら (https://app.notion.com/p/book), H5【とびら】, VOCAB N3, Tobira H6'),['Tobira H6','Tobira','Tobira H5','VOCAB N3']);
});
test('chart settings survive edits, retries and soft deletion in their own sheet',async()=>{
 const rows=[CHART_HEADERS];const store=new ChartStore({async request(path,options){assert.ok(decodeURIComponent(path).includes("'Grafieken'!"));if(!options)return{values:rows};const values=JSON.parse(options.body).values;if(options.method==='POST')rows.push(...values);else rows[Number(decodeURIComponent(path).match(/!A(\d+):K/)[1])-1]=values[0];return{};}});
 await store.save(config);await store.save(config);assert.equal(rows.length,2);await store.save({...config,name:'=Literal',period:'7',view:'line'});assert.equal((await store.read())[0].name,'=Literal');await store.remove(config.id);assert.equal((await store.read())[0].status,'verwijderd');await assert.rejects(()=>store.save(config),/verwijderd/);
});

test('today period only counts today and is a valid chart option',()=>{
 const chart={...config,period:'1'};validateChart(chart);
 const data=chartData(entries,chart,'2026-11-15');assert.equal(data.hours,.5);assert.equal(data.points.length,1);assert.equal(data.from,'2026-11-15');assert.equal(data.to,'2026-11-15');
});

test('chart sorting supports dates, natural textbook names and hours in both directions',()=>{
 const dates=chartData(entries,{...config,sort:'label-desc'},'2026-11-15');assert.deepEqual(dates.points.map(p=>p.label),['2026-11-15','2026-11-14','2026-11-13']);
 const books=[{date:'2026-11-15',minutes:20,materials:'Tobira H10'},{date:'2026-11-15',minutes:40,materials:'Tobira H2'}];
 const chart={...config,group:'method'};
 assert.deepEqual(chartData(books,{...chart,sort:'label-asc'},'2026-11-15').points.map(p=>p.label),['Tobira H2','Tobira H10']);
 assert.equal(chartData(books,{...chart,sort:'label-desc'},'2026-11-15').points[0].label,'Tobira H10');
 assert.equal(chartData(books,{...chart,sort:'hours-asc'},'2026-11-15').points[0].label,'Tobira H10');
 assert.equal(chartData(books,{...chart,sort:'hours-desc'},'2026-11-15').points[0].label,'Tobira H2');
});


test('multiple selected methods hide other groups and preserve allocated hours',()=>{
 const chart={...config,group:'method',method:JSON.stringify(['Tobira','Tobira H6'])};
 const d=chartData(entries,chart,'2026-11-15');
 assert.deepEqual(d.points.map(p=>p.label).sort(),['Tobira','Tobira H6']);
 assert.equal(d.hours,1.5);
 const one=chartData(entries,{...chart,method:JSON.stringify(['Tobira'])},'2026-11-15');
 assert.deepEqual(one.points,[{label:'Tobira',hours:.5}]);assert.equal(one.hours,.5);
 assert.equal(chartData(entries,{...config,method:'[]'},'2026-11-15').hours,1.5);
 assert.equal(chartData(entries,{...config,method:chart.method},'2026-11-15').hours,1.5);
});

test('multiple method choices survive saving and reloading',async()=>{
 const rows=[CHART_HEADERS];const store=new ChartStore({async request(path,options){if(!options)return {values:rows};rows.push(...JSON.parse(options.body).values);return {};}});
 const method=JSON.stringify(['Tobira','Tobira H6']);await store.save({...config,method});
 assert.equal((await store.read())[0].method,method);
});

test('JLPT, book and general-level charts allocate the matching method hours',()=>{
 const catalog=[
  {name:'Hoofdstuk 1',type:'Boek',group:'Tobira',levels:['N4','N3']},
  {name:'Hoofdstuk 2',type:'Boek',group:'Tobira',levels:['N3']},
  {name:'Grammatica',type:'Niveau algemeen',levels:['N3']}
 ];
 const date='2026-11-15';
 const activity=[
  {date,minutes:100,materials:'Hoofdstuk 1, Grammatica',weights:{'Hoofdstuk 1':60,Grammatica:40}},
  {date,minutes:30,materials:'Hoofdstuk 2'},
  {date,minutes:20,materials:'Anders'},
  {date,minutes:null,materials:'Grammatica'}
 ];
 const run=(group,method='')=>chartData(activity,{...config,group,method},date,catalog);
 const jlpt=run('jlpt');
 assert.deepEqual(jlpt.points.map(p=>[p.label,p.hours]),[['JLPT N3',100/60],['JLPT N4',.5]]);
 assert.equal(jlpt.hours,130/60);
 assert.equal(jlpt.count,3);
 assert.equal(jlpt.missing,1);
 assert.deepEqual(run('book').points,[{label:'Tobira',hours:1.5}]);
 assert.deepEqual(run('general-level').points,[{label:'Grammatica',hours:40/60}]);
 assert.deepEqual(run('jlpt','Hoofdstuk 1').points,[{label:'JLPT N3',hours:.5},{label:'JLPT N4',hours:.5}]);
 for(const group of ['jlpt','book','general-level'])assert.doesNotThrow(()=>validateChart({...config,group}));
});
