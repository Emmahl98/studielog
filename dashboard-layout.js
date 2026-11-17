export const ORDER_KINDS=['sections','goals','charts'];
const headers=['Onderdeel','Volgorde'];
export const emptyLayout=()=>({sections:['goals','charts'],goals:[],charts:[]});
export function validateOrder(kind,ids){
 if(!ORDER_KINDS.includes(kind)||!Array.isArray(ids)||ids.length>2000||ids.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(ids).size!==ids.length||(kind==='sections'&&(ids.length!==2||!ids.includes('goals')||!ids.includes('charts'))))throw Error('Ongeldige volgorde voor de Data-tab.');
}
export function ordered(items,ids=[]){const rank=new Map(ids.map((id,i)=>[id,i]));return items.map((item,i)=>({item,i})).sort((a,b)=>(rank.get(a.item.id)??Infinity)-(rank.get(b.item.id)??Infinity)||a.i-b.i).map(({item})=>item);}
export class LayoutStore{
 constructor(sheets){this.sheets=sheets;}
 range(value){return encodeURIComponent(`'DataIndeling'!${value}`);}
 async metadata(){return this.sheets.request('?fields=sheets.properties');}
 async read(){
  const meta=await this.metadata();if(!meta.sheets?.some(s=>s.properties.title==='DataIndeling'))return emptyLayout();
  const {values=[]}=await this.sheets.request(`/values/${this.range('A1:B4')}?valueRenderOption=UNFORMATTED_VALUE`);
  if(!headers.every((h,i)=>values[0]?.[i]===h)||values.length!==4)throw Error('De instellingen in DataIndeling zijn gewijzigd.');
  const layout=emptyLayout(),seen=new Set();for(const row of values.slice(1)){let ids;try{ids=JSON.parse(row[1]);}catch{throw Error('Ongeldige volgorde in DataIndeling.');}validateOrder(row[0],ids);if(seen.has(row[0]))throw Error('Dubbele instelling in DataIndeling.');seen.add(row[0]);layout[row[0]]=ids;}return layout;
 }
 async save(kind,ids){
  validateOrder(kind,ids);const layout=await this.read();layout[kind]=[...ids,...layout[kind].filter(id=>!ids.includes(id))];
  const meta=await this.metadata();const existing=meta.sheets?.find(s=>s.properties.title==='DataIndeling');
  if(!existing){let sheetId=872000;while(meta.sheets?.some(s=>s.properties.sheetId===sheetId))sheetId++;
   const rows=[headers,...ORDER_KINDS.map(key=>[key,JSON.stringify(layout[key])])];
   await this.sheets.request(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{sheetId,title:'DataIndeling',gridProperties:{rowCount:4,columnCount:2,frozenRowCount:1}}}},{updateCells:{range:{sheetId,startRowIndex:0,endRowIndex:4,startColumnIndex:0,endColumnIndex:2},rows:rows.map(row=>({values:row.map(value=>({userEnteredValue:{stringValue:value}}))})),fields:'userEnteredValue'}}]})});
  }else{const row=ORDER_KINDS.indexOf(kind)+2;await this.sheets.request(`/values/${this.range(`B${row}`)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[[JSON.stringify(layout[kind])]]})});}
  return this.read();
 }
}
