import {resolveMaterials} from './method-catalog.js?v=21';
import {materialList} from './materials.js';
export class AnkiMappingsStore {
  constructor(sheets,type='Deck'){
    this.sheets=sheets;
    this.title=type==='Tag'?'AnkiTags':'AnkiDecks';
    this.headers=['Profiel',type,'Lesmethode'];
  }
  range(value){return encodeURIComponent(`'${this.title}'!${value}`);}
  async rows(){
    const meta=await this.sheets.request('?fields=sheets.properties.title');
    if(!meta.sheets?.some(sheet=>sheet.properties?.title===this.title))return null;
    const result=await this.sheets.request(`/values/${this.range('A1:C')}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows=result.values||[];
    if(!this.headers.every((name,i)=>rows[0]?.[i]===name))throw Error(`De kolommen in ${this.title} zijn gewijzigd. Verwacht ${this.headers.join(', ')}.`);
    const seen=new Set();
    for(const row of rows.slice(1).filter(row=>row.some(Boolean))){
      if(row.length!==3||row.some(value=>typeof value!=='string'||!value.trim())||!materialList(row[2]).length)throw Error(`Ongeldige koppeling in ${this.title}.`);
      const key=JSON.stringify(row.slice(0,2));if(seen.has(key))throw Error(`Dubbele koppeling in ${this.title}.`);seen.add(key);
    }
    return rows.slice(1).filter(row=>row.some(Boolean));
  }
  async read(profile){return Object.fromEntries((await this.rows()||[]).filter(row=>row[0]===profile).map(row=>[row[1],resolveMaterials(row[2],this.sheets.methodCatalog||[])]));}
  async save(profile,mappings){
    if(typeof profile!=='string'||!profile)throw Error('Geen Anki-profiel gekozen.');
    for(const [name,method] of Object.entries(mappings))if(!name.trim()||typeof method!=='string'||!materialList(method).length||method.length>2000)throw Error('Kies lesmethodes (maximaal 2000 tekens per koppeling).');
    const old=await this.rows();
    if(old===null&&!Object.keys(mappings).length)return;
    if(old===null)await this.sheets.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:this.title}}}]})});
    const rows=[this.headers,...(old||[]).filter(row=>row[0]!==profile),...Object.entries(mappings).map(([name,method])=>[profile,name,materialList(method).join(', ')])];
    while(rows.length<(old?.length||0)+1)rows.push(['','','']);
    await this.sheets.request(`/values/${this.range(`A1:C${rows.length}`)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:rows})});
  }
}
