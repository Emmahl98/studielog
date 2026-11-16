import {materialList} from './materials.js';
const headers=['Profiel','Deck','Lesmethode'];
const range=value=>encodeURIComponent(`'AnkiDecks'!${value}`);
export class AnkiMappingsStore {
  constructor(sheets){this.sheets=sheets;}
  async rows(){
    const meta=await this.sheets.request('?fields=sheets.properties.title');
    if(!meta.sheets?.some(sheet=>sheet.properties?.title==='AnkiDecks'))return null;
    const result=await this.sheets.request(`/values/${range('A1:C')}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows=result.values||[];
    if(!headers.every((name,i)=>rows[0]?.[i]===name))throw Error('De kolommen in AnkiDecks zijn gewijzigd. Verwacht Profiel, Deck en Lesmethode.');
    const seen=new Set();
    for(const row of rows.slice(1).filter(row=>row.some(Boolean))){
      if(row.length!==3||row.some(value=>typeof value!=='string'||!value.trim())||!materialList(row[2]).length)throw Error('Ongeldige deckkoppeling in AnkiDecks.');
      const key=JSON.stringify(row.slice(0,2));if(seen.has(key))throw Error('Dubbele deckkoppeling in AnkiDecks.');seen.add(key);
    }
    return rows.slice(1).filter(row=>row.some(Boolean));
  }
  async read(profile){return Object.fromEntries((await this.rows()||[]).filter(row=>row[0]===profile).map(row=>[row[1],row[2]]));}
  async save(profile,mappings){
    if(typeof profile!=='string'||!profile)throw Error('Geen Anki-profiel gekozen.');
    for(const [deck,method] of Object.entries(mappings))if(!deck||typeof method!=='string'||!materialList(method).length||method.length>2000)throw Error('Kies lesmethodes per deck (maximaal 2000 tekens).');
    const old=await this.rows();
    if(old===null)await this.sheets.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:'AnkiDecks'}}}]})});
    const rows=[headers,...(old||[]).filter(row=>row[0]!==profile),...Object.entries(mappings).map(([deck,method])=>[profile,deck,materialList(method).join(', ')])];
    while(rows.length<(old?.length||0)+1)rows.push(['','','']);
    await this.sheets.request(`/values/${range(`A1:C${rows.length}`)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:rows})});
  }
}
