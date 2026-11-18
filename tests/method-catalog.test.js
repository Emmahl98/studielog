import test from 'node:test';
import assert from 'node:assert/strict';
import {MethodsStore,METHOD_HEADERS,methodInfo,resolveEntry,resolveMaterials,methodNames,validateMethod} from '../method-catalog.js';
import {SheetsStore,HEADERS,parseRows} from '../data.js';
import {AnkiMappingsStore} from '../anki-mappings.js';
import {tagColors} from '../method-tags.js';
const method={id:'stable',name:'Tobira H1',color:'#31584a',description:'Hoofdstuk één',group:'Tobira',aliases:[],status:'actief'};
function fixture(){const rows=[METHOD_HEADERS];const api={methodCatalog:[],async request(path,options){if(path.startsWith('?'))return {sheets:[{properties:{title:'Leermethodes'}}]};if(!options)return {values:rows};const data=JSON.parse(options.body);if(options.method==='POST')rows.push(...data.values);else {const i=Number(decodeURIComponent(path).match(/!A(\d+):H/)[1])-1;rows[i]=data.values[0];}return {};}};return {rows,api,store:new MethodsStore(api)};}
test('catalog edits preserve identity and aliases, rename survives reload and retry',async()=>{const {store,rows}=fixture();await store.save(method);await store.save({...method,name:'Tobira hoofdstuk 1'});await store.save({...method,name:'Tobira hoofdstuk 1'});assert.equal(rows.length,2);const catalog=await store.read();assert.equal(catalog[0].id,'stable');assert.deepEqual(catalog[0].aliases,['Tobira H1']);assert.equal(methodInfo('Tobira H1',catalog).name,'Tobira hoofdstuk 1');assert.equal(resolveMaterials('Tobira H1, VOCAB N3',catalog),'Tobira hoofdstuk 1, VOCAB N3');});
test('duplicate names and aliases cannot join unrelated histories',async()=>{const {store}=fixture();await store.save(method);await store.save({...method,name:'Chapter 1'});await assert.rejects(()=>store.save({...method,id:'other'}),/al in gebruik/);for(const patch of [{name:'A, B'},{color:'url(bad)'},{description:'x'.repeat(1001)}])assert.throws(()=>validateMethod({...method,...patch}));});
test('archiving hides future choices while preserving selected and historic tags',()=>{const archived={...method,status:'gearchiveerd'};assert.deepEqual(methodNames([archived],[{materials:'Tobira H1'}]),[]);assert.deepEqual(methodNames([archived],[],['Tobira H1']),['Tobira H1']);assert.equal(methodInfo('Tobira H1',[archived]).color,method.color);});
test('renamed entries preserve percentages and writes keep names and weight keys in agreement',async()=>{const renamed={...method,name:'Chapter 1',aliases:['Tobira H1']};const entry={date:'2026-11-17',type:'sessie',subject:'Anki',id:'entry',minutes:30,materials:'Tobira H1, VOCAB N3',weights:{'Tobira H1':40,'VOCAB N3':60}};const row=[entry.date,entry.type,entry.subject,entry.id,'','',30,.5,entry.materials,'homework',true,'notion',0,'text',JSON.stringify(entry.weights)];const rows=[HEADERS,row];let updates;const store=new SheetsStore({spreadsheetId:'test',sheetName:'Sheet1'},()=> 'token',async(_url,options)=>({ok:true,json:async()=>{if(options.method==='POST'){updates=JSON.parse(options.body).data;for(const u of updates){if(u.range.includes('!I2'))row[8]=u.values[0][0];if(u.range.includes('!O2'))row[14]=u.values[0][0];}}return {values:rows};}}));store.methodCatalog=[renamed];const [read]=await store.read();assert.deepEqual(read.weights,{'Chapter 1':40,'VOCAB N3':60});await store.update({...read,weights:{'Chapter 1':25,'VOCAB N3':75}});assert.ok(updates.some(u=>u.range.includes('!I2')));assert.doesNotThrow(()=>parseRows([row]));assert.deepEqual((await store.read())[0].weights,{'Chapter 1':25,'VOCAB N3':75});assert.equal(row[9],'homework');});
test('Anki deck mappings resolve renamed method names without rewriting source',async()=>{const rows=[['Profiel','Deck','Lesmethode'],['User','Deck','Tobira H1']];const api={methodCatalog:[{...method,name:'Chapter 1',aliases:['Tobira H1']}],async request(path){return path.startsWith('?')?{sheets:[{properties:{title:'AnkiDecks'}}]}:{values:rows};}};assert.deepEqual(await new AnkiMappingsStore(api).read('User'),{Deck:'Chapter 1'});assert.equal(rows[1][2],'Tobira H1');});
test('tag text chooses contrasting foreground for light and dark custom colors',()=>{assert.equal(tagColors('#ffffff').foreground,'#17201c');assert.equal(tagColors('#000000').foreground,'#ffffff');});

test('group rename, membership and color update are atomic and preserve method details',async()=>{
 const rows=[METHOD_HEADERS,['a','Tobira H1','#31584a','Keep description','Tobira','[]','actief'],['b','Tobira H2','#31584a','','Tobira','[]','gearchiveerd'],['c','VOCAB N3','#68509c','','N3','[]','actief'],['d','Kanji','#985029','','N3','[]','actief']];let writes=[];
 const api={async request(path,options){if(path.startsWith('?'))return {sheets:[{properties:{title:'Leermethodes'}}]};if(!options)return {values:rows};const body=JSON.parse(options.body);if(path==='/values:batchUpdate'){writes.push(body);for(const update of body.data){const [,column,n]=update.range.match(/!([CE])(\d+):/);rows[Number(n)-1][column==='C'?2:4]=update.values[0][0];}}else {const n=Number(decodeURIComponent(path).match(/!A(\d+):H/)[1]);rows[n-1]=body.values[0];}return {};}};
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
