import {localDate,validDate} from './data.js';
import {materialList} from './materials.js';
export const CHART_HEADERS=['ID','Naam','Periode','Groepering','Weergave','Methode','Status','Van','Tot','Sortering','Doelkleuren'];
// Keep existing single-method settings readable; multiple choices share the same Sheet column.
export function selectedMethods(value){
  if(!value)return [];
  try {const parsed=JSON.parse(value);if(Array.isArray(parsed)&&parsed.every(m=>typeof m==='string'))return [...new Set(parsed)];}catch{}
  return [value];
}
export function validateChart(chart){
  if(chart.sort&&!['label-asc','label-desc','hours-asc','hours-desc'].includes(chart.sort))throw Error('Kies een geldige sortering.');
  if(!chart.id||!chart.name?.trim()||chart.name.length>100||!['1','3','7','30','90','all','custom'].includes(chart.period)||!['day','type','method'].includes(chart.group)||!['bar','line'].includes(chart.view)||typeof chart.method!=='string'||chart.method.length>2000)throw Error('Vul een geldige naam en grafiekinstellingen in.');
  if(chart.period==='custom'&&(!validDate(chart.from)||!validDate(chart.to)||chart.from>chart.to))throw Error('Kies een geldige begin- en einddatum.');
}
export function chartData(entries,chart,today=localDate()){
  let from=chart.from,to=chart.period==='custom'?chart.to:today;
  if(chart.period!=='custom'){if(chart.period==='all')from=entries.reduce((min,e)=>e.date<min?e.date:min,today);else {const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-Number(chart.period)+1);from=localDate(d);}}
  const methods=selectedMethods(chart.method);
  const selected=entries.filter(e=>e.date>=from&&e.date<=to&&(!methods.length||materialList(e.materials).some(m=>methods.includes(m))));
  const groups=new Map();
  // Calendar days, including days without study. Long ranges are grouped by month.
  const monthly=chart.group==='day'&&(new Date(to)-new Date(from))/86400000>120;
  if(chart.group==='day'){let d=new Date(`${from}T12:00:00`);const end=new Date(`${to}T12:00:00`);for(let i=0;d<=end&&i<37000;i++,d.setDate(d.getDate()+1)){const key=localDate(d).slice(0,monthly?7:10);groups.set(key,0);}}
  let minutes=0,missing=0;
  for(const e of selected){if(!Number.isFinite(e.minutes)){missing++;continue;}
    const keys=chart.group==='day'?[e.date.slice(0,monthly?7:10)]:chart.group==='type'?[e.type==='les'?'Les':'Sessie']:materialList(e.materials);
    if(!keys.length)keys.push('Niet ingevuld');
    const visible=chart.group==='method'&&methods.length?keys.filter(key=>methods.includes(key)):keys;
    minutes+=e.minutes*visible.length/keys.length;
    for(const key of visible)groups.set(key,(groups.get(key)||0)+e.minutes/keys.length);
  }
  const points=[...groups].map(([label,minutes])=>({label,hours:minutes/60}));const sort=chart.sort||(chart.group==='day'?'label-asc':'hours-desc');
  const collator=new Intl.Collator('nl',{numeric:true,sensitivity:'base'});
  points.sort((a,b)=>{const compared=sort.startsWith('hours')?a.hours-b.hours:collator.compare(a.label,b.label);return (sort.endsWith('desc')?-compared:compared)||collator.compare(a.label,b.label);});
  return{points,hours:minutes/60,count:selected.length,missing,from,to,monthly};
}
export class ChartStore{
 constructor(sheets){this.sheets=sheets;}
 range(value){return encodeURIComponent(`'Grafieken'!${value}`);}
 async read(){const {values=[]}=await this.sheets.request(`/values/${this.range('A1:K')}?valueRenderOption=UNFORMATTED_VALUE`);if(!CHART_HEADERS.every((h,i)=>values[0]?.[i]===h))throw Error('De kolommen in Grafieken zijn gewijzigd.');return values.slice(1).map((r,i)=>({r,i})).filter(({r})=>r.some(v=>v!=='')).map(({r,i})=>{const chart={id:r[0],name:r[1],period:String(r[2]),group:r[3],view:r[4],method:r[5]||'',status:r[6],from:r[7]||'',to:r[8]||'',sort:r[9]||'',goalColors:r[10]==='ja',rowNumber:i+2};validateChart(chart);if(!['actief','verwijderd'].includes(chart.status))throw Error('Ongeldige grafiekstatus.');return chart;});}
 values(c){return[c.id,c.name.trim(),c.period,c.group,c.view,c.method,c.status,c.from||'',c.to||'',c.sort||'',c.goalColors?'ja':''];}
 async save(chart){validateChart(chart);const matches=(await this.read()).filter(c=>c.id===chart.id);if(matches.length>1)throw Error('Dit grafiek-ID staat dubbel.');if(matches[0]?.status==='verwijderd')throw Error('Deze grafiek is verwijderd.');const value={...chart,status:'actief'};const range=matches.length?`A${matches[0].rowNumber}:K${matches[0].rowNumber}`:'A:K';await this.sheets.request(`/values/${this.range(range)}${matches.length?'?valueInputOption=RAW':':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'}`,{method:matches.length?'PUT':'POST',body:JSON.stringify({values:[this.values(value)]})});}
 async remove(id){const matches=(await this.read()).filter(c=>c.id===id);if(matches.length!==1)throw Error('Grafiek niet uniek gevonden.');const c=matches[0];await this.sheets.request(`/values/${this.range(`A${c.rowNumber}:K${c.rowNumber}`)}?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({values:[this.values({...c,status:'verwijderd'})]})});}
}

