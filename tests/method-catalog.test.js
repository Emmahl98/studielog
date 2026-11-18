import test from 'node:test';
import assert from 'node:assert/strict';
import {MethodsStore,METHOD_HEADERS,methodInfo,resolveEntry,resolveMaterials,methodNames,validateMethod} from '../method-catalog.js';
import {SheetsStore,HEADERS,parseRows} from '../data.js';
import {AnkiMappingsStore} from '../anki-mappings.js';
import {tagColors} from '../method-tags.js';
const method={id:'stable',name:'Tobira H1',color:'#31584a',description:'Hoofdstuk één',group:'Tobira',aliases:[],status:'actief'};
function fixture(){const rows=[METHOD_HEADERS];const api={methodCatalog:[],async request(path,options){if(path.startsWith('?'))return {sheets:[{properties:{title:'Leermethodes'}}]};if(!options)return {values:rows};const data=JSON.parse(options.body);if(options.method==='POST')rows.push(...data.values);else {const i=Number(decodeURIComponent(path).match(/!A(\d+):[HI]/)[1])-1;rows[i]=data.values[0];}return {};}};return {rows,api,store:new MethodsStore(api)};}
test('catalog edits preserve identity and aliases, rename survives reload and retry',async()=>{const {store,rows}=fixture();await store.save(method);await store.save({...method,name:'Tobira hoofdstuk 1'});await store.save({...method,name:'Tobira hoofdstuk 1'});assert.equal(rows.length,2);const catalog=await store.read();assert.equal(catalog[0].id,'stable');assert.deepEqual(catalog[0].aliases,['Tobira H1']);assert.equal(methodInfo('Tobira H1',catalog).name,'Tobira hoofdstuk 1');assert.equal(resolveMaterials('Tobira H1, VOCAB N3',catalog),'Tobira hoofdstuk 1, VOCAB N3');});
test('duplicate names and aliases cannot join unrelated histories',async()=>{const {store}=fixture();await store.save(method);await store.save({...method,name:'Chapter 1'});await assert.rejects(()=>store.save({...method,id:'other'}),/al in gebruik/);for(const patch of [{name:'A, B'},{color:'url(bad)'},{description:'x'.repeat(1001)}])assert.throws(()=>validateMethod({...method,...patch}));});
test('archiving hides future choices while preserving selected and historic tags',()=>{const archived={...method,status:'gearchiveerd'};assert.deepEqual(methodNames([archived],[{materials:'Tobira H1'}]),[]);assert.deepEqual(methodNames([archived],[],['Tobira H1']),['Tobira H1']);assert.equal(methodInfo('Tobira H1',[archived]).color,method.color);});
test('renamed entries preserve percentages and writes keep names and weight keys in agreement',async()=>{const renamed={...method,name:'Chapter 1',aliases:['Tobira H1']};const entry={date:'2026-11-17',type:'sessie',subject:'Anki',id:'entry',minutes:30,materials:'Tobira H1, VOCAB N3',weights:{'Tobira H1':40,'VOCAB N3':60}};const row=[entry.date,entry.type,entry.subject,entry.id,'','',30,.5,entry.materials,'homework',true,'notion',0,'text',JSON.stringify(entry.weights)];const rows=[HEADERS,row];let updates;const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(_url,options)=>({ok:true,json:async()=>{if(options.method==='POST'){updates=JSON.parse(options.body).data;for(const u of updates){if(u.range.includes('!I2'))row[8]=u.values[0][0];if(u.range.includes('!O2'))row[14]=u.values[0][0];}}return {values:rows};}}));store.methodCatalog=[renamed];const [read]=await store.read();assert.deepEqual(read.weights,{'Chapter 1':40,'VOCAB N3':60});await store.update({...read,weights:{'Chapter 1':25,'VOCAB N3':75}});assert.ok(updates.some(u=>u.range.includes('!I2')));assert.doesNotThrow(()=>parseRows([row]));assert.deepEqual((await store.read())[0].weights,{'Chapter 1':25,'VOCAB N3':75});assert.equal(row[9],'homework');});
test('Anki deck mappings resolve renamed method names without rewriting source',async()=>{const rows=[['Profiel','Deck','Lesmethode'],['User','Deck','Tobira H1']];const api={methodCatalog:[{...method,name:'Chapter 1',aliases:['Tobira H1']}],async request(path){return path.startsWith('?')?{sheets:[{properties:{title:'AnkiDecks'}}]}:{values:rows};}};assert.deepEqual(await new AnkiMappingsStore(api).read('User'),{Deck:'Chapter 1'});assert.equal(rows[1][2],'Tobira H1');});
test('tag text chooses contrasting foreground for light and dark custom colors',()=>{assert.equal(tagColors('#ffffff').foreground,'#17201c');assert.equal(tagColors('#000000').foreground,'#ffffff');});

