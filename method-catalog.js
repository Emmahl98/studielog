import {methodShares} from './weights.js';
import {materialList} from './materials.js';
export const METHOD_HEADERS=['ID','Naam','Kleur','Omschrijving','Groep','Aliassen','Status','Type','JLPT-niveaus'];
export const JLPT_LEVELS=['N5','N4','N3','N2','N1'];
export const METHOD_TYPES=['Boek','Niveau algemeen'];
const key=value=>String(value).trim().toLocaleLowerCase('nl');
export function defaultGroup(name){const chapter=name.match(/^Tobira H\d+$/i);if(chapter)return 'Tobira';const book=name.match(/^H\d+【(.+)】$/);return book?book[1]:'';}
export function defaultColor(name){const colors=['#31584a','#68509c','#985029','#295f91','#8e3f66','#526323'];let hash=0;for(const c of defaultGroup(name)||name)hash=(hash*31+c.charCodeAt(0))>>>0;return colors[hash%colors.length];}
export function methodInfo(name,catalog=[]){const known=catalog.find(m=>[m.name,...m.aliases||[]].some(n=>key(n)===key(name)));if(known)return known;const group=defaultGroup(name),color=catalog.find(m=>group&&m.group===group)?.color||defaultColor(name);return {id:'',name,color,description:'',group,aliases:[],status:'actief',type:'',levels:[]};}
export function resolveMaterials(value,catalog=[]){return [...new Set(materialList(value).map(name=>methodInfo(name,catalog).name))].join(', ');}
export function resolveEntry(entry,catalog=[]){
 const materials=resolveMaterials(entry.materials,catalog);const source=materials!==entry.materials?{sourceMaterials:entry.materials,sourceWeights:entry.weights}:{};if(!entry.weights)return {...entry,...source,materials};
 const weights={};for(const [name,value] of Object.entries(entry.weights)){const canonical=methodInfo(name,catalog).name;weights[canonical]=(weights[canonical]||0)+value;}
 return {...entry,...source,materials,weights};
}
export function methodNames(catalog,entries=[],selected=[]){return [...new Set([...catalog.filter(m=>m.status==='actief').map(m=>m.name),...entries.flatMap(e=>materialList(e.materials)).filter(n=>methodInfo(n,catalog).status!=='gearchiveerd'),...selected].map(n=>methodInfo(n,catalog).name))].sort((a,b)=>{const ga=methodInfo(a,catalog).group||'Overig',gb=methodInfo(b,catalog).group||'Overig';return ga.localeCompare(gb,'nl',{numeric:true})||a.localeCompare(b,'nl',{numeric:true});});}
export function validateMethod(method,catalog=[]){
 if(!method.id||typeof method.name!=='string'||!method.name.trim()||method.name.length>100||/[,;\n]/.test(method.name)||!/^#[0-9a-f]{6}$/i.test(method.color)||typeof method.description!=='string'||method.description.length>1000||typeof method.group!=='string'||method.group.length>100||!Array.isArray(method.aliases)||method.aliases.some(a=>typeof a!=='string'||!a.trim()||/[,;\n]/.test(a))||!['actief','gearchiveerd'].includes(method.status))throw Error('Vul een naam (zonder komma), geldige kleur en maximaal 1000 tekens omschrijving in.');
 if(method.type!==undefined&&method.type!==''&&!METHOD_TYPES.includes(method.type))throw Error('Kies Boek of Niveau algemeen als type leermethode.');
 if(method.levels!==undefined&&(!Array.isArray(method.levels)||method.levels.some(level=>!JLPT_LEVELS.includes(level))))throw Error('Kies JLPT-niveaus van N5 tot en met N1.');
 const names=[method.name,...method.aliases].map(key);
 if(catalog.some(other=>other.id!==method.id&&[other.name,...other.aliases].some(n=>names.includes(key(n)))))throw Error('Deze naam is al in gebruik door een andere leermethode.');
}
export function levelShares(method){
 const levels=JLPT_LEVELS.filter(level=>method.levels?.includes(level));
 return levels.map(level=>[level,1/levels.length]);
}
export function hoursByLevel(entries,catalog){
 const minutes=new Map(JLPT_LEVELS.map(level=>[level,0]));
 const levelsByMethod=new Map();
 for(const method of catalog){
  const levels=levelShares(method);
  for(const name of [method.name,...method.aliases||[]])levelsByMethod.set(key(name),levels);
 }
 for(const entry of entries){
  if(!Number.isFinite(entry.minutes)||!entry.materials?.trim())continue;
  for(const [name,share] of methodShares(entry)){
   const levels=levelsByMethod.get(key(name));
   if(!levels?.length)continue;
   for(const [level,fraction] of levels)minutes.set(level,minutes.get(level)+entry.minutes*share*fraction);
  }
 }
 return new Map([...minutes].map(([level,total])=>[level,total/60]));
}
export class MethodsStore{
 constructor(sheets){this.sheets=sheets;}
 range(value){return encodeURIComponent(`'Leermethodes'!${value}`);}
 async read(){
  const meta=await this.sheets.request('?fields=sheets.properties(sheetId,title,gridProperties(columnCount))');
  this.sheet=meta.sheets?.find(s=>s.properties.title==='Leermethodes')?.properties;
  this.hasTypeHeader=false;
  this.hasLevelHeader=false;
  if(!this.sheet)return [];
  const columns=this.sheet.gridProperties?.columnCount??METHOD_HEADERS.length;
  const range=columns>=9?'A1:I':columns>=8?'A1:H':'A1:G';
  const {values=[]}=await this.sheets.request(`/values/${this.range(range)}?valueRenderOption=UNFORMATTED_VALUE`);
  const header=values[0];
  this.hasTypeHeader=header?.[7]==='Type';
  this.hasLevelHeader=header?.[8]===METHOD_HEADERS[8];
  if(!METHOD_HEADERS.slice(0,7).every((h,i)=>header?.[i]===h)||(!this.hasTypeHeader&&header[7])||(!this.hasLevelHeader&&header[8]))throw Error('De kolommen in Leermethodes zijn gewijzigd.');
  const result=values.slice(1).flatMap((r,i)=>{if(!r.some(v=>v!==''))return [];let aliases;try{aliases=JSON.parse(r[5]||'[]');}catch{throw Error('Ongeldige aliassen in Leermethodes.');}return [{id:r[0],name:r[1],color:r[2],description:r[3]||'',group:r[4]||'',aliases,status:r[6],type:r[7]??'',levels:String(r[8]??'').split(',').map(level=>level.trim()).filter(Boolean),rowNumber:i+2}];});
  const ids=new Set();for(const m of result){if(ids.has(m.id))throw Error('Dubbel leermethode-ID.');ids.add(m.id);validateMethod(m,result);}return result;
 }
 async ensureColumns(required){
  const columns=this.sheet?.gridProperties?.columnCount;
  if(columns===undefined||columns>=required)return;
  const appendDimension={sheetId:this.sheet.sheetId,dimension:'COLUMNS',length:required-columns};
  await this.sheets.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{appendDimension}]})});
 }
 async saveGroup({original='',name='',color,ids=[],remove=false,type='',levels=[]}){
  const catalog=await this.read(),selected=new Set(ids),target=name.trim();
  if(typeof original!=='string'||!Array.isArray(ids)||ids.some(id=>!catalog.some(m=>m.id===id))||(!remove&&(!/^#[0-9a-f]{6}$/i.test(color||'')||!target||target.length>100||/[\r\n]/.test(target)||target.toLocaleLowerCase('nl')==='overig'||!selected.size)))throw Error('Geef de groep een naam en kies minimaal één leermethode. Overig is gereserveerd voor methodes zonder groep.');
  if(remove&&!original)throw Error('Kies een bestaande groep om op te heffen.');
  if(!remove&&type!==''&&!METHOD_TYPES.includes(type))throw Error('Kies Boek of Niveau algemeen als type leermethode.');
  if(!remove&&(!Array.isArray(levels)||levels.some(level=>!JLPT_LEVELS.includes(level))))throw Error('Kies JLPT-niveaus van N5 tot en met N1.');
  const addLevels=!remove&&levels.length>0;
  const data=catalog.flatMap(m=>{
   const group=remove?(m.group===original?'':m.group):selected.has(m.id)?target:m.group===original&&original?'':m.group;
   const inGroup=!remove&&group===target;
   const added=inGroup&&addLevels&&levels.some(level=>!m.levels.includes(level));
   const nextLevels=added?JLPT_LEVELS.filter(level=>m.levels.includes(level)||levels.includes(level)).join(', '):'';
   return [
    ...(group===m.group?[]:[{range:`'Leermethodes'!E${m.rowNumber}:E${m.rowNumber}`,values:[[group]]}]),
    ...(inGroup&&m.color!==color?[{range:`'Leermethodes'!C${m.rowNumber}:C${m.rowNumber}`,values:[[color]]}]:[]),
    ...(inGroup&&type&&m.type!==type?[{range:`'Leermethodes'!H${m.rowNumber}:H${m.rowNumber}`,values:[[type]]}]:[]),
    ...(added?[{range:`'Leermethodes'!I${m.rowNumber}:I${m.rowNumber}`,values:[[nextLevels]]}]:[])
   ];
  });
  if(addLevels||(type&&!remove)){
   await this.ensureColumns(addLevels?9:8);
   if(!this.hasTypeHeader)data.unshift({range:"'Leermethodes'!H1",values:[[METHOD_HEADERS[7]]]});
   if(addLevels&&!this.hasLevelHeader)data.unshift({range:"'Leermethodes'!I1",values:[[METHOD_HEADERS[8]]]});
  }
  if(data.length)await this.sheets.request('/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
 }
 async save(method){
  const catalog=await this.read(),old=catalog.find(m=>m.id===method.id);
  const aliases=[...new Set([...(old?.aliases||[]),...(method.aliases||[]),...(old&&old.name!==method.name.trim()?[old.name]:[])])].filter(n=>key(n)!==key(method.name));
  const group=method.group.trim(),groupMember=group?catalog.find(m=>m.group.toLocaleLowerCase('nl')===group.toLocaleLowerCase('nl')):null;
  const value={...method,name:method.name.trim(),group:groupMember?.group||group,color:groupMember?.color||method.color,description:method.description.trim(),aliases,type:method.type??old?.type??'',levels:method.levels===undefined?(old?.levels??[]):method.levels};validateMethod(value,catalog);
  if(!catalog.length){
   const meta=await this.sheets.request('?fields=sheets.properties.title');
   if(!meta.sheets?.some(s=>s.properties.title==='Leermethodes')){
    await this.sheets.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:'Leermethodes'}}}]})});
    await this.sheets.request(`/values/${this.range('A1:I1')}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[METHOD_HEADERS]})});
    this.hasTypeHeader=true;
    this.hasLevelHeader=true;
   }
  }
  const writeLevels=this.hasLevelHeader||value.levels.length>0;
  if(!this.hasTypeHeader||(writeLevels&&!this.hasLevelHeader)){
   await this.ensureColumns(writeLevels?9:8);
   const first=this.hasTypeHeader?8:7;
   const end=writeLevels?9:8;
   const headerRange=first===8?'I1':writeLevels?'H1:I1':'H1';
   await this.sheets.request(`/values/${this.range(headerRange)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[METHOD_HEADERS.slice(first,end)]})});
  }
  const row=[value.id,value.name,value.color,value.description,value.group,JSON.stringify(value.aliases),value.status,value.type];
  if(writeLevels)row.push(JLPT_LEVELS.filter(level=>value.levels.includes(level)).join(', '));
  const values=[row],lastColumn=writeLevels?'I':'H';
  const range=old?`A${old.rowNumber}:${lastColumn}${old.rowNumber}`:`A:${lastColumn}`;
  await this.sheets.request(`/values/${this.range(range)}${old?'?valueInputOption=RAW':':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'}`,{method:old?'PUT':'POST',body:JSON.stringify({values})});
 }
}