test('group rename, membership and color update are atomic and preserve method details',async()=>{
 const rows=[METHOD_HEADERS,['a','Tobira H1','#31584a','Keep description','Tobira','[]','actief'],['b','Tobira H2','#31584a','','Tobira','[]','gearchiveerd'],['c','VOCAB N3','#68509c','','N3','[]','actief'],['d','Kanji','#985029','','N3','[]','actief']];let writes=[];
 const api={async request(path,options){if(path.startsWith('?'))return {sheets:[{properties:{title:'Leermethodes'}}]};if(!options)return {values:rows};const body=JSON.parse(options.body);if(path==='/values:batchUpdate'){writes.push(body);for(const update of body.data){const [,column,n]=update.range.match(/!([CE])(\d+):/);rows[Number(n)-1][column==='C'?2:4]=update.values[0][0];}}else {const n=Number(decodeURIComponent(path).match(/!A(\d+):[HI]/)[1]);rows[n-1]=body.values[0];}return {};}};
 const store=new MethodsStore(api);await store.saveGroup({original:'Tobira',name:'N3',color:'#112233',ids:['a','c']});
 assert.equal(writes.length,1);assert.ok(writes[0].data.every(d=>/![CE]\d+:[CE]\d+$/.test(d.range)));
 assert.deepEqual(rows.slice(1).map(r=>[r[0],r[4],r[2]]),[['a','N3','#112233'],['b','','#31584a'],['c','N3','#112233'],['d','N3','#112233']]);assert.equal(rows[1][3],'Keep description');assert.equal(rows[2][6],'gearchiveerd');
 await store.save({id:'d',name:'Kanji',color:'#ffffff',description:'',group:'N3',aliases:[],status:'actief'});assert.equal(rows[4][2],'#112233');
 await store.saveGroup({original:'N3',remove:true});assert.deepEqual(rows.slice(1).map(r=>r[4]),['','','','']);assert.equal(rows[1][2],'#112233');
 await assert.rejects(()=>store.saveGroup({name:'New',color:'#123456',ids:[]}),/minimaal/);await assert.rejects(()=>store.saveGroup({name:'Overig',color:'#123456',ids:['a']}),/gereserveerd/);
});

test('legacy methods can receive a type and keep it when updated by an older caller',async()=>{
 const rows=[METHOD_HEADERS.slice(0,7),[method.id,method.name,method.color,method.description,method.group,'[]',method.status]];
 const api={async request(path,options){
  if(path.startsWith('?'))return {sheets:[{properties:{title:'Leermethodes'}}]};
  if(!options)return {values:rows};
  const {values}=JSON.parse(options.body);
  if(decodeURIComponent(path).includes('!H1'))rows[0][7]=values[0][0];
  else rows[1]=values[0];
  return {};
 }};
 const store=new MethodsStore(api);
 assert.equal((await store.read())[0].type,'');
 await store.save({...method,type:'Boek'});
 assert.equal(rows[0][7],'Type');
 assert.equal((await store.read())[0].type,'Boek');
 await store.save(method);
 assert.equal((await store.read())[0].type,'Boek');
 await store.save({...method,type:'Niveau algemeen'});
 assert.equal((await store.read())[0].type,'Niveau algemeen');
 await assert.rejects(store.save({...method,type:'Andere'}),/Boek of Niveau algemeen/);
});

test('group type updates every resulting member in one write, including on a legacy sheet',async()=>{
 const rows=[METHOD_HEADERS.slice(0,7),
  ['a','A','#31584a','','Oud','[]','actief'],
  ['b','B','#31584a','','Oud','[]','actief'],
  ['c','C','#31584a','','Nieuw','[]','gearchiveerd'],
  ['d','D','#31584a','','Overige','[]','actief']];
 const writes=[];
 const api={async request(path,options){
  if(path.startsWith('?'))return {sheets:[{properties:{title:'Leermethodes'}}]};
  if(!options)return {values:rows};
  assert.equal(path,'/values:batchUpdate');
  const {data}=JSON.parse(options.body);
  writes.push(data);
  for(const item of data){
   const [,column,row]=item.range.match(/!([CEH])(\d+)/);
   rows[Number(row)-1][{C:2,E:4,H:7}[column]]=item.values[0][0];
  }
 }};
 const store=new MethodsStore(api);
 await store.saveGroup({original:'Oud',name:'Nieuw',color:'#31584a',ids:['a','d'],type:'Boek'});
 assert.equal(writes.length,1);
 assert.deepEqual(rows.map(row=>row[7]),['Type','Boek',undefined,'Boek','Boek']);
 await store.saveGroup({original:'Nieuw',name:'Nieuw',color:'#31584a',ids:['a','c','d']});
 assert.equal(writes.length,1);
 await store.saveGroup({original:'Nieuw',remove:true,type:'Niveau algemeen'});
 assert.deepEqual(rows.slice(1).map(row=>row[7]),['Boek',undefined,'Boek','Boek']);
});

test('a seven-column sheet grows before the first group or individual type write',async()=>{
 for(const action of ['group','method']){
  const rows=[METHOD_HEADERS.slice(0,7),[method.id,method.name,method.color,method.description,method.group,'[]',method.status]];
  const properties={title:'Leermethodes',sheetId:42,gridProperties:{columnCount:7}};
  let expanded=0;
  const api={async request(path,options){
   if(path.startsWith('?'))return {sheets:[{properties}]};
   const range=decodeURIComponent(path);
   if(!options){
    assert.ok(range.includes(properties.gridProperties.columnCount===7?'!A1:G':'!A1:H'));
    return {values:rows};
   }
   const body=JSON.parse(options.body);
   if(path===':batchUpdate'){
    assert.deepEqual(body.requests,[{appendDimension:{sheetId:42,dimension:'COLUMNS',length:1}}]);
    properties.gridProperties.columnCount++;
    expanded++;
   }else{
    assert.equal(properties.gridProperties.columnCount,8);
    if(path==='/values:batchUpdate')for(const item of body.data)rows[Number(item.range.match(/!H(\d+)/)[1])-1][7]=item.values[0][0];
    else if(range.includes('!H1'))rows[0][7]=body.values[0][0];
    else rows[1]=body.values[0];
   }
   return {};
  }};
  const store=new MethodsStore(api);
  const save=()=>action==='group'?store.saveGroup({original:'Tobira',name:'Tobira',color:method.color,ids:[method.id],type:'Boek'}):store.save({...method,type:'Boek'});
  await save();
  await save();
  assert.equal(expanded,1);
  assert.equal((await store.read())[0].type,'Boek');
 }
});

test('multiple JLPT levels survive legacy sheet expansion and subsequent edits',async()=>{
 const rows=[METHOD_HEADERS.slice(0,8),[method.id,method.name,method.color,method.description,method.group,'[]',method.status,'Boek']];
 const properties={title:'Leermethodes',sheetId:42,gridProperties:{columnCount:8}};
 let expansions=0;
 const api={async request(path,options){
  if(path.startsWith('?'))return {sheets:[{properties}]};
  if(!options)return {values:rows};
  const body=JSON.parse(options.body);
  if(path===':batchUpdate'){
   assert.deepEqual(body.requests,[{appendDimension:{sheetId:42,dimension:'COLUMNS',length:1}}]);
   properties.gridProperties.columnCount++;
   expansions++;
  }else if(decodeURIComponent(path).includes('!I1')){
   rows[0].push(body.values[0][0]);
  }else{
   assert.ok(decodeURIComponent(path).includes('!A2:I2'));
   rows[1]=body.values[0];
  }
  return {};
 }};
 const store=new MethodsStore(api);
 assert.deepEqual((await store.read())[0].levels,[]);
 await store.save({...method,levels:['N2','N5','N5']});
 assert.deepEqual((await store.read())[0].levels,['N5','N2']);
 await store.save({...method,description:'Nieuwe omschrijving'});
 assert.deepEqual((await store.read())[0].levels,['N5','N2']);
 await assert.rejects(store.save({...method,levels:['N6']}),/JLPT/);
 await store.save({...method,levels:[]});
 assert.deepEqual((await store.read())[0].levels,[]);
 assert.equal(expansions,1);
});
